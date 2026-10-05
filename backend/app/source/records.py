"""
Universal Intermediate Representation (Normalized Source Output)
Provides a source-agnostic intermediate structure bridging heterogeneous databases
(PostgreSQL rows, Firebase JSON branches, MongoDB documents, CSV records, API responses)
to downstream semantic mapping and knowledge graph construction.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from app.domain.provenance import ProvenanceMetadata, SourceType


class SourceLocation(BaseModel):
    """
    Precise reference pointing back to the physical coordinate of data in the origin source.
    Enables strict auditability and provenance tracing.
    """
    source_id: str = Field(..., description="Unique source identifier")
    dataset_id: str = Field(..., description="Dataset or table/collection/branch identifier")
    record_key: str = Field(..., description="Primary key, document ID, or path key")
    field_path: Optional[str] = Field(default=None, description="Optional nested field path if referencing a specific attribute")

    def to_provenance_string(self) -> str:
        """Format location as a human-readable and indexable URI."""
        base = f"{self.source_id}://{self.dataset_id}/{self.record_key}"
        if self.field_path:
            return f"{base}#{self.field_path}"
        return base


class SourceRecord(BaseModel):
    """
    Universal intermediate representation of an observed data unit.
    All source adapters normalize their physical records into this structure.
    Semantic mapping consumes this without knowing the underlying storage engine.
    """
    source_id: str = Field(..., description="Source system ID")
    dataset_id: str = Field(..., description="Dataset ID containing this record")
    record_id: str = Field(..., description="Primary identifier within the dataset (e.g. primary key, JSON key)")
    attributes: Dict[str, Any] = Field(default_factory=dict, description="Normalized key-value attributes of the record")
    source_location: SourceLocation = Field(..., description="Physical origin coordinate")
    observed_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Timestamp when record was observed or extracted"
    )
    raw_reference_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Source-native reference markers or foreign key pointers"
    )
    provenance_metadata: Optional[ProvenanceMetadata] = Field(
        default=None,
        description="ReasonChain canonical provenance record ready for attachment to graph entities"
    )

    def get_attribute(self, path: str, default: Any = None) -> Any:
        """
        Safely retrieve an attribute value, supporting dot-notation for nested structures.
        e.g. 'address.city' or 'cin'.
        """
        if not path:
            return default
        if "." not in path:
            return self.attributes.get(path, default)

        parts = path.split(".")
        curr = self.attributes
        for part in parts:
            if isinstance(curr, dict) and part in curr:
                curr = curr[part]
            else:
                return default
        return curr

    def to_canonical_provenance(self, source_type: Optional[SourceType] = None) -> ProvenanceMetadata:
        """
        Convert source record location into canonical ProvenanceMetadata.
        If provenance_metadata was already generated on creation, returns it.
        """
        if self.provenance_metadata:
            return self.provenance_metadata

        resolved_source_type = source_type or SourceType.UNKNOWN
        return ProvenanceMetadata(
            source_system=self.source_id,
            source_type=resolved_source_type,
            source_record_id=self.record_id,
            source_table=self.dataset_id,
            source_path=self.source_location.to_provenance_string(),
            observed_at=self.observed_at,
            source_reliability=1.0,
            extraction_confidence=1.0,
        )


class SourceBatch(BaseModel):
    """
    Container for bounded extraction results.
    Transfers records, pagination markers, and batch summary metrics.
    """
    source_id: str = Field(..., description="Origin source system")
    dataset_id: str = Field(..., description="Dataset from which records were read")
    records: List[SourceRecord] = Field(default_factory=list, description="List of extracted universal records")
    total_count: int = Field(default=0, description="Number of records contained in this batch")
    estimated_remaining: Optional[int] = Field(default=None, description="Estimated records remaining in dataset")
    has_more: bool = Field(default=False, description="Whether more records can be fetched")
    next_cursor: Optional[str] = Field(default=None, description="Opaque pagination cursor or offset for next batch")
    extracted_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Extraction timestamp"
    )
