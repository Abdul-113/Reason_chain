"""
AI Context & Request/Response Models
Derives canonical ontology context from existing domain enums (no manual duplication).
Prepares safe, bounded AI requests from universal ProfileResult + SourceRecord samples.
Enforces sample limits, value truncation, and credential redaction.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field

from app.domain.entities import EntityCategory
from app.domain.relationships import CanonicalRelationshipType
from app.source.models import ProfileResult, FieldDescriptor
from app.source.records import SourceRecord
from app.source.mapping import MappingSpecification

logger = logging.getLogger("reasonchain.source.ai.context")

# Fields whose values must be redacted in AI requests
SENSITIVE_FIELD_PATTERNS = {
    "password", "secret", "private_key", "token", "auth", "credential",
    "api_key", "apikey", "access_key", "service_account",
}

MAX_SAMPLE_RECORDS = 5
MAX_FIELD_VALUE_LENGTH = 200
MAX_SAMPLE_VALUES_PER_FIELD = 3


# ========================================================================
# ONTOLOGY CONTEXT — Derived from existing canonical domain enums
# ========================================================================

def build_ontology_context() -> Dict[str, Any]:
    """
    Build a machine-readable ontology description from the existing canonical domain models.
    Avoids manual duplication by reading directly from EntityCategory and CanonicalRelationshipType enums.
    """
    entities = []
    for ec in EntityCategory:
        entities.append({
            "category": ec.value,
            "description": f"Canonical {ec.value} entity in ReasonChain Knowledge Graph",
        })

    relationships = []
    for rt in CanonicalRelationshipType:
        relationships.append({
            "type": rt.value,
            "description": f"Canonical {rt.value} relationship edge",
        })

    return {
        "platform": "ReasonChain Enterprise Reasoning Platform",
        "version": "1.0",
        "entity_categories": entities,
        "relationship_types": relationships,
        "notes": [
            "Each entity has: canonical_id, entity_type, display_name, properties, provenance, confidence, temporal metadata.",
            "Each relationship has: relationship_id, relationship_type, source_entity_id, target_entity_id, properties, provenance, confidence.",
            "Provenance tracks source system, record ID, path, timestamps.",
            "Use CUSTOM entity or relationship type only when no standard type fits.",
        ]
    }


# ========================================================================
# AMBIGUITY MODEL
# ========================================================================

class FieldAmbiguity(BaseModel):
    """Represents an ambiguous field where multiple semantic interpretations are plausible."""
    field_path: str = Field(..., description="Source field with ambiguous semantics")
    candidate_interpretations: List[str] = Field(default_factory=list, description="Possible semantic meanings")
    selected_interpretation: Optional[str] = Field(default=None, description="The interpretation selected in the proposal")
    evidence: str = Field(default="", description="Evidence supporting the selection or ambiguity")
    confidence: float = Field(default=0.5, ge=0.0, le=1.0, description="Confidence in selected interpretation")


# ========================================================================
# REQUEST / RESPONSE MODELS
# ========================================================================

class MappingProposalRequest(BaseModel):
    """Safe, bounded request sent to an AI mapping provider. No raw credentials."""
    source_id: str = Field(..., description="Universal source ID")
    dataset_id: str = Field(..., description="Universal dataset ID")
    profile_summary: Dict[str, Any] = Field(..., description="Sanitized profile with field descriptors")
    sample_records: List[Dict[str, Any]] = Field(default_factory=list, description="Bounded, truncated sample records")
    related_dataset_profiles: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Profiles of other configured datasets within the same source (for cross-dataset relationship resolution)"
    )
    ontology: Dict[str, Any] = Field(default_factory=dict, description="Canonical ontology context")
    constraints: Dict[str, Any] = Field(default_factory=dict, description="Optional mapping constraints or hints")
    max_entities: int = Field(default=5, description="Max entity mapping rules to propose")
    max_relationships: int = Field(default=5, description="Max relationship mapping rules to propose")


class MappingProposalResponse(BaseModel):
    """Structured response from an AI mapping provider. Machine-validatable."""
    proposal_id: str = Field(..., description="Unique proposal identifier")
    source_id: str = Field(..., description="Source system ID")
    dataset_id: str = Field(..., description="Dataset ID")
    proposed_specification: Optional[MappingSpecification] = Field(default=None, description="Proposed mapping spec")
    rationale: str = Field(default="", description="Human-readable explanation of the proposal")
    ambiguities: List[FieldAmbiguity] = Field(default_factory=list, description="Fields with ambiguous semantics")
    warnings: List[str] = Field(default_factory=list, description="Warnings about the proposal")
    provider_metadata: Dict[str, Any] = Field(default_factory=dict, description="Provider/model/prompt metadata for audit")
    ai_confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="AI-reported confidence")
    system_validation_confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="System deterministic validation confidence")
    generated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Generation timestamp"
    )
    error: Optional[str] = Field(default=None, description="Error message if proposal generation failed")


# ========================================================================
# SAFE PREPARATION
# ========================================================================

def _is_sensitive_field(field_name: str) -> bool:
    """Check if a field name matches sensitive patterns."""
    lower = field_name.lower()
    return any(pat in lower for pat in SENSITIVE_FIELD_PATTERNS)


def _truncate_value(val: Any, max_len: int = MAX_FIELD_VALUE_LENGTH) -> Any:
    """Truncate long string values for safe transmission."""
    if isinstance(val, str) and len(val) > max_len:
        return val[:max_len] + "..."
    if isinstance(val, dict):
        return {k: _truncate_value(v, max_len) for k, v in val.items()}
    if isinstance(val, list):
        return [_truncate_value(v, max_len) for v in val[:5]]
    return val


def prepare_profile_for_ai(profile: ProfileResult) -> Dict[str, Any]:
    """
    Convert a universal ProfileResult into a safe, concise summary for AI consumption.
    Redacts sensitive field values, truncates long strings.
    """
    fields_summary = []
    for fd in profile.fields:
        if _is_sensitive_field(fd.field_path):
            safe_samples = ["[REDACTED]"]
        else:
            safe_samples = [_truncate_value(v) for v in (fd.sample_values or [])[:MAX_SAMPLE_VALUES_PER_FIELD]]

        fields_summary.append({
            "field_path": fd.field_path,
            "inferred_type": fd.inferred_type,
            "nullable": fd.nullable,
            "is_nested": fd.is_nested,
            "presence_ratio": fd.presence_ratio,
            "identifier_likelihood": fd.identifier_likelihood,
            "reference_likelihood": fd.reference_likelihood,
            "temporal_likelihood": fd.temporal_likelihood,
            "sample_values": safe_samples,
            "distinct_count_estimate": fd.distinct_count_estimate,
        })

    return {
        "dataset_id": profile.dataset.dataset_id,
        "dataset_logical_name": profile.dataset.logical_name,
        "dataset_type": profile.dataset.dataset_type,
        "record_estimate": profile.dataset.record_estimate,
        "records_sampled": profile.records_sampled,
        "total_fields": len(profile.fields),
        "fields": fields_summary,
        "structural_observations": profile.structural_observations,
        "reference_candidates": [rc.model_dump() for rc in profile.reference_candidates],
        "temporal_candidates": [tc.model_dump() for tc in profile.temporal_candidates],
    }


def prepare_samples_for_ai(records: List[SourceRecord], max_records: int = MAX_SAMPLE_RECORDS) -> List[Dict[str, Any]]:
    """
    Prepare bounded, truncated, redacted sample records for AI consumption.
    """
    safe_records = []
    for rec in records[:max_records]:
        safe_attrs = {}
        for k, v in rec.attributes.items():
            if _is_sensitive_field(k):
                safe_attrs[k] = "[REDACTED]"
            else:
                safe_attrs[k] = _truncate_value(v)
        safe_records.append(safe_attrs)
    return safe_records


def build_mapping_request(
    source_id: str,
    dataset_id: str,
    profile: ProfileResult,
    samples: List[SourceRecord],
    constraints: Optional[Dict[str, Any]] = None,
    related_profiles: Optional[List[ProfileResult]] = None,
) -> MappingProposalRequest:
    """Build a complete, safe MappingProposalRequest from universal source artifacts."""
    related_summaries = [prepare_profile_for_ai(rp) for rp in (related_profiles or [])]
    return MappingProposalRequest(
        source_id=source_id,
        dataset_id=dataset_id,
        profile_summary=prepare_profile_for_ai(profile),
        sample_records=prepare_samples_for_ai(samples),
        related_dataset_profiles=related_summaries,
        ontology=build_ontology_context(),
        constraints=constraints or {},
    )
