"""
Materialization Pipeline — Real Knowledge Graph Materialization
Transforms CanonicalGraphPayload instances from real Firebase and relational enterprise sources
into an auditable, idempotent, high-performance Neo4j Knowledge Graph.
"""

import logging
import time
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from app.domain.entities import CanonicalEntity, EntityCategory
from app.domain.relationships import CanonicalRelationship, CanonicalRelationshipType
from app.domain.provenance import ProvenanceMetadata, SourceType
from app.domain.confidence import ConfidenceMetadata
from app.domain.temporal import TemporalMetadata
from app.domain.graph import CanonicalGraphPayload
from app.ingestion.neo4j_writer import Neo4jWriter
from app.ingestion.firebase_mapper import build_firebase_canonical_payload
from app.ingestion.postgres_reader import (
    extract_companies,
    extract_suppliers,
    extract_people,
    extract_contracts,
    extract_sanctions,
    extract_countries,
    extract_company_directors,
    extract_supplier_relationships,
    extract_ownership,
)
from app.ingestion.normalizer import (
    normalize_companies,
    normalize_suppliers,
    normalize_people,
    normalize_countries,
    normalize_relationships,
)
from app.ingestion.mapper import build_canonical_graph_payload
from app.services.graph_projection import GraphProjectionService
from app.db.firebase import FirebaseConnection

logger = logging.getLogger("reasonchain.materialization")


class MaterializationPipeline:
    """
    Source-agnostic materialization orchestrator.
    Consumes canonical structures, verifies constraints, executes batched writes,
    profiles performance, and updates graph projection.
    """

    def __init__(self, batch_size: int = 500):
        self.batch_size = batch_size
        self.writer = Neo4jWriter(batch_size=batch_size)

    def materialize_canonical_payload(
        self,
        payload: CanonicalGraphPayload,
        sync_projection: bool = True
    ) -> Dict[str, Any]:
        """
        Materialize a CanonicalGraphPayload into the Knowledge Graph.
        Purely source-agnostic; zero source branching.
        """
        start_time = time.time()
        self.writer.ensure_constraints()

        write_result = self.writer.write_canonical_payload(
            payload=payload,
            sync_projection=sync_projection
        )

        elapsed = max(time.time() - start_time, 0.001)

        return {
            "status": "success",
            "entities_materialized": len(payload.entities),
            "relationships_materialized": len(payload.relationships),
            "nodes_written": write_result["nodes_written"],
            "relationships_written": write_result["relationships_written"],
            "duration_ms": int(elapsed * 1000),
            "entities_per_sec": round(len(payload.entities) / elapsed, 2),
            "relationships_per_sec": round(len(payload.relationships) / elapsed, 2),
            "metadata": payload.metadata,
        }

    def extract_firebase_synthetic_subgraph(self) -> CanonicalGraphPayload:
        """
        Extract synthetic test entities and relationships from /company_relationships.
        All entities and edges are explicitly marked with mock_record=True and is_synthetic=True.
        NOTE: Strictly ignores /company_reference as per specifications.
        """
        payload = CanonicalGraphPayload()

        try:
            rel_ref = FirebaseConnection.get_reference("/company_relationships")
            data = rel_ref.get()
            if not data or not isinstance(data, dict):
                return payload

            now_iso = datetime.now(timezone.utc).isoformat()

            # 1. Map Suppliers
            suppliers_data = data.get("suppliers", {})
            for s_id, s_info in suppliers_data.items():
                canon_id = f"firebase:synthetic:supplier:{s_id}"
                prov = ProvenanceMetadata(
                    source_system="firebase_synthetic",
                    source_type=SourceType.FIREBASE,
                    source_path=f"/company_relationships/suppliers/{s_id}",
                    source_record_id=s_id,
                    ingested_at=now_iso,
                    source_reliability=0.50,  # Lower reliability for mock data
                )
                payload.add_entity(CanonicalEntity(
                    canonical_id=canon_id,
                    entity_type=EntityCategory.SUPPLIER,
                    display_name=s_info.get("supplier_name", s_id),
                    properties={
                        "name": s_info.get("supplier_name", s_id),
                        "country": s_info.get("country", "India"),
                        "supplier_category": s_info.get("supplier_category", "Supplies"),
                        "mock_record": True,
                        "is_synthetic": True,
                        "status": "Synthetic/Test",
                    },
                    source_references=[prov],
                    confidence=ConfidenceMetadata(
                        entity_confidence=0.50,
                        mapping_confidence=0.50,
                        source_reliability=0.50,
                    )
                ))

            # 2. Map People
            people_data = data.get("people", {})
            for p_id, p_info in people_data.items():
                canon_id = f"firebase:synthetic:person:{p_id}"
                prov = ProvenanceMetadata(
                    source_system="firebase_synthetic",
                    source_type=SourceType.FIREBASE,
                    source_path=f"/company_relationships/people/{p_id}",
                    source_record_id=p_id,
                    ingested_at=now_iso,
                    source_reliability=0.50,
                )
                payload.add_entity(CanonicalEntity(
                    canonical_id=canon_id,
                    entity_type=EntityCategory.PERSON,
                    display_name=p_info.get("name", p_id),
                    properties={
                        "name": p_info.get("name", p_id),
                        "nationality": p_info.get("nationality", "India"),
                        "role": p_info.get("role", "Director"),
                        "mock_record": True,
                        "is_synthetic": True,
                    },
                    source_references=[prov],
                    confidence=ConfidenceMetadata(
                        entity_confidence=0.50,
                        mapping_confidence=0.50,
                        source_reliability=0.50,
                    )
                ))

            # 3. Map Contracts
            contracts_data = data.get("contracts", {})
            for c_id, c_info in contracts_data.items():
                canon_id = f"firebase:synthetic:contract:{c_id}"
                prov = ProvenanceMetadata(
                    source_system="firebase_synthetic",
                    source_type=SourceType.FIREBASE,
                    source_path=f"/company_relationships/contracts/{c_id}",
                    source_record_id=c_id,
                    ingested_at=now_iso,
                    source_reliability=0.50,
                )
                payload.add_entity(CanonicalEntity(
                    canonical_id=canon_id,
                    entity_type=EntityCategory.CONTRACT,
                    display_name=c_info.get("contract_reference", c_id),
                    properties={
                        "contract_reference": c_info.get("contract_reference", c_id),
                        "contract_type": c_info.get("contract_type", "Agreement"),
                        "start_date": c_info.get("start_date"),
                        "end_date": c_info.get("end_date"),
                        "status": c_info.get("status", "Active"),
                        "mock_record": True,
                        "is_synthetic": True,
                    },
                    source_references=[prov],
                    confidence=ConfidenceMetadata(
                        entity_confidence=0.50,
                        mapping_confidence=0.50,
                        source_reliability=0.50,
                    ),
                    temporal=TemporalMetadata(
                        valid_from=c_info.get("start_date"),
                        valid_to=c_info.get("end_date"),
                    )
                ))

            # 4. Map Sanctions
            sanctions_data = data.get("sanctions", {})
            for s_id, s_info in sanctions_data.items():
                canon_id = f"firebase:synthetic:sanction:{s_id}"
                prov = ProvenanceMetadata(
                    source_system="firebase_synthetic",
                    source_type=SourceType.FIREBASE,
                    source_path=f"/company_relationships/sanctions/{s_id}",
                    source_record_id=s_id,
                    ingested_at=now_iso,
                    source_reliability=0.50,
                )
                payload.add_entity(CanonicalEntity(
                    canonical_id=canon_id,
                    entity_type=EntityCategory.SANCTION,
                    display_name=s_info.get("list_name", s_id),
                    properties={
                        "list_name": s_info.get("list_name", s_id),
                        "jurisdiction": s_info.get("jurisdiction", "Synthetic"),
                        "status": s_info.get("status", "Listed"),
                        "mock_record": True,
                        "is_synthetic": True,
                    },
                    source_references=[prov],
                    confidence=ConfidenceMetadata(
                        entity_confidence=0.50,
                        mapping_confidence=0.50,
                        source_reliability=0.50,
                    )
                ))

            # 5. Map Relationships
            rels_list = data.get("relationships", {})
            if isinstance(rels_list, dict):
                raw_rels = list(rels_list.values())
            elif isinstance(rels_list, list):
                raw_rels = rels_list
            else:
                raw_rels = []

            for idx, r_item in enumerate(raw_rels):
                from_id_raw = r_item.get("from_entity_id")
                from_type = r_item.get("from_entity_type", "Person")
                to_cin = r_item.get("to_cin")
                to_source_key = r_item.get("to_source_key")
                to_type = r_item.get("to_entity_type", "Company")
                rel_type_raw = r_item.get("relationship_type", "DIRECTOR_OF")

                # Resolve canonical IDs
                from_canon = f"firebase:synthetic:{from_type.lower()}:{from_id_raw}"
                to_canon = f"firebase:companies:{to_cin}" if to_cin else f"firebase:companies:{to_source_key}"

                rel_id = f"synth_{from_canon}_{to_canon}_{rel_type_raw}_{idx}"
                prov = ProvenanceMetadata(
                    source_system="firebase_synthetic",
                    source_type=SourceType.FIREBASE,
                    source_path="/company_relationships/relationships",
                    source_record_id=str(idx),
                    observed_at=r_item.get("valid_from"),
                    ingested_at=now_iso,
                    source_reliability=0.50,
                )

                try:
                    rel_type_enum = CanonicalRelationshipType(rel_type_raw)
                except Exception:
                    rel_type_enum = CanonicalRelationshipType.CUSTOM

                payload.add_relationship(CanonicalRelationship(
                    relationship_id=rel_id,
                    relationship_type=rel_type_enum,
                    source_entity_id=from_canon,
                    source_entity_type=from_type,
                    target_entity_id=to_canon,
                    target_entity_type=to_type,
                    properties={
                        "role": r_item.get("role", "Director"),
                        "mock_record": True,
                        "is_synthetic": True,
                        "confidence": r_item.get("confidence", 0.50),
                    },
                    provenance=prov,
                    confidence=ConfidenceMetadata(
                        relationship_confidence=float(r_item.get("confidence", 0.50)),
                        source_reliability=0.50,
                    ),
                    temporal=TemporalMetadata(
                        valid_from=r_item.get("valid_from"),
                    )
                ))

        except Exception as ex:
            logger.warning(f"[MATERIALIZATION] Synthetic extraction notice: {ex}")

        return payload

    def materialize_firebase_graph(
        self,
        limit: int = 100,
        include_synthetic: bool = True
    ) -> Dict[str, Any]:
        """
        Materialize real Firebase /companies and synthetic /company_relationships.
        """
        logger.info(f"[MATERIALIZATION] Starting Firebase materialization (limit={limit}, synthetic={include_synthetic})")

        # 1. Extract real companies
        real_payload = build_firebase_canonical_payload(
            path="/companies",
            limit=limit,
            include_relationships=True,
            include_nested_entities=True,
        )

        # 2. Extract synthetic relationships if requested
        if include_synthetic:
            synth_payload = self.extract_firebase_synthetic_subgraph()
            for entity in synth_payload.entities:
                real_payload.add_entity(entity)
            for rel in synth_payload.relationships:
                real_payload.add_relationship(rel)

        # 3. Materialize via canonical engine
        return self.materialize_canonical_payload(real_payload)

    def materialize_relational_graph(self) -> Dict[str, Any]:
        """
        Materialize relational (PostgreSQL / local demo) dataset into the canonical graph.
        """
        logger.info("[MATERIALIZATION] Starting Relational materialization")
        norm_companies = normalize_companies(extract_companies())
        norm_suppliers = normalize_suppliers(extract_suppliers())
        norm_people = normalize_people(extract_people())
        norm_contracts = normalize_relationships(extract_contracts(), "contracts")
        norm_sanctions = normalize_relationships(extract_sanctions(), "sanctions")
        norm_countries = normalize_countries(extract_countries())
        norm_directors = normalize_relationships(extract_company_directors(), "company_directors")
        norm_supplier_rels = normalize_relationships(extract_supplier_relationships(), "supplier_relationships")
        norm_ownership = normalize_relationships(extract_ownership(), "ownership")

        payload = build_canonical_graph_payload(
            norm_countries=norm_countries,
            norm_companies=norm_companies,
            norm_suppliers=norm_suppliers,
            norm_people=norm_people,
            norm_contracts=norm_contracts,
            norm_sanctions=norm_sanctions,
            norm_directors=norm_directors,
            norm_supplier_rels=norm_supplier_rels,
            norm_ownership=norm_ownership,
        )

        return self.materialize_canonical_payload(payload)

    def materialize_all(self, firebase_limit: int = 100) -> Dict[str, Any]:
        """
        Materialize unified enterprise graph (Relational + Real Firebase + Synthetic Links).
        """
        start_time = time.time()
        res_rel = self.materialize_relational_graph()
        res_fb = self.materialize_firebase_graph(limit=firebase_limit, include_synthetic=True)

        elapsed = max(time.time() - start_time, 0.001)

        return {
            "status": "success",
            "relational_result": res_rel,
            "firebase_result": res_fb,
            "total_entities_in_cache": len(GraphProjectionService.get_all_entities()),
            "total_relationships_in_cache": len(GraphProjectionService.get_all_relationships()),
            "total_duration_ms": int(elapsed * 1000),
        }
