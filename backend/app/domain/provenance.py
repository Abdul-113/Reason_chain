"""
Provenance & Source Evidence Data Models
Tracks original data source, extraction metadata, and evidence references.
"""

from enum import Enum
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class SourceType(str, Enum):
    POSTGRES = "postgres"
    FIREBASE = "firebase"
    EXTERNAL_REGISTRY = "external_registry"
    CSV = "csv"
    REST_API = "rest_api"
    MANUAL = "manual"
    UNKNOWN = "unknown"


class ProvenanceMetadata(BaseModel):
    """
    Source-independent provenance record retaining origin evidence.
    """
    source_system: str = Field(default="postgres", description="Identifier of the origin system")
    source_type: SourceType = Field(default=SourceType.POSTGRES, description="Type of data connector/source")
    source_record_id: Optional[str] = Field(default=None, description="Primary key or record ID in source")
    source_path: Optional[str] = Field(default=None, description="Hierarchical JSON/NoSQL path if applicable")
    source_table: Optional[str] = Field(default=None, description="Source table or collection name")
    source_field: Optional[str] = Field(default=None, description="Source field name if single field origin")
    source_document: Optional[str] = Field(default=None, description="Document/Registry reference code")
    ingested_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Timestamp when record entered ReasonChain"
    )
    observed_at: Optional[str] = Field(default=None, description="Timestamp when fact was observed in source")
    valid_from: Optional[str] = Field(default=None, description="Timestamp from which fact is valid")
    valid_to: Optional[str] = Field(default=None, description="Timestamp until which fact is valid")
    source_reliability: float = Field(default=1.0, ge=0.0, le=1.0, description="Source system reliability score")
    extraction_confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Confidence in extraction/mapping")

    class Config:
        use_enum_values = True
