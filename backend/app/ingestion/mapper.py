"""
Entity Mapper — Maps normalized PostgreSQL records to Neo4j node/relationship structures.
Defines the explicit graph model mapping.
"""

import logging
from typing import List, Dict, Any

logger = logging.getLogger("reasonchain.ingestion")


# =============================================================================
# NODE MAPPING
# =============================================================================

def map_countries_to_nodes(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Map countries rows to :Country nodes."""
    nodes = []
    for r in rows:
        nodes.append({
            "label": "Country",
            "key_field": "code",
            "properties": {
                "code": r.get("code"),
                "name": r.get("name"),
                "risk_level": r.get("risk_level"),
            }
        })
    return nodes


def map_companies_to_nodes(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Map companies rows to :Company nodes."""
    nodes = []
    for r in rows:
        nodes.append({
            "label": "Company",
            "key_field": "id",
            "properties": {
                "id": r.get("id"),
                "name": r.get("name"),
                "country": r.get("country"),
                "industry": r.get("industry"),
                "status": r.get("status"),
                "registration_number": r.get("registration_number"),
                "_normalized_name": r.get("_normalized_name"),
            }
        })
    return nodes


def map_suppliers_to_nodes(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Map suppliers rows to :Supplier nodes."""
    nodes = []
    for r in rows:
        nodes.append({
            "label": "Supplier",
            "key_field": "id",
            "properties": {
                "id": r.get("id"),
                "name": r.get("name"),
                "country": r.get("country"),
                "status": r.get("status"),
                "supplier_type": r.get("supplier_type"),
                "risk_level": r.get("risk_level"),
                "_normalized_name": r.get("_normalized_name"),
            }
        })
    return nodes


def map_people_to_nodes(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Map people rows to :Person nodes."""
    nodes = []
    for r in rows:
        nodes.append({
            "label": "Person",
            "key_field": "id",
            "properties": {
                "id": r.get("id"),
                "full_name": r.get("full_name"),
                "country": r.get("country"),
                "role": r.get("role"),
                "status": r.get("status"),
                "_normalized_name": r.get("_normalized_name"),
            }
        })
    return nodes


def map_contracts_to_nodes(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Map contracts rows to :Contract nodes."""
    nodes = []
    for r in rows:
        nodes.append({
            "label": "Contract",
            "key_field": "id",
            "properties": {
                "id": r.get("id"),
                "contract_number": r.get("contract_number"),
                "contract_type": r.get("contract_type"),
                "start_date": r.get("start_date"),
                "end_date": r.get("end_date"),
                "status": r.get("status"),
                "value": float(r["value"]) if r.get("value") is not None else None,
                "source": r.get("source"),
            }
        })
    return nodes


def map_sanctions_to_nodes(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Map sanctions rows to :Sanction nodes."""
    nodes = []
    for r in rows:
        nodes.append({
            "label": "Sanction",
            "key_field": "id",
            "properties": {
                "id": r.get("id"),
                "entity_type": r.get("entity_type"),
                "authority": r.get("authority"),
                "listed_date": r.get("listed_date"),
                "delisted_date": r.get("delisted_date"),
                "status": r.get("status"),
                "source": r.get("source"),
            }
        })
    return nodes


# =============================================================================
# RELATIONSHIP MAPPING
# =============================================================================

def map_supplier_relationships(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Map supplier_relationships to :Supplier -[:SUPPLIES]-> :Company
    Also handles CONTRACTED_WITH type as SUPPLIES (same semantic in graph).
    """
    rels = []
    for r in rows:
        rel_type = r.get("relationship_type", "SUPPLIES")
        # Map CONTRACTED_WITH to SUPPLIES for graph simplicity, preserve original in props
        graph_rel_type = "SUPPLIES"
        rels.append({
            "rel_type": graph_rel_type,
            "from_label": "Supplier",
            "from_key": "id",
            "from_value": r.get("supplier_id"),
            "to_label": "Company",
            "to_key": "id",
            "to_value": r.get("company_id"),
            "properties": {
                "relationship_id": r.get("id"),
                "original_type": rel_type,
                "start_date": r.get("start_date"),
                "end_date": r.get("end_date"),
                "source": r.get("source"),
                "confidence": float(r["confidence"]) if r.get("confidence") is not None else None,
            }
        })
    return rels


def map_director_relationships(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Map company_directors to:
      (:Company)-[:HAS_DIRECTOR]->(:Person)
      (:Person)-[:DIRECTOR_OF]->(:Company)
    """
    rels = []
    for r in rows:
        # Company -> HAS_DIRECTOR -> Person
        rels.append({
            "rel_type": "HAS_DIRECTOR",
            "from_label": "Company",
            "from_key": "id",
            "from_value": r.get("company_id"),
            "to_label": "Person",
            "to_key": "id",
            "to_value": r.get("person_id"),
            "properties": {
                "relationship_id": r.get("id"),
                "role": r.get("role"),
                "valid_from": r.get("valid_from"),
                "valid_to": r.get("valid_to"),
                "source": r.get("source"),
            }
        })
        # Person -> DIRECTOR_OF -> Company (reverse semantic)
        rels.append({
            "rel_type": "DIRECTOR_OF",
            "from_label": "Person",
            "from_key": "id",
            "from_value": r.get("person_id"),
            "to_label": "Company",
            "to_key": "id",
            "to_value": r.get("company_id"),
            "properties": {
                "relationship_id": r.get("id"),
                "role": r.get("role"),
                "valid_from": r.get("valid_from"),
                "valid_to": r.get("valid_to"),
                "source": r.get("source"),
            }
        })
    return rels


def map_ownership_relationships(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Map ownership to (:Company)-[:OWNS]->(:Company)."""
    rels = []
    for r in rows:
        rels.append({
            "rel_type": "OWNS",
            "from_label": "Company",
            "from_key": "id",
            "from_value": r.get("owner_company_id"),
            "to_label": "Company",
            "to_key": "id",
            "to_value": r.get("owned_company_id"),
            "properties": {
                "relationship_id": r.get("id"),
                "ownership_percentage": float(r["ownership_percentage"]) if r.get("ownership_percentage") is not None else None,
                "valid_from": r.get("valid_from"),
                "valid_to": r.get("valid_to"),
                "source": r.get("source"),
                "confidence": float(r["confidence"]) if r.get("confidence") is not None else None,
            }
        })
    return rels


def map_contract_relationships(raw_contracts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Map contracts to (:Supplier)-[:HAS_CONTRACT]->(:Company) with contract node."""
    rels = []
    for r in raw_contracts:
        # Supplier -> HAS_CONTRACT -> Company
        if r.get("supplier_id") and r.get("company_id"):
            rels.append({
                "rel_type": "HAS_CONTRACT",
                "from_label": "Supplier",
                "from_key": "id",
                "from_value": r.get("supplier_id"),
                "to_label": "Company",
                "to_key": "id",
                "to_value": r.get("company_id"),
                "properties": {
                    "contract_id": r.get("id"),
                    "contract_number": r.get("contract_number"),
                    "contract_type": r.get("contract_type"),
                    "start_date": r.get("start_date"),
                    "end_date": r.get("end_date"),
                    "status": r.get("status"),
                    "value": float(r["value"]) if r.get("value") is not None else None,
                    "source": r.get("source"),
                }
            })
    return rels


def map_sanction_relationships(raw_sanctions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Map sanctions to:
      (:Company)-[:SANCTIONED_BY]->(:Sanction) when company_id set
      (:Person)-[:SANCTIONED_BY]->(:Sanction) when person_id set
    """
    rels = []
    for r in raw_sanctions:
        entity_type = r.get("entity_type")
        if entity_type == "company" and r.get("company_id"):
            rels.append({
                "rel_type": "SANCTIONED_BY",
                "from_label": "Company",
                "from_key": "id",
                "from_value": r.get("company_id"),
                "to_label": "Sanction",
                "to_key": "id",
                "to_value": r.get("id"),
                "properties": {
                    "authority": r.get("authority"),
                    "listed_date": r.get("listed_date"),
                    "delisted_date": r.get("delisted_date"),
                    "status": r.get("status"),
                    "source": r.get("source"),
                }
            })
        elif entity_type == "person" and r.get("person_id"):
            rels.append({
                "rel_type": "SANCTIONED_BY",
                "from_label": "Person",
                "from_key": "id",
                "from_value": r.get("person_id"),
                "to_label": "Sanction",
                "to_key": "id",
                "to_value": r.get("id"),
                "properties": {
                    "authority": r.get("authority"),
                    "listed_date": r.get("listed_date"),
                    "delisted_date": r.get("delisted_date"),
                    "status": r.get("status"),
                    "source": r.get("source"),
                }
            })
    return rels


def map_located_in_relationships(
    companies: List[Dict[str, Any]],
    suppliers: List[Dict[str, Any]],
    people: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Map LOCATED_IN relationships for companies, suppliers, and people."""
    rels = []
    for c in companies:
        if c.get("country"):
            rels.append({
                "rel_type": "LOCATED_IN",
                "from_label": "Company",
                "from_key": "id",
                "from_value": c.get("id"),
                "to_label": "Country",
                "to_key": "code",
                "to_value": c.get("country"),
                "properties": {}
            })
    for s in suppliers:
        if s.get("country"):
            rels.append({
                "rel_type": "LOCATED_IN",
                "from_label": "Supplier",
                "from_key": "id",
                "from_value": s.get("id"),
                "to_label": "Country",
                "to_key": "code",
                "to_value": s.get("country"),
                "properties": {}
            })
    for p in people:
        if p.get("country"):
            rels.append({
                "rel_type": "LOCATED_IN",
                "from_label": "Person",
                "from_key": "id",
                "from_value": p.get("id"),
                "to_label": "Country",
                "to_key": "code",
                "to_value": p.get("country"),
                "properties": {}
            })
    return rels
