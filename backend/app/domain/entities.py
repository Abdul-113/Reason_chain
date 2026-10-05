"""
Canonical Entity Domain Models
Source-independent representation of enterprise entities in ReasonChain.
"""

from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from app.domain.provenance import ProvenanceMetadata
from app.domain.confidence import ConfidenceMetadata
from app.domain.temporal import TemporalMetadata


class EntityCategory(str, Enum):
    COMPANY = "Company"
    PERSON = "Person"
    SUPPLIER = "Supplier"
    CONTRACT = "Contract"
    SANCTION = "Sanction"
    COUNTRY = "Country"
    ACCOUNT = "Account"
    TRANSACTION = "Transaction"
    DIRECTOR = "Director"
    DEVICE = "Device"
    RULE = "Rule"
    CUSTOM = "Custom"


class CanonicalEntity(BaseModel):
    """
    Source-agnostic canonical representation of an enterprise entity.
    """
    canonical_id: str = Field(..., description="Stable internal identifier")
    entity_type: EntityCategory = Field(..., description="Semantic entity category")
    display_name: str = Field(..., description="Human-readable label or display name")
    properties: Dict[str, Any] = Field(default_factory=dict, description="Domain properties and attributes")
    source_references: List[ProvenanceMetadata] = Field(
        default_factory=list,
        description="Source provenance records linking back to original datasets"
    )
    confidence: ConfidenceMetadata = Field(
        default_factory=ConfidenceMetadata,
        description="Confidence scores for this entity"
    )
    temporal: Optional[TemporalMetadata] = Field(
        default=None,
        description="Optional temporal validity metadata"
    )

    class Config:
        use_enum_values = True

    def add_source_reference(self, provenance: ProvenanceMetadata) -> None:
        """Attach a source reference to maintain multi-source provenance history."""
        self.source_references.append(provenance)

    def to_neo4j_node_dict(self, key_field: Optional[str] = None) -> Dict[str, Any]:
        """
        Adapter method for Neo4j node insertion.
        Flattens canonical entity into Neo4j dict expected by writer & APIs.
        """
        props = dict(self.properties)
        props["id"] = self.canonical_id
        props["canonical_id"] = self.canonical_id
        props["canonical_entity_id"] = self.canonical_id
        props["name"] = self.display_name
        props["display_name"] = self.display_name
        props["entity_type"] = str(self.entity_type)
        
        # Confidence
        if self.confidence:
            props["entity_confidence"] = self.confidence.entity_confidence
            props["mapping_confidence"] = self.confidence.mapping_confidence
            props["source_reliability"] = self.confidence.source_reliability

        # Temporal
        if self.temporal:
            if self.temporal.observed_at:
                props["observed_at"] = self.temporal.observed_at
            if self.temporal.valid_from:
                props["valid_from"] = self.temporal.valid_from
            if self.temporal.valid_to:
                props["valid_to"] = self.temporal.valid_to

        # Synthetic indicator
        if props.get("mock_record") or props.get("is_synthetic") or "mock" in self.canonical_id.lower():
            props["is_synthetic"] = True
            props["mock_record"] = True
        else:
            props["is_synthetic"] = False

        # Attach primary provenance if available
        if self.source_references:
            props["source_count"] = len(self.source_references)
            prim = self.source_references[0]
            props["source_system"] = prim.source_system
            props["source_type"] = str(prim.source_type)
            if prim.source_record_id:
                props["source_record_id"] = prim.source_record_id
            if prim.source_path:
                props["source_path"] = prim.source_path

        actual_key = key_field or ("code" if str(self.entity_type) == "Country" else "id")
        return {
            "label": str(self.entity_type),
            "key_field": actual_key,
            "properties": props,
        }
