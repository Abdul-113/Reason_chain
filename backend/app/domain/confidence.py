"""
Confidence & Trust Metadata Models
Distinguishes entity, mapping, relationship, and source reliability scores.
"""

from pydantic import BaseModel, Field


class ConfidenceMetadata(BaseModel):
    """
    Confidence ratings supporting downstream probabilistic reasoning and scoring.
    """
    mapping_confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Confidence in schema mapping")
    entity_confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Confidence in entity identity/resolution")
    relationship_confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Confidence in relationship validity")
    source_reliability: float = Field(default=1.0, ge=0.0, le=1.0, description="Reliability rating of source system")
