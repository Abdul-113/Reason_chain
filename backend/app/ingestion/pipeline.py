"""
Ingestion Pipeline — Central orchestrator for PostgreSQL -> Neo4j ingestion.

Flow:
    connect_to_postgres()
    -> extract_all()
    -> normalize()
    -> resolve_entities()
    -> write_nodes_to_neo4j()
    -> write_relationships_to_neo4j()
    -> validate_graph()
    -> return_ingestion_summary()
"""

import time
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone

from app.db.neo4j import Neo4jConnection
from app.ingestion.postgres_reader import (
    extract_countries,
    extract_companies,
    extract_suppliers,
    extract_people,
    extract_company_directors,
    extract_supplier_relationships,
    extract_ownership,
    extract_contracts,
    extract_sanctions,
)
from app.ingestion.normalizer import (
    normalize_companies,
    normalize_suppliers,
    normalize_people,
    normalize_countries,
    normalize_relationships,
    find_potential_duplicates,
)
from app.ingestion.mapper import (
    map_countries_to_nodes,
    map_companies_to_nodes,
    map_suppliers_to_nodes,
    map_people_to_nodes,
    map_contracts_to_nodes,
    map_sanctions_to_nodes,
    map_supplier_relationships,
    map_director_relationships,
    map_ownership_relationships,
    map_contract_relationships,
    map_sanction_relationships,
    map_located_in_relationships,
)
from app.ingestion.neo4j_writer import Neo4jWriter

logger = logging.getLogger("reasonchain.ingestion")

# Module-level state for tracking ingestion status
_last_ingestion_result: Optional[Dict[str, Any]] = None
_ingestion_running: bool = False


def get_last_ingestion_status() -> Optional[Dict[str, Any]]:
    """Return the last known ingestion result."""
    return _last_ingestion_result


def is_ingestion_running() -> bool:
    """Check if an ingestion job is currently in progress."""
    return _ingestion_running


def run_ingestion_pipeline() -> Dict[str, Any]:
    """
    Execute the full ingestion pipeline:
    PostgreSQL -> Extraction -> Normalization -> Entity Resolution -> Neo4j
    """
    global _last_ingestion_result, _ingestion_running

    if _ingestion_running:
        return {
            "status": "error",
            "message": "An ingestion job is already running.",
        }

    _ingestion_running = True
    start_time = time.time()
    result = {
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        # ===================================================
        # PHASE 1: TEST CONNECTIONS
        # ===================================================
        logger.info("[INGESTION] Phase 1: Testing connections")

        neo4j_check = Neo4jConnection.test_connection()
        if not neo4j_check["success"]:
            raise ConnectionError(f"Neo4j connection failed: {neo4j_check['message']}")
        logger.info("[INGESTION] Neo4j connected successfully")

        # ===================================================
        # PHASE 2: EXTRACTION
        # ===================================================
        logger.info("[INGESTION] Phase 2: Extracting data from PostgreSQL/SQLite")

        raw_countries = extract_countries()
        raw_companies = extract_companies()
        raw_suppliers = extract_suppliers()
        raw_people = extract_people()
        raw_directors = extract_company_directors()
        raw_supplier_rels = extract_supplier_relationships()
        raw_ownership = extract_ownership()
        raw_contracts = extract_contracts()
        raw_sanctions = extract_sanctions()

        extraction_summary = {
            "countries": len(raw_countries),
            "companies": len(raw_companies),
            "suppliers": len(raw_suppliers),
            "people": len(raw_people),
            "company_directors": len(raw_directors),
            "supplier_relationships": len(raw_supplier_rels),
            "ownership": len(raw_ownership),
            "contracts": len(raw_contracts),
            "sanctions": len(raw_sanctions),
        }
        logger.info(f"[INGESTION] Extraction complete: {sum(extraction_summary.values())} total records")

        # ===================================================
        # PHASE 3: NORMALIZATION
        # ===================================================
        logger.info("[INGESTION] Phase 3: Normalizing data")

        norm_countries = normalize_countries(raw_countries)
        norm_companies = normalize_companies(raw_companies)
        norm_suppliers = normalize_suppliers(raw_suppliers)
        norm_people = normalize_people(raw_people)
        norm_directors = normalize_relationships(raw_directors, "company_directors")
        norm_supplier_rels = normalize_relationships(raw_supplier_rels, "supplier_relationships")
        norm_ownership = normalize_relationships(raw_ownership, "ownership")
        norm_contracts = normalize_relationships(raw_contracts, "contracts")
        norm_sanctions = normalize_relationships(raw_sanctions, "sanctions")

        logger.info("[INGESTION] Normalization complete")

        # ===================================================
        # PHASE 4: ENTITY RESOLUTION (basic)
        # ===================================================
        logger.info("[INGESTION] Phase 4: Entity resolution")

        company_dupes = find_potential_duplicates(norm_companies)
        supplier_dupes = find_potential_duplicates(norm_suppliers)
        people_dupes = find_potential_duplicates(norm_people)

        duplicates_found = len(company_dupes) + len(supplier_dupes) + len(people_dupes)
        logger.info(f"[INGESTION] Entity resolution found {duplicates_found} potential duplicate groups")

        # ===================================================
        # PHASE 5: MAPPING
        # ===================================================
        logger.info("[INGESTION] Phase 5: Mapping to Neo4j graph model")

        all_nodes = []
        all_nodes.extend(map_countries_to_nodes(norm_countries))
        all_nodes.extend(map_companies_to_nodes(norm_companies))
        all_nodes.extend(map_suppliers_to_nodes(norm_suppliers))
        all_nodes.extend(map_people_to_nodes(norm_people))
        all_nodes.extend(map_contracts_to_nodes(norm_contracts))
        all_nodes.extend(map_sanctions_to_nodes(norm_sanctions))

        all_rels = []
        all_rels.extend(map_supplier_relationships(norm_supplier_rels))
        all_rels.extend(map_director_relationships(norm_directors))
        all_rels.extend(map_ownership_relationships(norm_ownership))
        all_rels.extend(map_contract_relationships(norm_contracts))
        all_rels.extend(map_sanction_relationships(norm_sanctions))
        all_rels.extend(map_located_in_relationships(norm_companies, norm_suppliers, norm_people))

        logger.info(f"[INGESTION] Mapped {len(all_nodes)} nodes and {len(all_rels)} relationships")

        # ===================================================
        # PHASE 6: WRITE TO NEO4J
        # ===================================================
        logger.info("[INGESTION] Phase 6: Writing to Neo4j")

        writer = Neo4jWriter()
        writer.ensure_constraints()

        nodes_written = writer.write_nodes(all_nodes)
        rels_written = writer.write_relationships(all_rels)

        logger.info(f"[INGESTION] Wrote {nodes_written} nodes and {rels_written} relationships to Neo4j")

        # ===================================================
        # PHASE 7: VALIDATION
        # ===================================================
        logger.info("[INGESTION] Phase 7: Validating graph")

        validation = validate_graph()
        logger.info(f"[INGESTION] Validation: {validation['status']}")

        # ===================================================
        # BUILD RESULT
        # ===================================================
        duration = round(time.time() - start_time, 2)
        writer_stats = writer.get_stats()

        result = {
            "status": "success" if validation["status"] == "passed" else "completed_with_warnings",
            "nodes_created": writer_stats["nodes_created"],
            "nodes_updated": writer_stats.get("nodes_updated", 0),
            "relationships_created": writer_stats["relationships_created"],
            "relationships_updated": writer_stats.get("relationships_updated", 0),
            "errors": [],
            "duration_seconds": duration,
            "started_at": result["started_at"],
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "extraction": extraction_summary,
            "duplicates_detected": duplicates_found,
            "duplicate_groups": {
                "companies": company_dupes,
                "suppliers": supplier_dupes,
                "people": people_dupes,
            },
            "validation": validation,
        }

        logger.info(f"[INGESTION] SUCCESS - Pipeline completed in {duration}s")

    except ConnectionError as e:
        duration = round(time.time() - start_time, 2)
        result = {
            "status": "error",
            "duration_seconds": duration,
            "error": str(e),
            "error_type": "connection_error",
        }
        logger.error(f"[INGESTION] Connection error: {e}")

    except Exception as e:
        duration = round(time.time() - start_time, 2)
        result = {
            "status": "error",
            "duration_seconds": duration,
            "error": str(e),
            "error_type": type(e).__name__,
        }
        logger.error(f"[INGESTION] Pipeline failed: {e}", exc_info=True)

    finally:
        _ingestion_running = False
        _last_ingestion_result = result

    return result


def validate_graph() -> Dict[str, Any]:
    """
    Validate the Neo4j graph after ingestion.
    Checks node counts, relationship counts, and the main demo chain.
    """
    checks = {}
    all_passed = True

    try:
        # Node counts
        for label in ["Company", "Supplier", "Person", "Contract", "Sanction", "Country"]:
            rows = Neo4jConnection.execute_query(f"MATCH (n:{label}) RETURN count(n) AS cnt")
            checks[f"{label.lower()}_count"] = rows[0]["cnt"] if rows else 0

        # Relationship counts
        for rel_type in ["SUPPLIES", "HAS_DIRECTOR", "DIRECTOR_OF", "OWNS", "HAS_CONTRACT", "SANCTIONED_BY", "LOCATED_IN"]:
            rows = Neo4jConnection.execute_query(f"MATCH ()-[r:{rel_type}]->() RETURN count(r) AS cnt")
            checks[f"rel_{rel_type.lower()}_count"] = rows[0]["cnt"] if rows else 0

        # Constraint count
        rows = Neo4jConnection.execute_query("SHOW CONSTRAINTS")
        checks["constraints"] = len(rows)

        # MAIN DEMO CHAIN: ABC Industrial Supplies -> Acme -> Rahul Mehta -> Orion Trading -> Sanction
        chain_query = """
        MATCH (s:Supplier {name: 'ABC Industrial Supplies'})
              -[:SUPPLIES]->(c1:Company {name: 'Acme Manufacturing'})
              -[:HAS_DIRECTOR]->(p:Person {full_name: 'Rahul Mehta'})
              -[:DIRECTOR_OF]->(c2:Company {name: 'Orion Trading'})
              -[:SANCTIONED_BY]->(sn:Sanction)
        RETURN s.name AS supplier,
               c1.name AS company1,
               p.full_name AS person,
               c2.name AS company2,
               sn.authority AS sanction_authority
        """
        chain_rows = Neo4jConnection.execute_query(chain_query)
        checks["main_demo_chain_found"] = len(chain_rows) > 0

        if not checks["main_demo_chain_found"]:
            all_passed = False
            logger.warning("[INGESTION] VALIDATION WARNING: Main demo chain not found!")
        else:
            logger.info("[INGESTION] Main demo chain verified: ABC Industrial Supplies -> Acme -> Rahul Mehta -> Orion Trading -> OFAC SDN")

        # Minimum node checks
        if checks.get("company_count", 0) < 20:
            all_passed = False
        if checks.get("supplier_count", 0) < 15:
            all_passed = False

    except Exception as e:
        checks["error"] = str(e)
        all_passed = False
        logger.error(f"[INGESTION] Validation error: {e}")

    checks["status"] = "passed" if all_passed else "failed"
    return checks
