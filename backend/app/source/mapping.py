"""
Universal Mapping Specification Models & AI Assistant Interface
Defines declarative, source-agnostic mapping specifications for transforming
normalized SourceRecord objects into Canonical ReasonChain Entities and Relationships.
Enforces the boundary: mapping rules are explicit data structures, not hard-coded database queries.
"""

from enum import Enum
from typing import List, Dict, Any, Optional, Protocol, runtime_checkable
from datetime import datetime, timezone
from pydantic import BaseModel, Field

from app.domain.entities import EntityCategory
from app.domain.relationships import CanonicalRelationshipType
from app.source.models import DatasetDescriptor, ProfileResult


class MappingOrigin(str, Enum):
    """Origin or provenance of a semantic mapping rule."""
    DETERMINISTIC = "deterministic"   # Handcrafted or deterministically inferred by heuristic rules
    USER_DEFINED = "user_defined"     # Explicitly created or modified by a human analyst
    AI_PROPOSED = "ai_proposed"       # Proposed by a language model or neural assistant (requires approval)


class ValidationStatus(str, Enum):
    """Deterministic validation state of a mapping specification."""
    VALID = "valid"
    INVALID = "invalid"
    WARNING = "warning"
    UNVALIDATED = "unvalidated"


class ApprovalStatus(str, Enum):
    """Governance and human-in-the-loop review status."""
    APPROVED = "approved"             # Approved for active ingestion into Knowledge Graph
    PENDING = "pending"               # Requires human or supervisory review before activation
    REJECTED = "rejected"             # Rejected / discarded mapping proposal


class TransformType(str, Enum):
    """Standard transformations applied to source fields during normalization."""
    DIRECT = "direct"                 # Direct copy without modification
    LOWERCASE = "lowercase"
    UPPERCASE = "uppercase"
    STRIP = "strip"
    PARSE_INT = "parse_int"
    PARSE_FLOAT = "parse_float"
    PARSE_DATE_ISO = "parse_date_iso"
    PREFIX = "prefix"
    SUFFIX = "suffix"
    CUSTOM = "custom"


class TransformationRule(BaseModel):
    """Transformation instructions applied to extract and convert a field."""
    transform_type: TransformType = Field(default=TransformType.DIRECT, description="Standard transformation function")
    params: Dict[str, Any] = Field(default_factory=dict, description="Parameters for transformation (e.g. prefix string, date format)")
    default_value: Optional[Any] = Field(default=None, description="Fallback value if source field is absent or null")

    def apply(self, val: Any) -> Any:
        """Apply transformation logic to a raw value."""
        if val is None:
            return self.default_value

        if self.transform_type == TransformType.DIRECT:
            return val
        elif self.transform_type == TransformType.LOWERCASE:
            return str(val).lower()
        elif self.transform_type == TransformType.UPPERCASE:
            return str(val).upper()
        elif self.transform_type == TransformType.STRIP:
            return str(val).strip()
        elif self.transform_type == TransformType.PARSE_INT:
            try:
                return int(val)
            except (ValueError, TypeError):
                return self.default_value
        elif self.transform_type == TransformType.PARSE_FLOAT:
            try:
                return float(val)
            except (ValueError, TypeError):
                return self.default_value
        elif self.transform_type == TransformType.PREFIX:
            prefix = self.params.get("prefix", "")
            return f"{prefix}{val}"
        elif self.transform_type == TransformType.SUFFIX:
            suffix = self.params.get("suffix", "")
            return f"{val}{suffix}"
        return val


class FieldMappingRule(BaseModel):
    """
    Maps an attribute path in SourceRecord.attributes to a property on a CanonicalEntity or CanonicalRelationship.
    """
    source_field: str = Field(..., description="Field name or dotted path in SourceRecord (e.g. 'cin', 'address.city')")
    target_property: str = Field(..., description="Target property key in canonical domain model")
    transformation: TransformationRule = Field(
        default_factory=TransformationRule,
        description="Transformation rule to apply during mapping"
    )
    required: bool = Field(default=False, description="Whether this field must be present to map the entity/property")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Confidence in this field mapping")


class EntityMappingRule(BaseModel):
    """
    Rules for producing a CanonicalEntity from a SourceRecord.
    """
    target_entity_category: EntityCategory = Field(..., description="Canonical category (Company, Person, Country, etc.)")
    identifier_field: str = Field(..., description="Source attribute providing entity ID or key")
    id_namespace: Optional[str] = Field(
        default=None,
        description="Optional namespace prefix for canonical ID (e.g. 'company', 'person'). Result: '{namespace}:{id}'"
    )
    display_name_field: Optional[str] = Field(
        default=None,
        description="Source attribute providing human-readable display name"
    )
    default_display_name: Optional[str] = Field(
        default=None,
        description="Fallback label if display_name_field is absent"
    )
    field_mappings: List[FieldMappingRule] = Field(
        default_factory=list,
        description="Mappings for entity properties"
    )
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Overall entity mapping confidence")


class RelationshipMappingRule(BaseModel):
    """
    Rules for producing a CanonicalRelationship from a SourceRecord or between mapped entities.
    """
    target_relationship_type: CanonicalRelationshipType = Field(
        ...,
        description="Canonical relationship type (OWNS, DIRECTOR_OF, LOCATED_IN, etc.)"
    )
    source_entity_ref: str = Field(
        ...,
        description="Attribute providing origin entity ID, or '$PRIMARY' for current entity"
    )
    source_entity_type: str = Field(default="Company", description="Label/Type of origin entity")
    target_entity_ref: str = Field(
        ...,
        description="Attribute providing destination entity ID"
    )
    target_entity_type: str = Field(default="Company", description="Label/Type of destination entity")
    generate_target_entity: bool = Field(
        default=False,
        description="Whether to automatically synthesize target CanonicalEntity if not mapped separately (e.g. Country or State)"
    )
    target_entity_category: Optional[EntityCategory] = Field(
        default=None,
        description="Target entity category if auto-generating target entity"
    )
    target_entity_name_field: Optional[str] = Field(
        default=None,
        description="Attribute providing display name for auto-generated target entity"
    )
    field_mappings: List[FieldMappingRule] = Field(
        default_factory=list,
        description="Mappings for edge properties"
    )
    confidence: float = Field(default=0.9, ge=0.0, le=1.0, description="Relationship mapping confidence")
    condition_field: Optional[str] = Field(
        default=None,
        description="Attribute that must be truthy/present for relationship to be generated"
    )


class MappingSpecification(BaseModel):
    """
    Complete, reusable mapping specification for a dataset.
    Defines all entity and relationship derivation rules without hardcoding database queries.
    """
    mapping_id: str = Field(..., description="Unique identifier for this mapping spec")
    dataset_id: str = Field(..., description="Target dataset ID this specification applies to")
    description: Optional[str] = Field(default=None, description="Human description of mapping rationale")
    target_entities: List[EntityMappingRule] = Field(default_factory=list, description="Entity extraction rules")
    target_relationships: List[RelationshipMappingRule] = Field(default_factory=list, description="Relationship extraction rules")
    origin: MappingOrigin = Field(default=MappingOrigin.DETERMINISTIC, description="Mapping derivation origin")
    validation_status: ValidationStatus = Field(default=ValidationStatus.UNVALIDATED, description="Deterministic validation status")
    approval_status: ApprovalStatus = Field(default=ApprovalStatus.APPROVED, description="Human/governance approval status")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Aggregated specification confidence")
    validation_messages: List[str] = Field(default_factory=list, description="Validation issues, warnings, or notes")
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Creation timestamp"
    )
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Last modified timestamp"
    )
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Safe author or version metadata")

    def validate_rules(self) -> ValidationStatus:
        """
        Deterministically validate rules to ensure identifiers and target fields are well-formed.
        """
        self.validation_messages.clear()
        is_valid = True

        if not self.target_entities:
            self.validation_messages.append("Specification contains no target entity mapping rules.")
            is_valid = False

        for idx, ent in enumerate(self.target_entities):
            if not ent.identifier_field:
                self.validation_messages.append(f"Entity rule #{idx} ({ent.target_entity_category}) missing identifier_field.")
                is_valid = False

        for idx, rel in enumerate(self.target_relationships):
            if not rel.source_entity_ref or not rel.target_entity_ref:
                self.validation_messages.append(f"Relationship rule #{idx} ({rel.target_relationship_type}) missing source or target entity ref.")
                is_valid = False

        self.validation_status = ValidationStatus.VALID if is_valid else ValidationStatus.INVALID
        return self.validation_status

    def is_active(self) -> bool:
        """Whether this specification is validated and approved for live knowledge graph generation."""
        return self.validation_status == ValidationStatus.VALID and self.approval_status == ApprovalStatus.APPROVED


# ========================================================================
# STEP 7: INTERFACE FOR FUTURE AI-ASSISTED MAPPING (Non-Authoritative)
# ========================================================================

@runtime_checkable
class SemanticMappingAssistant(Protocol):
    """
    Protocol defining the boundary for future AI-assisted mapping assistants.
    The LLM is NOT authoritative: proposals are marked as AI_PROPOSED and PENDING,
    and must undergo deterministic validation and human review before becoming active.
    No live API calls or fake outputs are used in this foundation layer.
    """

    def propose_mappings(
        self,
        dataset: DatasetDescriptor,
        profile: ProfileResult,
        canonical_ontology: Dict[str, Any],
        options: Optional[Dict[str, Any]] = None,
    ) -> List[MappingSpecification]:
        """
        Generate candidate mapping specifications given a dataset profile and canonical ontology.
        Implementations must set:
            origin = MappingOrigin.AI_PROPOSED
            approval_status = ApprovalStatus.PENDING
            validation_status = ValidationStatus.UNVALIDATED
        """
        ...

    def validate_proposals(
        self,
        proposals: List[MappingSpecification]
    ) -> List[MappingSpecification]:
        """
        Validate mapping proposals deterministically against canonical schema constraints.
        """
        ...
