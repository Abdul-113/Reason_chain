"""
Canonical Relationship Domain Models
Source-independent representation of enterprise graph relationships in ReasonChain.
"""

from enum import Enum
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
from app.domain.provenance import ProvenanceMetadata
from app.domain.confidence import ConfidenceMetadata
from app.domain.temporal import TemporalMetadata


class CanonicalRelationshipType(str, Enum):
    OWNS = "OWNS"
    DIRECTOR_OF = "DIRECTOR_OF"
    HAS_DIRECTOR = "HAS_DIRECTOR"
    SUPPLIES = "SUPPLIES"
    HAS_CONTRACT = "HAS_CONTRACT"
    REGISTERED_IN = "REGISTERED_IN"
    SANCTIONED_BY = "SANCTIONED_BY"
    TRANSACTS_WITH = "TRANSACTS_WITH"
    USES = "USES"
    VIOLATES = "VIOLATES"
    LOCATED_IN = "LOCATED_IN"
    REGISTERED_IN_STATE = "REGISTERED_IN_STATE"
    CUSTOM = "CUSTOM"


class CanonicalRelationship(BaseModel):
    """
    Source-agnostic canonical representation of a graph relationship.
    """
    relationship_id: str = Field(..., description="Unique identifier of this relationship edge")
    relationship_type: CanonicalRelationshipType = Field(..., description="Semantic relationship type")
    source_entity_id: str = Field(..., description="Canonical ID of origin entity")
    source_entity_type: str = Field(default="Company", description="Label/Type of origin entity")
    target_entity_id: str = Field(..., description="Canonical ID of destination entity")
    target_entity_type: str = Field(default="Company", description="Label/Type of destination entity")
    properties: Dict[str, Any] = Field(default_factory=dict, description="Edge properties and metadata")
    provenance: Optional[ProvenanceMetadata] = Field(
        default=None,
        description="Source provenance metadata for this relationship"
    )
    confidence: ConfidenceMetadata = Field(
        default_factory=ConfidenceMetadata,
        description="Confidence scores for this relationship"
    )
    temporal: Optional[TemporalMetadata] = Field(
        default=None,
        description="Optional temporal validity metadata"
    )

    class Config:
        use_enum_values = True

    def to_neo4j_rel_dict(self) -> Dict[str, Any]:
        """
        Adapter method for Neo4j relationship insertion.
        Flattens canonical relationship into Neo4j dict expected by writer & APIs.
        """
        props = dict(self.properties)
        props["relationship_id"] = self.relationship_id
        props["relationship_type"] = str(self.relationship_type)

        # Confidence
        if self.confidence:
            props["confidence"] = self.confidence.relationship_confidence
            props["relationship_confidence"] = self.confidence.relationship_confidence
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
        if props.get("mock_record") or props.get("is_synthetic") or "mock" in self.relationship_id.lower():
            props["is_synthetic"] = True
            props["mock_record"] = True
        else:
            props["is_synthetic"] = False

        if self.provenance:
            props["source_system"] = self.provenance.source_system
            props["source_type"] = str(self.provenance.source_type)
            if self.provenance.source_path:
                props["source_path"] = self.provenance.source_path
            if self.provenance.source_record_id:
                props["source_record_id"] = self.provenance.source_record_id
            if self.provenance.observed_at:
                props["observed_at"] = self.provenance.observed_at
            if self.provenance.ingested_at:
                props["ingested_at"] = self.provenance.ingested_at

        return {
            "rel_type": str(self.relationship_type),
            "from_label": self.source_entity_type,
            "from_key": "canonical_entity_id",
            "from_value": self.source_entity_id,
            "to_label": self.target_entity_type,
            "to_key": "canonical_entity_id",
            "to_value": self.target_entity_id,
            "properties": props,
        }
