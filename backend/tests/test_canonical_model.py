"""
ReasonChain Canonical Domain Model Test Suite
Tests canonical entities, relationships, provenance, confidence, temporal metadata,
serialization, validation failures, and PostgreSQL -> Canonical -> Neo4j pipeline flow.
"""

import sys
import os
from pydantic import ValidationError
from unittest.mock import MagicMock, patch

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.domain.provenance import ProvenanceMetadata, SourceType
from app.domain.temporal import TemporalMetadata
from app.domain.confidence import ConfidenceMetadata
from app.domain.entities import CanonicalEntity, EntityCategory
from app.domain.relationships import CanonicalRelationship, CanonicalRelationshipType
from app.domain.graph import CanonicalGraphPayload
from app.ingestion.mapper import (
    map_companies_to_canonical,
    map_suppliers_to_canonical,
    map_people_to_canonical,
    map_supplier_relationships_to_canonical,
    build_canonical_graph_payload,
)
from app.ingestion.neo4j_writer import Neo4jWriter


# 1. Company Entity Test
def test_1_create_company_entity():
    company = CanonicalEntity(
        canonical_id="COMP-101",
        entity_type=EntityCategory.COMPANY,
        display_name="Acme Manufacturing",
        properties={"registration_number": "REG-12345", "industry": "Industrial"},
    )
    assert company.canonical_id == "COMP-101"
    assert company.entity_type == "Company"
    assert company.display_name == "Acme Manufacturing"
    assert company.properties["registration_number"] == "REG-12345"


# 2. Person Entity Test
def test_2_create_person_entity():
    person = CanonicalEntity(
        canonical_id="PER-202",
        entity_type=EntityCategory.PERSON,
        display_name="Jane Doe",
        properties={"role": "Director", "country": "US"},
    )
    assert person.canonical_id == "PER-202"
    assert person.entity_type == "Person"
    assert person.display_name == "Jane Doe"


# 3. Supplier Entity Test
def test_3_create_supplier_entity():
    supplier = CanonicalEntity(
        canonical_id="SUP-303",
        entity_type=EntityCategory.SUPPLIER,
        display_name="Global Supplies Inc",
        properties={"supplier_type": "Hardware", "risk_level": "Low"},
    )
    assert supplier.canonical_id == "SUP-303"
    assert supplier.entity_type == "Supplier"
    assert supplier.display_name == "Global Supplies Inc"


# 4. Relationship Between Entities Test
def test_4_create_relationship_between_entities():
    rel = CanonicalRelationship(
        relationship_id="REL-404",
        relationship_type=CanonicalRelationshipType.SUPPLIES,
        source_entity_id="SUP-303",
        source_entity_type="Supplier",
        target_entity_id="COMP-101",
        target_entity_type="Company",
        properties={"contract_ref": "CT-999"},
    )
    assert rel.relationship_id == "REL-404"
    assert rel.relationship_type == "SUPPLIES"
    assert rel.source_entity_id == "SUP-303"
    assert rel.target_entity_id == "COMP-101"


# 5. Relationship Provenance Test
def test_5_relationship_provenance():
    prov = ProvenanceMetadata(
        source_system="postgres_main",
        source_type=SourceType.POSTGRES,
        source_table="supplier_relationships",
        source_record_id="SR-888",
    )
    rel = CanonicalRelationship(
        relationship_id="REL-505",
        relationship_type=CanonicalRelationshipType.SUPPLIES,
        source_entity_id="SUP-303",
        target_entity_id="COMP-101",
        provenance=prov,
    )
    assert rel.provenance is not None
    assert rel.provenance.source_system == "postgres_main"
    assert rel.provenance.source_table == "supplier_relationships"
    assert rel.provenance.source_record_id == "SR-888"


# 6. Entity Provenance Test
def test_6_entity_provenance():
    prov = ProvenanceMetadata(
        source_system="firebase_rt",
        source_type=SourceType.FIREBASE,
        source_path="/companies/C101",
    )
    company = CanonicalEntity(
        canonical_id="C101",
        entity_type=EntityCategory.COMPANY,
        display_name="Firebase Corp",
        source_references=[prov],
    )
    assert len(company.source_references) == 1
    assert company.source_references[0].source_type == "firebase"
    assert company.source_references[0].source_path == "/companies/C101"


# 7. Optional Temporal Metadata Test
def test_7_optional_temporal_metadata():
    temporal = TemporalMetadata(
        valid_from="2024-01-01T00:00:00Z",
        valid_to="2025-01-01T00:00:00Z",
        observed_at="2024-06-01T12:00:00Z",
    )
    company = CanonicalEntity(
        canonical_id="C102",
        entity_type=EntityCategory.COMPANY,
        display_name="Temporal Corp",
        temporal=temporal,
    )
    assert company.temporal is not None
    assert company.temporal.valid_from == "2024-01-01T00:00:00Z"
    assert company.temporal.valid_to == "2025-01-01T00:00:00Z"


# 8. Confidence Metadata Test
def test_8_confidence_metadata():
    conf = ConfidenceMetadata(
        mapping_confidence=0.98,
        entity_confidence=0.95,
        relationship_confidence=0.92,
        source_reliability=0.99,
    )
    rel = CanonicalRelationship(
        relationship_id="REL-808",
        relationship_type=CanonicalRelationshipType.OWNS,
        source_entity_id="C1",
        target_entity_id="C2",
        confidence=conf,
    )
    assert rel.confidence.mapping_confidence == 0.98
    assert rel.confidence.relationship_confidence == 0.92


# 9. Dynamic Custom Properties Test
def test_9_dynamic_custom_properties():
    custom_props = {
        "annual_revenue": 50000000.0,
        "is_subsidiary": True,
        "nested_meta": {"tags": ["fintech", "high_risk"]},
    }
    company = CanonicalEntity(
        canonical_id="C103",
        entity_type=EntityCategory.COMPANY,
        display_name="Dynamic Corp",
        properties=custom_props,
    )
    assert company.properties["annual_revenue"] == 50000000.0
    assert company.properties["nested_meta"]["tags"] == ["fintech", "high_risk"]


# 10. Serialization and Deserialization Test
def test_10_serialization_deserialization():
    company = CanonicalEntity(
        canonical_id="C104",
        entity_type=EntityCategory.COMPANY,
        display_name="Serializable Inc",
        properties={"country": "US"},
    )
    # Serialize to JSON dict
    json_data = company.model_dump()
    assert json_data["canonical_id"] == "C104"
    assert json_data["entity_type"] == "Company"

    # Deserialize back to CanonicalEntity model
    reconstructed = CanonicalEntity.model_validate(json_data)
    assert reconstructed.canonical_id == "C104"
    assert reconstructed.display_name == "Serializable Inc"


# 11. Validation Failure Test for Required Fields
def test_11_validation_failure_required_fields():
    raised = False
    try:
        # Missing required canonical_id and entity_type
        CanonicalEntity(display_name="Invalid Entity")
    except ValidationError:
        raised = True
    assert raised is True

    raised = False
    try:
        # Missing required source_entity_id and target_entity_id
        CanonicalRelationship(relationship_id="R1", relationship_type=CanonicalRelationshipType.OWNS)
    except ValidationError:
        raised = True
    assert raised is True


# 12. PostgreSQL Ingestion Path Compatibility Test
def test_12_postgres_ingestion_path_compatibility():
    raw_pg_companies = [
        {
            "id": "C900",
            "name": "Postgres Legacy Corp",
            "country": "US",
            "industry": "Software",
            "status": "Active",
            "registration_number": "REG-900",
        }
    ]
    canonical_entities = map_companies_to_canonical(raw_pg_companies)
    assert len(canonical_entities) == 1

    c_entity = canonical_entities[0]
    assert isinstance(c_entity, CanonicalEntity)
    assert c_entity.canonical_id == "C900"
    assert c_entity.entity_type == "Company"
    assert len(c_entity.source_references) == 1
    assert c_entity.source_references[0].source_table == "companies"

    # Verify adapter formatting for Neo4j node dictionary
    neo4j_dict = c_entity.to_neo4j_node_dict()
    assert neo4j_dict["label"] == "Company"
    assert neo4j_dict["key_field"] == "id"
    assert neo4j_dict["properties"]["canonical_id"] == "C900"
    assert neo4j_dict["properties"]["name"] == "Postgres Legacy Corp"


# 13. Full Pipeline Integration Test (Postgres -> Mapper -> Canonical -> Neo4jWriter)
def test_integration_postgres_mapper_canonical_neo4j_writer():
    raw_companies = [{"id": "C999", "name": "Pipeline Test Corp"}]
    raw_suppliers = [{"id": "S999", "name": "Pipeline Test Supplier"}]
    raw_supplier_rels = [{"id": "SR999", "supplier_id": "S999", "company_id": "C999", "relationship_type": "SUPPLIES"}]

    canonical_payload = build_canonical_graph_payload(
        norm_countries=[],
        norm_companies=raw_companies,
        norm_suppliers=raw_suppliers,
        norm_people=[],
        norm_contracts=[],
        norm_sanctions=[],
        norm_directors=[],
        norm_supplier_rels=raw_supplier_rels,
        norm_ownership=[],
    )

    assert len(canonical_payload.entities) == 2
    assert len(canonical_payload.relationships) == 1

    # Verify writing via Neo4jWriter (with batch execution mocked)
    writer = Neo4jWriter()
    with patch.object(writer, "_merge_nodes_batch") as mock_nodes_merge, \
         patch.object(writer, "_merge_relationships_batch") as mock_rels_merge:

        stats = writer.write_canonical_payload(canonical_payload)
        assert stats["nodes_written"] == 2
        assert stats["relationships_written"] == 1
        assert mock_nodes_merge.called
        assert mock_rels_merge.called


if __name__ == "__main__":
    test_funcs = [
        test_1_create_company_entity,
        test_2_create_person_entity,
        test_3_create_supplier_entity,
        test_4_create_relationship_between_entities,
        test_5_relationship_provenance,
        test_6_entity_provenance,
        test_7_optional_temporal_metadata,
        test_8_confidence_metadata,
        test_9_dynamic_custom_properties,
        test_10_serialization_deserialization,
        test_11_validation_failure_required_fields,
        test_12_postgres_ingestion_path_compatibility,
        test_integration_postgres_mapper_canonical_neo4j_writer,
    ]
    passed = 0
    failed = 0
    print("=" * 65)
    print("RUNNING REASONCHAIN CANONICAL DOMAIN MODEL TEST SUITE")
    print("=" * 65)
    for fn in test_funcs:
        try:
            fn()
            print(f"  [PASS] {fn.__name__}")
            passed += 1
        except Exception as e:
            import traceback
            print(f"  [FAIL] {fn.__name__}: {e}")
            traceback.print_exc()
            failed += 1
    print("-" * 65)
    print(f"RESULTS: {passed} PASSED, {failed} FAILED")
    print("=" * 65)
    if failed > 0:
        sys.exit(1)
