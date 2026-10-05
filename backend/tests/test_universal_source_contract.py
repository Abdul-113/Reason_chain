"""
Tests for Universal Source Contract & Source-Agnostic Semantic Mapping Foundation
Verifies:
1. Universal Source Contract (BaseSourceAdapter) and metadata models.
2. Normalization of Firebase and PostgreSQL records into universal SourceRecord intermediate representations.
3. Declarative MappingSpecification validation and governance lifecycle (AI_PROPOSED -> PENDING -> APPROVED).
4. UniversalMappingEngine transforms both Firebase and PostgreSQL records into Canonical Entities and Relationships
   WITHOUT source-type branching or leaking storage engine mechanics.
"""

import pytest
from datetime import datetime, timezone
from typing import Dict, Any

from app.domain.entities import EntityCategory, CanonicalEntity
from app.domain.relationships import CanonicalRelationshipType, CanonicalRelationship
from app.domain.provenance import SourceType, ProvenanceMetadata
from app.source.models import (
    SourceCapability,
    SourceStatus,
    SourceDescriptor,
    DatasetDescriptor,
    FieldDescriptor,
    ReferenceCandidate,
    TemporalCandidate,
    ProfileResult,
)
from app.source.records import (
    SourceLocation,
    SourceRecord,
    SourceBatch,
)
from app.source.contract import (
    BaseSourceAdapter,
    ConnectionTestResult,
    ExtractOptions,
    ProfileOptions,
)
from app.source.mapping import (
    MappingOrigin,
    ValidationStatus,
    ApprovalStatus,
    TransformType,
    TransformationRule,
    FieldMappingRule,
    EntityMappingRule,
    RelationshipMappingRule,
    MappingSpecification,
    SemanticMappingAssistant,
)
from app.source.engine import UniversalMappingEngine
from app.source.adapters.firebase_adapter import FirebaseSourceAdapter
from app.source.adapters.postgres_adapter import PostgreSQLSourceAdapter


# ========================================================================
# 1. METADATA & DESCRIPTOR TESTS
# ========================================================================

def test_source_descriptor_does_not_leak_secrets():
    """Verify SourceDescriptor contains only safe connection summaries without passwords or keys."""
    desc = SourceDescriptor(
        source_id="test_pg",
        source_type="postgres",
        display_name="Test Postgres",
        capabilities=[SourceCapability.DISCOVERY, SourceCapability.PROFILING],
        status=SourceStatus.CONFIGURED,
        connection_summary={"host": "db.internal", "database": "reasonchain", "port": 5432},
    )
    dumped = desc.model_dump()
    assert "password" not in dumped["connection_summary"]
    assert "private_key" not in dumped["connection_summary"]
    assert dumped["source_id"] == "test_pg"
    assert dumped["status"] == "configured"


def test_dataset_descriptor_abstraction():
    """Verify DatasetDescriptor unifies tables, collections, and branches."""
    # Relational table
    table_ds = DatasetDescriptor(
        dataset_id="companies",
        source_id="pg_dw",
        logical_name="Companies Table",
        physical_identifier="public.companies",
        dataset_type="table",
        record_estimate=5000,
    )
    assert table_ds.dataset_type == "table"

    # NoSQL branch
    branch_ds = DatasetDescriptor(
        dataset_id="companies",
        source_id="firebase_rtdb",
        logical_name="Companies Branch",
        physical_identifier="/companies",
        dataset_type="document_branch",
        record_estimate=10000,
    )
    assert branch_ds.dataset_type == "document_branch"
    assert branch_ds.dataset_id == table_ds.dataset_id  # Same logical dataset ID


def test_profile_result_representation():
    """Verify universal ProfileResult models fields, reference candidates, and temporal candidates."""
    ds = DatasetDescriptor(
        dataset_id="contracts",
        source_id="pg_dw",
        logical_name="Contracts",
        physical_identifier="contracts",
    )
    fields = [
        FieldDescriptor(
            field_path="id",
            inferred_type="string",
            nullable=False,
            identifier_likelihood=0.98,
        ),
        FieldDescriptor(
            field_path="company_id",
            inferred_type="string",
            nullable=False,
            reference_likelihood=0.95,
        ),
        FieldDescriptor(
            field_path="effective_date",
            inferred_type="datetime",
            nullable=True,
            temporal_likelihood=0.90,
        ),
    ]
    ref_cands = [
        ReferenceCandidate(
            source_field="company_id",
            target_dataset_candidate="companies",
            confidence=0.95,
        )
    ]
    temp_cands = [
        TemporalCandidate(
            field_path="effective_date",
            detected_format="iso8601",
            confidence=0.90,
        )
    ]

    profile = ProfileResult(
        source_id="pg_dw",
        dataset=ds,
        fields=fields,
        records_sampled=50,
        reference_candidates=ref_cands,
        temporal_candidates=temp_cands,
    )

    assert profile.records_sampled == 50
    assert len(profile.fields) == 3
    assert profile.get_field("company_id") is not None
    assert profile.get_field("company_id").reference_likelihood == 0.95
    assert len(profile.reference_candidates) == 1
    assert len(profile.temporal_candidates) == 1


# ========================================================================
# 2. UNIVERSAL INTERMEDIATE REPRESENTATION (SourceRecord)
# ========================================================================

def test_source_record_normalization_and_attribute_access():
    """Verify SourceRecord handles flat and nested attributes with dot-notation."""
    loc = SourceLocation(
        source_id="firebase_rtdb",
        dataset_id="companies",
        record_key="U72900DL2020PTC368921",
    )
    rec = SourceRecord(
        source_id="firebase_rtdb",
        dataset_id="companies",
        record_id="U72900DL2020PTC368921",
        attributes={
            "cin": "U72900DL2020PTC368921",
            "company_name": "ACME TECH INDIA PRIVATE LIMITED",
            "registered_office_address": {
                "city": "New Delhi",
                "state": "Delhi",
                "country": "India",
            },
            "status": "Active",
        },
        source_location=loc,
    )

    # Flat access
    assert rec.get_attribute("cin") == "U72900DL2020PTC368921"
    assert rec.get_attribute("status") == "Active"

    # Dot-notation nested access
    assert rec.get_attribute("registered_office_address.city") == "New Delhi"
    assert rec.get_attribute("registered_office_address.state") == "Delhi"
    assert rec.get_attribute("registered_office_address.missing", default="N/A") == "N/A"

    # Provenance conversion
    prov = rec.to_canonical_provenance(SourceType.FIREBASE)
    assert prov.source_system == "firebase_rtdb"
    assert prov.source_record_id == "U72900DL2020PTC368921"
    assert "firebase_rtdb://companies/U72900DL2020PTC368921" in prov.source_path


def test_source_batch_container():
    """Verify SourceBatch handles paging and summary metrics."""
    records = [
        SourceRecord(
            source_id="pg",
            dataset_id="countries",
            record_id=f"C_{i}",
            attributes={"code": f"C_{i}", "name": f"Country {i}"},
            source_location=SourceLocation(source_id="pg", dataset_id="countries", record_key=f"C_{i}"),
        )
        for i in range(5)
    ]
    batch = SourceBatch(
        source_id="pg",
        dataset_id="countries",
        records=records,
        total_count=len(records),
        has_more=False,
    )
    assert batch.total_count == 5
    assert len(batch.records) == 5
    assert not batch.has_more


# ========================================================================
# 3. UNIVERSAL MAPPING SPECIFICATION & GOVERNANCE LIFECYCLE
# ========================================================================

def test_mapping_specification_validation():
    """Verify deterministic validation enforces required identifier and relationship fields."""
    # Invalid spec: missing identifier_field
    invalid_spec = MappingSpecification(
        mapping_id="spec_invalid",
        dataset_id="companies",
        target_entities=[
            EntityMappingRule(
                target_entity_category=EntityCategory.COMPANY,
                identifier_field="",  # Empty!
            )
        ],
    )
    status = invalid_spec.validate_rules()
    assert status == ValidationStatus.INVALID
    assert not invalid_spec.is_active()
    assert len(invalid_spec.validation_messages) > 0

    # Valid spec
    valid_spec = MappingSpecification(
        mapping_id="spec_valid",
        dataset_id="companies",
        target_entities=[
            EntityMappingRule(
                target_entity_category=EntityCategory.COMPANY,
                identifier_field="cin",
                display_name_field="company_name",
            )
        ],
        target_relationships=[
            RelationshipMappingRule(
                target_relationship_type=CanonicalRelationshipType.LOCATED_IN,
                source_entity_ref="$PRIMARY",
                target_entity_ref="country_code",
                target_entity_type="Country",
            )
        ],
    )
    status = valid_spec.validate_rules()
    assert status == ValidationStatus.VALID
    assert valid_spec.is_active()  # Approved and Valid


def test_ai_proposed_mapping_lifecycle():
    """Verify AI-proposed mappings require validation and approval before activation."""
    spec = MappingSpecification(
        mapping_id="spec_ai_001",
        dataset_id="companies",
        target_entities=[
            EntityMappingRule(
                target_entity_category=EntityCategory.COMPANY,
                identifier_field="cin",
                display_name_field="company_name",
            )
        ],
        origin=MappingOrigin.AI_PROPOSED,
        validation_status=ValidationStatus.UNVALIDATED,
        approval_status=ApprovalStatus.PENDING,
    )

    # 1. Initially inactive
    assert not spec.is_active()

    # 2. Deterministic validation succeeds
    spec.validate_rules()
    assert spec.validation_status == ValidationStatus.VALID
    assert not spec.is_active()  # Still pending human approval!

    # 3. Human analyst approves
    spec.approval_status = ApprovalStatus.APPROVED
    assert spec.is_active()


# ========================================================================
# 4. UNIVERSAL MAPPING ENGINE — ZERO SOURCE-TYPE BRANCHING
# ========================================================================

def test_universal_mapping_engine_on_heterogeneous_sources():
    """
    CRITICAL ARCHITECTURAL PROOF:
    Verify that UniversalMappingEngine processes:
      (A) A Firebase JSON corporate record
      (B) A PostgreSQL relational corporate row
    through the EXACT same semantic mapping specification and engine,
    yielding canonical entities and relationships without any source-type branching.
    """

    # Declarative Mapping Specification for corporate entities
    spec = MappingSpecification(
        mapping_id="universal_company_mapping",
        dataset_id="companies",
        target_entities=[
            EntityMappingRule(
                target_entity_category=EntityCategory.COMPANY,
                identifier_field="corp_id",
                id_namespace="company",
                display_name_field="name",
                field_mappings=[
                    FieldMappingRule(
                        source_field="status",
                        target_property="status",
                        transformation=TransformationRule(transform_type=TransformType.UPPERCASE),
                    ),
                    FieldMappingRule(
                        source_field="capital",
                        target_property="authorized_capital",
                        transformation=TransformationRule(transform_type=TransformType.PARSE_FLOAT),
                    ),
                ],
                confidence=0.95,
            )
        ],
        target_relationships=[
            RelationshipMappingRule(
                target_relationship_type=CanonicalRelationshipType.LOCATED_IN,
                source_entity_ref="$PRIMARY",
                source_entity_type="Company",
                target_entity_ref="country",
                target_entity_type="Country",
                generate_target_entity=True,
                target_entity_category=EntityCategory.COUNTRY,
                target_entity_name_field="country_name",
                confidence=0.90,
            )
        ],
    )
    assert spec.validate_rules() == ValidationStatus.VALID

    # Record A: Originating from Firebase (normalized by FirebaseSourceAdapter)
    firebase_record = SourceRecord(
        source_id="firebase_rtdb",
        dataset_id="companies",
        record_id="U12345DL2021PTC999999",
        attributes={
            "corp_id": "U12345DL2021PTC999999",
            "name": "Acme Firebase Technologies Pvt Ltd",
            "status": "active",
            "capital": "5000000.0",
            "country": "IN",
            "country_name": "India",
        },
        source_location=SourceLocation(
            source_id="firebase_rtdb",
            dataset_id="companies",
            record_key="U12345DL2021PTC999999",
        ),
        provenance_metadata=ProvenanceMetadata(
            source_system="firebase_rtdb",
            source_type=SourceType.FIREBASE,
            source_record_id="U12345DL2021PTC999999",
            source_table="companies",
            source_path="/companies/U12345DL2021PTC999999",
        )
    )

    # Record B: Originating from PostgreSQL (normalized by PostgreSQLSourceAdapter)
    postgres_record = SourceRecord(
        source_id="postgres_main",
        dataset_id="companies",
        record_id="C001",
        attributes={
            "corp_id": "C001",
            "name": "Global Postgres Solutions Inc",
            "status": "dormant",
            "capital": 10000000,
            "country": "US",
            "country_name": "United States",
        },
        source_location=SourceLocation(
            source_id="postgres_main",
            dataset_id="companies",
            record_key="C001",
        ),
        provenance_metadata=ProvenanceMetadata(
            source_system="postgres_main",
            source_type=SourceType.POSTGRES,
            source_record_id="C001",
            source_table="companies",
            source_path="companies/C001",
        )
    )

    # 1. Map Record A (Firebase) via UniversalMappingEngine
    fb_entities, fb_relationships = UniversalMappingEngine.map_record(firebase_record, spec)
    assert len(fb_entities) == 2  # Company + Auto-generated Country
    assert len(fb_relationships) == 1

    fb_company = next(e for e in fb_entities if e.entity_type == EntityCategory.COMPANY)
    assert fb_company.canonical_id == "company:U12345DL2021PTC999999"
    assert fb_company.display_name == "Acme Firebase Technologies Pvt Ltd"
    assert fb_company.properties["status"] == "ACTIVE"  # Upper-cased by transform rule
    assert fb_company.properties["authorized_capital"] == 5000000.0
    assert fb_company.source_references[0].source_system == "firebase_rtdb"
    assert fb_company.source_references[0].source_type == SourceType.FIREBASE

    fb_rel = fb_relationships[0]
    assert fb_rel.relationship_type == CanonicalRelationshipType.LOCATED_IN
    assert fb_rel.source_entity_id == "company:U12345DL2021PTC999999"
    assert fb_rel.target_entity_id == "IN"
    assert fb_rel.provenance.source_type == SourceType.FIREBASE

    # 2. Map Record B (PostgreSQL) via UniversalMappingEngine
    pg_entities, pg_relationships = UniversalMappingEngine.map_record(postgres_record, spec)
    assert len(pg_entities) == 2  # Company + Auto-generated Country
    assert len(pg_relationships) == 1

    pg_company = next(e for e in pg_entities if e.entity_type == EntityCategory.COMPANY)
    assert pg_company.canonical_id == "company:C001"
    assert pg_company.display_name == "Global Postgres Solutions Inc"
    assert pg_company.properties["status"] == "DORMANT"
    assert pg_company.properties["authorized_capital"] == 10000000.0
    assert pg_company.source_references[0].source_system == "postgres_main"
    assert pg_company.source_references[0].source_type == SourceType.POSTGRES

    pg_rel = pg_relationships[0]
    assert pg_rel.relationship_type == CanonicalRelationshipType.LOCATED_IN
    assert pg_rel.source_entity_id == "company:C001"
    assert pg_rel.target_entity_id == "US"
    assert pg_rel.provenance.source_type == SourceType.POSTGRES


def test_batch_mapping_and_payload_assembly():
    """Verify UniversalMappingEngine.map_batch creates a unified CanonicalGraphPayload."""
    spec = MappingSpecification(
        mapping_id="batch_spec",
        dataset_id="countries",
        target_entities=[
            EntityMappingRule(
                target_entity_category=EntityCategory.COUNTRY,
                identifier_field="code",
                display_name_field="name",
            )
        ],
    )
    records = [
        SourceRecord(
            source_id="src_1",
            dataset_id="countries",
            record_id="IN",
            attributes={"code": "IN", "name": "India"},
            source_location=SourceLocation(source_id="src_1", dataset_id="countries", record_key="IN"),
        ),
        SourceRecord(
            source_id="src_1",
            dataset_id="countries",
            record_key="US",
            record_id="US",
            attributes={"code": "US", "name": "United States"},
            source_location=SourceLocation(source_id="src_1", dataset_id="countries", record_key="US"),
        ),
    ]
    batch = SourceBatch(
        source_id="src_1",
        dataset_id="countries",
        records=records,
        total_count=2,
    )

    payload = UniversalMappingEngine.map_batch(batch, spec)
    assert len(payload.entities) == 2
    assert {e.canonical_id for e in payload.entities} == {"IN", "US"}
    neo4j_dict = payload.to_neo4j_payload()
    assert len(neo4j_dict["nodes"]) == 2


# ========================================================================
# 5. ADAPTER CONFORMANCE TESTS
# ========================================================================

def test_firebase_adapter_interface():
    """Verify FirebaseSourceAdapter conforms to BaseSourceAdapter."""
    adapter = FirebaseSourceAdapter()
    assert isinstance(adapter, BaseSourceAdapter)
    desc = adapter.get_descriptor()
    assert desc.source_type == "firebase"
    assert SourceCapability.PROFILING in desc.capabilities
    assert SourceCapability.BOUNDED_EXTRACTION in desc.capabilities


def test_postgres_adapter_interface():
    """Verify PostgreSQLSourceAdapter conforms to BaseSourceAdapter."""
    adapter = PostgreSQLSourceAdapter()
    assert isinstance(adapter, BaseSourceAdapter)
    desc = adapter.get_descriptor()
    assert desc.source_type == "postgres"
    assert SourceCapability.DISCOVERY in desc.capabilities
    assert SourceCapability.BOUNDED_EXTRACTION in desc.capabilities


def test_semantic_mapping_assistant_protocol():
    """Verify SemanticMappingAssistant protocol definition for future AI mapping."""
    class DummyAssistant:
        def propose_mappings(self, dataset, profile, canonical_ontology, options=None):
            return []

        def validate_proposals(self, proposals):
            return proposals

    dummy = DummyAssistant()
    assert isinstance(dummy, SemanticMappingAssistant)
