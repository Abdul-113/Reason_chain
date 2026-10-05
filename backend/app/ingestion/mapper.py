"""
Entity & Relationship Mapper — Maps raw PostgreSQL records to Canonical ReasonChain Models.
Acts as a source-specific adapter translating PostgreSQL relational schemas into Canonical Entities,
Relationships, and Provenance records before persisting to Neo4j.
"""

import logging
from typing import List, Dict, Any
from app.domain.provenance import ProvenanceMetadata, SourceType
from app.domain.confidence import ConfidenceMetadata
from app.domain.temporal import TemporalMetadata
from app.domain.entities import CanonicalEntity, EntityCategory
from app.domain.relationships import CanonicalRelationship, CanonicalRelationshipType
from app.domain.graph import CanonicalGraphPayload

logger = logging.getLogger("reasonchain.ingestion")


# =============================================================================
# CANONICAL ENTITY MAPPERS
# =============================================================================

def map_countries_to_canonical(rows: List[Dict[str, Any]]) -> List[CanonicalEntity]:
    """Map country database rows to CanonicalEntity objects."""
    entities = []
    for r in rows:
        code = str(r.get("code", ""))
        prov = ProvenanceMetadata(
            source_system="postgres",
            source_type=SourceType.POSTGRES,
            source_table="countries",
            source_record_id=code,
        )
        entity = CanonicalEntity(
            canonical_id=code,
            entity_type=EntityCategory.COUNTRY,
            display_name=r.get("name") or code,
            properties={
                "code": code,
                "name": r.get("name"),
                "risk_level": r.get("risk_level"),
            },
            source_references=[prov],
        )
        entities.append(entity)
    return entities


def map_companies_to_canonical(rows: List[Dict[str, Any]]) -> List[CanonicalEntity]:
    """Map company database rows to CanonicalEntity objects."""
    entities = []
    for r in rows:
        cid = str(r.get("id", ""))
        prov = ProvenanceMetadata(
            source_system="postgres",
            source_type=SourceType.POSTGRES,
            source_table="companies",
            source_record_id=cid,
        )
        entity = CanonicalEntity(
            canonical_id=cid,
            entity_type=EntityCategory.COMPANY,
            display_name=r.get("name") or cid,
            properties={
                "id": cid,
                "name": r.get("name"),
                "country": r.get("country"),
                "industry": r.get("industry"),
                "status": r.get("status"),
                "registration_number": r.get("registration_number"),
                "_normalized_name": r.get("_normalized_name"),
            },
            source_references=[prov],
        )
        entities.append(entity)
    return entities


def map_suppliers_to_canonical(rows: List[Dict[str, Any]]) -> List[CanonicalEntity]:
    """Map supplier database rows to CanonicalEntity objects."""
    entities = []
    for r in rows:
        sid = str(r.get("id", ""))
        prov = ProvenanceMetadata(
            source_system="postgres",
            source_type=SourceType.POSTGRES,
            source_table="suppliers",
            source_record_id=sid,
        )
        entity = CanonicalEntity(
            canonical_id=sid,
            entity_type=EntityCategory.SUPPLIER,
            display_name=r.get("name") or sid,
            properties={
                "id": sid,
                "name": r.get("name"),
                "country": r.get("country"),
                "status": r.get("status"),
                "supplier_type": r.get("supplier_type"),
                "risk_level": r.get("risk_level"),
                "_normalized_name": r.get("_normalized_name"),
            },
            source_references=[prov],
        )
        entities.append(entity)
    return entities


def map_people_to_canonical(rows: List[Dict[str, Any]]) -> List[CanonicalEntity]:
    """Map people database rows to CanonicalEntity objects."""
    entities = []
    for r in rows:
        pid = str(r.get("id", ""))
        prov = ProvenanceMetadata(
            source_system="postgres",
            source_type=SourceType.POSTGRES,
            source_table="people",
            source_record_id=pid,
        )
        entity = CanonicalEntity(
            canonical_id=pid,
            entity_type=EntityCategory.PERSON,
            display_name=r.get("full_name") or pid,
            properties={
                "id": pid,
                "full_name": r.get("full_name"),
                "country": r.get("country"),
                "role": r.get("role"),
                "status": r.get("status"),
                "_normalized_name": r.get("_normalized_name"),
            },
            source_references=[prov],
        )
        entities.append(entity)
    return entities


def map_contracts_to_canonical(rows: List[Dict[str, Any]]) -> List[CanonicalEntity]:
    """Map contract database rows to CanonicalEntity objects."""
    entities = []
    for r in rows:
        ct_id = str(r.get("id", ""))
        prov = ProvenanceMetadata(
            source_system="postgres",
            source_type=SourceType.POSTGRES,
            source_table="contracts",
            source_record_id=ct_id,
        )
        val = float(r["value"]) if r.get("value") is not None else None
        temporal = TemporalMetadata(
            valid_from=r.get("start_date"),
            valid_to=r.get("end_date"),
        )
        entity = CanonicalEntity(
            canonical_id=ct_id,
            entity_type=EntityCategory.CONTRACT,
            display_name=r.get("contract_number") or ct_id,
            properties={
                "id": ct_id,
                "contract_number": r.get("contract_number"),
                "contract_type": r.get("contract_type"),
                "start_date": r.get("start_date"),
                "end_date": r.get("end_date"),
                "status": r.get("status"),
                "value": val,
                "source": r.get("source"),
            },
            source_references=[prov],
            temporal=temporal,
        )
        entities.append(entity)
    return entities


def map_sanctions_to_canonical(rows: List[Dict[str, Any]]) -> List[CanonicalEntity]:
    """Map sanction database rows to CanonicalEntity objects."""
    entities = []
    for r in rows:
        sn_id = str(r.get("id", ""))
        prov = ProvenanceMetadata(
            source_system="postgres",
            source_type=SourceType.POSTGRES,
            source_table="sanctions",
            source_record_id=sn_id,
        )
        temporal = TemporalMetadata(
            valid_from=r.get("listed_date"),
            valid_to=r.get("delisted_date"),
        )
        entity = CanonicalEntity(
            canonical_id=sn_id,
            entity_type=EntityCategory.SANCTION,
            display_name=f"Sanction ({r.get('authority', 'OFAC')})",
            properties={
                "id": sn_id,
                "entity_type": r.get("entity_type"),
                "authority": r.get("authority"),
                "listed_date": r.get("listed_date"),
                "delisted_date": r.get("delisted_date"),
                "status": r.get("status"),
                "source": r.get("source"),
            },
            source_references=[prov],
            temporal=temporal,
        )
        entities.append(entity)
    return entities


# Backward compatible node mappers returning dictionary structs
def map_countries_to_nodes(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [e.to_neo4j_node_dict() for e in map_countries_to_canonical(rows)]

def map_companies_to_nodes(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [e.to_neo4j_node_dict() for e in map_companies_to_canonical(rows)]

def map_suppliers_to_nodes(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [e.to_neo4j_node_dict() for e in map_suppliers_to_canonical(rows)]

def map_people_to_nodes(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [e.to_neo4j_node_dict() for e in map_people_to_canonical(rows)]

def map_contracts_to_nodes(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [e.to_neo4j_node_dict() for e in map_contracts_to_canonical(rows)]

def map_sanctions_to_nodes(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [e.to_neo4j_node_dict() for e in map_sanctions_to_canonical(rows)]


# =============================================================================
# CANONICAL RELATIONSHIP MAPPERS
# =============================================================================

def map_supplier_relationships_to_canonical(rows: List[Dict[str, Any]]) -> List[CanonicalRelationship]:
    """Map supplier_relationships rows to CanonicalRelationship objects."""
    rels = []
    for r in rows:
        rel_id = str(r.get("id") or f"{r.get('supplier_id')}-{r.get('company_id')}-SUPPLIES")
        prov = ProvenanceMetadata(
            source_system="postgres",
            source_type=SourceType.POSTGRES,
            source_table="supplier_relationships",
            source_record_id=str(r.get("id", "")),
        )
        conf_val = float(r["confidence"]) if r.get("confidence") is not None else 1.0
        conf = ConfidenceMetadata(relationship_confidence=conf_val)
        temporal = TemporalMetadata(valid_from=r.get("start_date"), valid_to=r.get("end_date"))

        rel = CanonicalRelationship(
            relationship_id=rel_id,
            relationship_type=CanonicalRelationshipType.SUPPLIES,
            source_entity_id=str(r.get("supplier_id")),
            source_entity_type="Supplier",
            target_entity_id=str(r.get("company_id")),
            target_entity_type="Company",
            properties={
                "original_type": r.get("relationship_type", "SUPPLIES"),
                "start_date": r.get("start_date"),
                "end_date": r.get("end_date"),
                "source": r.get("source"),
                "confidence": conf_val,
            },
            provenance=prov,
            confidence=conf,
            temporal=temporal,
        )
        rels.append(rel)
    return rels


def map_director_relationships_to_canonical(rows: List[Dict[str, Any]]) -> List[CanonicalRelationship]:
    """Map company_directors rows to CanonicalRelationship objects."""
    rels = []
    for r in rows:
        base_id = str(r.get("id") or f"{r.get('company_id')}-{r.get('person_id')}")
        prov = ProvenanceMetadata(
            source_system="postgres",
            source_type=SourceType.POSTGRES,
            source_table="company_directors",
            source_record_id=str(r.get("id", "")),
        )
        temporal = TemporalMetadata(valid_from=r.get("valid_from"), valid_to=r.get("valid_to"))

        # Company -> HAS_DIRECTOR -> Person
        rels.append(CanonicalRelationship(
            relationship_id=f"{base_id}-HAS_DIRECTOR",
            relationship_type=CanonicalRelationshipType.HAS_DIRECTOR,
            source_entity_id=str(r.get("company_id")),
            source_entity_type="Company",
            target_entity_id=str(r.get("person_id")),
            target_entity_type="Person",
            properties={
                "role": r.get("role"),
                "valid_from": r.get("valid_from"),
                "valid_to": r.get("valid_to"),
                "source": r.get("source"),
            },
            provenance=prov,
            temporal=temporal,
        ))

        # Person -> DIRECTOR_OF -> Company
        rels.append(CanonicalRelationship(
            relationship_id=f"{base_id}-DIRECTOR_OF",
            relationship_type=CanonicalRelationshipType.DIRECTOR_OF,
            source_entity_id=str(r.get("person_id")),
            source_entity_type="Person",
            target_entity_id=str(r.get("company_id")),
            target_entity_type="Company",
            properties={
                "role": r.get("role"),
                "valid_from": r.get("valid_from"),
                "valid_to": r.get("valid_to"),
                "source": r.get("source"),
            },
            provenance=prov,
            temporal=temporal,
        ))
    return rels


def map_ownership_relationships_to_canonical(rows: List[Dict[str, Any]]) -> List[CanonicalRelationship]:
    """Map ownership rows to CanonicalRelationship objects."""
    rels = []
    for r in rows:
        rel_id = str(r.get("id") or f"{r.get('owner_company_id')}-{r.get('owned_company_id')}-OWNS")
        prov = ProvenanceMetadata(
            source_system="postgres",
            source_type=SourceType.POSTGRES,
            source_table="ownership",
            source_record_id=str(r.get("id", "")),
        )
        pct = float(r["ownership_percentage"]) if r.get("ownership_percentage") is not None else None
        conf_val = float(r["confidence"]) if r.get("confidence") is not None else 1.0
        conf = ConfidenceMetadata(relationship_confidence=conf_val)
        temporal = TemporalMetadata(valid_from=r.get("valid_from"), valid_to=r.get("valid_to"))

        rel = CanonicalRelationship(
            relationship_id=rel_id,
            relationship_type=CanonicalRelationshipType.OWNS,
            source_entity_id=str(r.get("owner_company_id")),
            source_entity_type="Company",
            target_entity_id=str(r.get("owned_company_id")),
            target_entity_type="Company",
            properties={
                "ownership_percentage": pct,
                "valid_from": r.get("valid_from"),
                "valid_to": r.get("valid_to"),
                "source": r.get("source"),
                "confidence": conf_val,
            },
            provenance=prov,
            confidence=conf,
            temporal=temporal,
        )
        rels.append(rel)
    return rels


def map_contract_relationships_to_canonical(raw_contracts: List[Dict[str, Any]]) -> List[CanonicalRelationship]:
    """Map contract records to HAS_CONTRACT CanonicalRelationship objects."""
    rels = []
    for r in raw_contracts:
        if r.get("supplier_id") and r.get("company_id"):
            rel_id = f"{r.get('supplier_id')}-{r.get('company_id')}-HAS_CONTRACT-{r.get('id')}"
            prov = ProvenanceMetadata(
                source_system="postgres",
                source_type=SourceType.POSTGRES,
                source_table="contracts",
                source_record_id=str(r.get("id", "")),
            )
            temporal = TemporalMetadata(valid_from=r.get("start_date"), valid_to=r.get("end_date"))

            rel = CanonicalRelationship(
                relationship_id=rel_id,
                relationship_type=CanonicalRelationshipType.HAS_CONTRACT,
                source_entity_id=str(r.get("supplier_id")),
                source_entity_type="Supplier",
                target_entity_id=str(r.get("company_id")),
                target_entity_type="Company",
                properties={
                    "contract_id": r.get("id"),
                    "contract_number": r.get("contract_number"),
                    "contract_type": r.get("contract_type"),
                    "start_date": r.get("start_date"),
                    "end_date": r.get("end_date"),
                    "status": r.get("status"),
                    "value": float(r["value"]) if r.get("value") is not None else None,
                    "source": r.get("source"),
                },
                provenance=prov,
                temporal=temporal,
            )
            rels.append(rel)
    return rels


def map_sanction_relationships_to_canonical(raw_sanctions: List[Dict[str, Any]]) -> List[CanonicalRelationship]:
    """Map sanction records to SANCTIONED_BY CanonicalRelationship objects."""
    rels = []
    for r in raw_sanctions:
        entity_type = r.get("entity_type")
        prov = ProvenanceMetadata(
            source_system="postgres",
            source_type=SourceType.POSTGRES,
            source_table="sanctions",
            source_record_id=str(r.get("id", "")),
        )
        temporal = TemporalMetadata(valid_from=r.get("listed_date"), valid_to=r.get("delisted_date"))

        if entity_type == "company" and r.get("company_id"):
            rel_id = f"{r.get('company_id')}-{r.get('id')}-SANCTIONED_BY"
            rel = CanonicalRelationship(
                relationship_id=rel_id,
                relationship_type=CanonicalRelationshipType.SANCTIONED_BY,
                source_entity_id=str(r.get("company_id")),
                source_entity_type="Company",
                target_entity_id=str(r.get("id")),
                target_entity_type="Sanction",
                properties={
                    "authority": r.get("authority"),
                    "listed_date": r.get("listed_date"),
                    "delisted_date": r.get("delisted_date"),
                    "status": r.get("status"),
                    "source": r.get("source"),
                },
                provenance=prov,
                temporal=temporal,
            )
            rels.append(rel)
        elif entity_type == "person" and r.get("person_id"):
            rel_id = f"{r.get('person_id')}-{r.get('id')}-SANCTIONED_BY"
            rel = CanonicalRelationship(
                relationship_id=rel_id,
                relationship_type=CanonicalRelationshipType.SANCTIONED_BY,
                source_entity_id=str(r.get("person_id")),
                source_entity_type="Person",
                target_entity_id=str(r.get("id")),
                target_entity_type="Sanction",
                properties={
                    "authority": r.get("authority"),
                    "listed_date": r.get("listed_date"),
                    "delisted_date": r.get("delisted_date"),
                    "status": r.get("status"),
                    "source": r.get("source"),
                },
                provenance=prov,
                temporal=temporal,
            )
            rels.append(rel)
    return rels


def map_located_in_relationships_to_canonical(
    companies: List[Dict[str, Any]],
    suppliers: List[Dict[str, Any]],
    people: List[Dict[str, Any]],
) -> List[CanonicalRelationship]:
    """Map LOCATED_IN canonical relationships for companies, suppliers, and people."""
    rels = []
    for c in companies:
        if c.get("country"):
            rel_id = f"{c.get('id')}-{c.get('country')}-LOCATED_IN"
            prov = ProvenanceMetadata(
                source_system="postgres",
                source_type=SourceType.POSTGRES,
                source_table="companies",
                source_record_id=str(c.get("id")),
            )
            rels.append(CanonicalRelationship(
                relationship_id=rel_id,
                relationship_type=CanonicalRelationshipType.LOCATED_IN,
                source_entity_id=str(c.get("id")),
                source_entity_type="Company",
                target_entity_id=str(c.get("country")),
                target_entity_type="Country",
                provenance=prov,
            ))
    for s in suppliers:
        if s.get("country"):
            rel_id = f"{s.get('id')}-{s.get('country')}-LOCATED_IN"
            prov = ProvenanceMetadata(
                source_system="postgres",
                source_type=SourceType.POSTGRES,
                source_table="suppliers",
                source_record_id=str(s.get("id")),
            )
            rels.append(CanonicalRelationship(
                relationship_id=rel_id,
                relationship_type=CanonicalRelationshipType.LOCATED_IN,
                source_entity_id=str(s.get("id")),
                source_entity_type="Supplier",
                target_entity_id=str(s.get("country")),
                target_entity_type="Country",
                provenance=prov,
            ))
    for p in people:
        if p.get("country"):
            rel_id = f"{p.get('id')}-{p.get('country')}-LOCATED_IN"
            prov = ProvenanceMetadata(
                source_system="postgres",
                source_type=SourceType.POSTGRES,
                source_table="people",
                source_record_id=str(p.get("id")),
            )
            rels.append(CanonicalRelationship(
                relationship_id=rel_id,
                relationship_type=CanonicalRelationshipType.LOCATED_IN,
                source_entity_id=str(p.get("id")),
                source_entity_type="Person",
                target_entity_id=str(p.get("country")),
                target_entity_type="Country",
                provenance=prov,
            ))
    return rels


# Backward compatible relationship mappers returning dictionary structs
def map_supplier_relationships(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [r.to_neo4j_rel_dict() for r in map_supplier_relationships_to_canonical(rows)]

def map_director_relationships(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [r.to_neo4j_rel_dict() for r in map_director_relationships_to_canonical(rows)]

def map_ownership_relationships(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [r.to_neo4j_rel_dict() for r in map_ownership_relationships_to_canonical(rows)]

def map_contract_relationships(raw_contracts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [r.to_neo4j_rel_dict() for r in map_contract_relationships_to_canonical(raw_contracts)]

def map_sanction_relationships(raw_sanctions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [r.to_neo4j_rel_dict() for r in map_sanction_relationships_to_canonical(raw_sanctions)]

def map_located_in_relationships(
    companies: List[Dict[str, Any]],
    suppliers: List[Dict[str, Any]],
    people: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    return [r.to_neo4j_rel_dict() for r in map_located_in_relationships_to_canonical(companies, suppliers, people)]


# =============================================================================
# AGGREGATE CANONICAL GRAPH BUILDER
# =============================================================================

def build_canonical_graph_payload(
    norm_countries: List[Dict[str, Any]],
    norm_companies: List[Dict[str, Any]],
    norm_suppliers: List[Dict[str, Any]],
    norm_people: List[Dict[str, Any]],
    norm_contracts: List[Dict[str, Any]],
    norm_sanctions: List[Dict[str, Any]],
    norm_directors: List[Dict[str, Any]],
    norm_supplier_rels: List[Dict[str, Any]],
    norm_ownership: List[Dict[str, Any]],
) -> CanonicalGraphPayload:
    """
    Build a complete source-independent CanonicalGraphPayload from normalized PostgreSQL datasets.
    """
    payload = CanonicalGraphPayload()

    # Entities
    for e in map_countries_to_canonical(norm_countries):
        payload.add_entity(e)
    for e in map_companies_to_canonical(norm_companies):
        payload.add_entity(e)
    for e in map_suppliers_to_canonical(norm_suppliers):
        payload.add_entity(e)
    for e in map_people_to_canonical(norm_people):
        payload.add_entity(e)
    for e in map_contracts_to_canonical(norm_contracts):
        payload.add_entity(e)
    for e in map_sanctions_to_canonical(norm_sanctions):
        payload.add_entity(e)

    # Relationships
    for r in map_supplier_relationships_to_canonical(norm_supplier_rels):
        payload.add_relationship(r)
    for r in map_director_relationships_to_canonical(norm_directors):
        payload.add_relationship(r)
    for r in map_ownership_relationships_to_canonical(norm_ownership):
        payload.add_relationship(r)
    for r in map_contract_relationships_to_canonical(norm_contracts):
        payload.add_relationship(r)
    for r in map_sanction_relationships_to_canonical(norm_sanctions):
        payload.add_relationship(r)
    for r in map_located_in_relationships_to_canonical(norm_companies, norm_suppliers, norm_people):
        payload.add_relationship(r)

    return payload
