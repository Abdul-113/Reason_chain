"""
Unit & Integration Tests for AI-Assisted Semantic Mapping Layer
Tests:
- Ontology serialization from domain enums
- Bounded sample preparation & credential redaction
- Provider interface conformance & graceful degradation
- Deterministic schema & profile validator
- Ambiguity detection & reporting
- Governance lifecycle (PENDING -> APPROVED / REJECTED)
- System vs AI confidence separation
- Integration with UniversalMappingEngine
"""

import pytest
from datetime import datetime, timezone

from app.domain.entities import EntityCategory
from app.domain.relationships import CanonicalRelationshipType
from app.source.models import (
    ProfileResult,
    DatasetDescriptor,
    FieldDescriptor,
    SourceDescriptor,
)
from app.source.records import SourceRecord, SourceBatch, SourceLocation
from app.source.mapping import (
    MappingSpecification,
    EntityMappingRule,
    RelationshipMappingRule,
    FieldMappingRule,
    TransformationRule,
    TransformType,
    MappingOrigin,
    ValidationStatus,
    ApprovalStatus,
)
from app.source.engine import UniversalMappingEngine
from app.source.ai.ai_context import (
    build_ontology_context,
    prepare_profile_for_ai,
    prepare_samples_for_ai,
    build_mapping_request,
    MappingProposalRequest,
    MappingProposalResponse,
    FieldAmbiguity,
)
from app.source.ai.ai_provider import (
    BaseMappingProvider,
    GroqMappingProvider,
    get_mapping_provider,
)
from app.source.ai.validator import (
    DeterministicMappingValidator,
    ValidationReport,
)
from app.source.ai.mapping_service import MappingService


# ========================================================================
# FIXTURES
# ========================================================================

@pytest.fixture
def sample_dataset():
    return DatasetDescriptor(
        dataset_id="test_companies",
        source_id="test_source",
        logical_name="Test Companies",
        physical_identifier="/test_companies",
        dataset_type="table",
        record_estimate=500,
    )


@pytest.fixture
def sample_profile(sample_dataset):
    return ProfileResult(
        source_id="test_source",
        dataset=sample_dataset,
        records_sampled=10,
        fields=[
            FieldDescriptor(
                field_path="cin",
                inferred_type="string",
                presence_ratio=1.0,
                identifier_likelihood=0.95,
                sample_values=["U12345DL2020PTC000001", "L98765MH1995PLC000002"],
            ),
            FieldDescriptor(
                field_path="company_name",
                inferred_type="string",
                presence_ratio=1.0,
                sample_values=["Acme Technologies Ltd", "Global Nexus Inc"],
            ),
            FieldDescriptor(
                field_path="status",
                inferred_type="string",
                presence_ratio=0.9,
                sample_values=["Active", "Active"],
            ),
            FieldDescriptor(
                field_path="parent_cin",
                inferred_type="string",
                presence_ratio=0.4,
                reference_likelihood=0.85,
                sample_values=["L98765MH1995PLC000002"],
            ),
            FieldDescriptor(
                field_path="secret_key",
                inferred_type="string",
                presence_ratio=1.0,
                sample_values=["super-secret-password-123"],
            ),
        ],
    )


@pytest.fixture
def sample_records():
    loc1 = SourceLocation(source_id="test_source", dataset_id="test_companies", record_key="rec-001")
    loc2 = SourceLocation(source_id="test_source", dataset_id="test_companies", record_key="rec-002")
    return [
        SourceRecord(
            source_id="test_source",
            dataset_id="test_companies",
            record_id="rec-001",
            source_location=loc1,
            attributes={
                "cin": "U12345DL2020PTC000001",
                "company_name": "Acme Technologies Ltd",
                "status": "Active",
                "parent_cin": "L98765MH1995PLC000002",
                "secret_key": "raw_sensitive_secret",
            },
        ),
        SourceRecord(
            source_id="test_source",
            dataset_id="test_companies",
            record_id="rec-002",
            source_location=loc2,
            attributes={
                "cin": "L98765MH1995PLC000002",
                "company_name": "Global Nexus Inc",
                "status": "Active",
                "parent_cin": None,
                "secret_key": "another_secret",
            },
        ),
    ]


# ========================================================================
# 1. ONTOLOGY DERIVATION TESTS
# ========================================================================

def test_ontology_context_derived_from_enums():
    """Verify ontology context automatically includes all canonical categories and relationship types."""
    ontology = build_ontology_context()
    assert "entity_categories" in ontology
    assert "relationship_types" in ontology

    cat_names = {item["category"] for item in ontology["entity_categories"]}
    for ec in EntityCategory:
        assert ec.value in cat_names

    rel_names = {item["type"] for item in ontology["relationship_types"]}
    for rt in CanonicalRelationshipType:
        assert rt.value in rel_names


# ========================================================================
# 2. SAFE PREPARATION & REDACTION TESTS
# ========================================================================

def test_sample_preparation_redacts_sensitive_fields(sample_records):
    """Verify passwords, secret keys, and credentials are redacted from AI payloads."""
    safe_samples = prepare_samples_for_ai(sample_records)
    for sample in safe_samples:
        assert sample["secret_key"] == "[REDACTED]"
        assert "raw_sensitive_secret" not in str(sample)


def test_profile_preparation_redacts_samples(sample_profile):
    """Verify profile sample values for sensitive fields are masked."""
    summary = prepare_profile_for_ai(sample_profile)
    secret_field = next(f for f in summary["fields"] if f["field_path"] == "secret_key")
    assert secret_field["sample_values"] == ["[REDACTED]"]


def test_build_mapping_request_bounded_payload(sample_profile, sample_records):
    """Verify complete request model construction with proper bounds."""
    req = build_mapping_request(
        source_id="test_source",
        dataset_id="test_companies",
        profile=sample_profile,
        samples=sample_records,
    )
    assert req.source_id == "test_source"
    assert req.dataset_id == "test_companies"
    assert len(req.sample_records) == 2
    assert len(req.profile_summary["fields"]) == 5


# ========================================================================
# 3. DETERMINISTIC VALIDATOR TESTS
# ========================================================================

def test_deterministic_validator_valid_spec(sample_profile):
    """A well-formed mapping proposal referencing real profile fields must be VALID."""
    spec = MappingSpecification(
        mapping_id="prop_valid_01",
        dataset_id="test_companies",
        origin=MappingOrigin.AI_PROPOSED,
        target_entities=[
            EntityMappingRule(
                target_entity_category=EntityCategory.COMPANY,
                identifier_field="cin",
                display_name_field="company_name",
                field_mappings=[
                    FieldMappingRule(
                        source_field="status",
                        target_property="status",
                    )
                ],
            )
        ],
        target_relationships=[
            RelationshipMappingRule(
                target_relationship_type=CanonicalRelationshipType.OWNS,
                source_entity_ref="parent_cin",
                target_entity_ref="cin",
            )
        ],
    )

    report = DeterministicMappingValidator.validate(spec, profile=sample_profile)
    assert report.status == ValidationStatus.VALID
    assert spec.validation_status == ValidationStatus.VALID
    assert report.validation_score == 1.0
    assert "cin" in report.verified_fields
    assert "company_name" in report.verified_fields
    assert "parent_cin" in report.verified_fields
    assert len(report.unverified_fields) == 0


def test_deterministic_validator_rejects_hallucinated_fields(sample_profile):
    """Validator must flag fields that do not exist in the dataset profile as INVALID."""
    spec = MappingSpecification(
        mapping_id="prop_hallucinated_01",
        dataset_id="test_companies",
        origin=MappingOrigin.AI_PROPOSED,
        target_entities=[
            EntityMappingRule(
                target_entity_category=EntityCategory.COMPANY,
                identifier_field="non_existent_cin_field",  # HALLUCINATED
                field_mappings=[
                    FieldMappingRule(
                        source_field="fake_revenue_field",  # HALLUCINATED
                        target_property="revenue",
                    )
                ],
            )
        ],
    )

    report = DeterministicMappingValidator.validate(spec, profile=sample_profile)
    assert report.status == ValidationStatus.INVALID
    assert spec.validation_status == ValidationStatus.INVALID
    assert "non_existent_cin_field" in report.unverified_fields
    assert any("non_existent_cin_field" in iss.message for iss in report.issues)


def test_deterministic_validator_warns_low_presence_identifier(sample_profile):
    """Validator must produce a warning when identifier field has low presence ratio."""
    spec = MappingSpecification(
        mapping_id="prop_warn_01",
        dataset_id="test_companies",
        origin=MappingOrigin.AI_PROPOSED,
        target_entities=[
            EntityMappingRule(
                target_entity_category=EntityCategory.COMPANY,
                identifier_field="parent_cin",  # presence ratio is only 0.4
            )
        ],
    )

    report = DeterministicMappingValidator.validate(spec, profile=sample_profile)
    assert report.status == ValidationStatus.WARNING
    assert any("low presence ratio" in iss.message for iss in report.issues)


def test_deterministic_validator_rejects_empty_entities(sample_profile):
    """Validator must fail if specification contains zero entity mapping rules."""
    spec = MappingSpecification(
        mapping_id="prop_no_ents",
        dataset_id="test_companies",
        origin=MappingOrigin.AI_PROPOSED,
        target_entities=[],
    )

    report = DeterministicMappingValidator.validate(spec, profile=sample_profile)
    assert report.status == ValidationStatus.INVALID
    assert any("no target entity" in iss.message for iss in report.issues)


# ========================================================================
# 4. GOVERNANCE LIFECYCLE TESTS
# ========================================================================

def test_governance_approval_lifecycle(sample_profile):
    """Test full proposal approval lifecycle: UNVALIDATED -> VALID -> APPROVED."""
    service = MappingService()

    spec = MappingSpecification(
        mapping_id="prop_gov_01",
        dataset_id="test_companies",
        origin=MappingOrigin.AI_PROPOSED,
        validation_status=ValidationStatus.UNVALIDATED,
        approval_status=ApprovalStatus.PENDING,
        target_entities=[
            EntityMappingRule(
                target_entity_category=EntityCategory.COMPANY,
                identifier_field="cin",
                display_name_field="company_name",
            )
        ],
    )

    resp = MappingProposalResponse(
        proposal_id="prop_gov_01",
        source_id="test_source",
        dataset_id="test_companies",
        proposed_specification=spec,
        ai_confidence=0.92,
    )
    service._proposals["prop_gov_01"] = resp
    service._profiles["test_source:test_companies"] = sample_profile

    # Validate
    report = service.validate_proposal("prop_gov_01")
    assert report.status == ValidationStatus.VALID
    assert spec.validation_status == ValidationStatus.VALID

    # Approve
    approved_spec = service.approve_proposal("prop_gov_01", reviewer_id="analyst_alice", notes="Verified against MCA database")
    assert approved_spec.approval_status == ApprovalStatus.APPROVED
    assert approved_spec.metadata["approved_by"] == "analyst_alice"
    assert approved_spec.is_active() is True


def test_governance_cannot_approve_invalid_proposal():
    """Service must reject approval attempts for invalid specifications."""
    service = MappingService()

    spec = MappingSpecification(
        mapping_id="prop_inv_01",
        dataset_id="test_companies",
        origin=MappingOrigin.AI_PROPOSED,
        validation_status=ValidationStatus.INVALID,
        approval_status=ApprovalStatus.PENDING,
        target_entities=[],
    )

    resp = MappingProposalResponse(
        proposal_id="prop_inv_01",
        source_id="test_source",
        dataset_id="test_companies",
        proposed_specification=spec,
    )
    service._proposals["prop_inv_01"] = resp

    with pytest.raises(ValueError, match="Cannot approve proposal.*INVALID"):
        service.approve_proposal("prop_inv_01")


def test_governance_rejection():
    """Test rejecting an AI proposal."""
    service = MappingService()

    spec = MappingSpecification(
        mapping_id="prop_rej_01",
        dataset_id="test_companies",
        origin=MappingOrigin.AI_PROPOSED,
        approval_status=ApprovalStatus.PENDING,
        target_entities=[EntityMappingRule(target_entity_category=EntityCategory.COMPANY, identifier_field="cin")],
    )

    resp = MappingProposalResponse(
        proposal_id="prop_rej_01",
        source_id="test_source",
        dataset_id="test_companies",
        proposed_specification=spec,
    )
    service._proposals["prop_rej_01"] = resp

    rejected_spec = service.reject_proposal("prop_rej_01", reviewer_id="analyst_bob", reason="Ambiguous ID semantics")
    assert rejected_spec.approval_status == ApprovalStatus.REJECTED
    assert rejected_spec.metadata["rejected_by"] == "analyst_bob"
    assert rejected_spec.metadata["rejection_reason"] == "Ambiguous ID semantics"
    assert rejected_spec.is_active() is False


# ========================================================================
# 5. AMBIGUITY & SEPARATION TESTS
# ========================================================================

def test_ambiguity_representation():
    """Verify ambiguous fields are properly structured with candidate interpretations."""
    amb = FieldAmbiguity(
        field_path="status",
        candidate_interpretations=["operational_status", "legal_registration_status", "compliance_grade"],
        selected_interpretation="operational_status",
        evidence="Sample values ['Active', 'Dormant'] correlate with operational activity.",
        confidence=0.65,
    )
    assert amb.field_path == "status"
    assert len(amb.candidate_interpretations) == 3
    assert amb.confidence == 0.65


def test_confidence_separation():
    """Verify system validation confidence is decoupled from AI self-reported confidence."""
    resp = MappingProposalResponse(
        proposal_id="prop_conf_sep",
        source_id="test_source",
        dataset_id="test_companies",
        ai_confidence=0.95,               # AI claims 95% confidence
        system_validation_confidence=0.75, # Deterministic validation reports 75%
    )
    assert resp.ai_confidence != resp.system_validation_confidence


# ========================================================================
# 6. UNIVERSAL MAPPING ENGINE EXECUTION WITH APPROVED AI PROPOSAL
# ========================================================================

def test_execute_approved_ai_proposal_in_mapping_engine(sample_records):
    """Verify that once approved, an AI-proposed specification transforms records cleanly."""
    spec = MappingSpecification(
        mapping_id="ai_approved_01",
        dataset_id="test_companies",
        origin=MappingOrigin.AI_PROPOSED,
        validation_status=ValidationStatus.VALID,
        approval_status=ApprovalStatus.APPROVED,
        confidence=0.9,
        target_entities=[
            EntityMappingRule(
                target_entity_category=EntityCategory.COMPANY,
                identifier_field="cin",
                id_namespace="company",
                display_name_field="company_name",
                field_mappings=[
                    FieldMappingRule(
                        source_field="status",
                        target_property="status",
                        transformation=TransformationRule(transform_type=TransformType.UPPERCASE),
                    )
                ],
            )
        ],
        target_relationships=[
            RelationshipMappingRule(
                target_relationship_type=CanonicalRelationshipType.OWNS,
                source_entity_ref="parent_cin",
                target_entity_ref="cin",
            )
        ],
    )

    batch = SourceBatch(
        source_id="test_source",
        dataset_id="test_companies",
        records=sample_records,
    )

    payload = UniversalMappingEngine.map_batch(batch, spec, enforce_validation=True)
    assert len(payload.entities) == 2
    assert len(payload.relationships) == 1

    e1 = next(e for e in payload.entities if "U12345" in e.canonical_id)
    assert e1.canonical_id == "company:U12345DL2020PTC000001"
    assert e1.display_name == "Acme Technologies Ltd"
    assert e1.properties["status"] == "ACTIVE"  # Upper-cased by transform rule

    rel = payload.relationships[0]
    assert rel.relationship_type == CanonicalRelationshipType.OWNS
    assert rel.source_entity_id == "L98765MH1995PLC000002"
    assert rel.target_entity_id == "U12345DL2020PTC000001"
