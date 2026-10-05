"""
Universal Source Metadata Models
Source-agnostic abstractions describing data sources, datasets, fields, and profiles.
Strictly decoupled from concrete storage engines (PostgreSQL, Firebase, MongoDB, CSV, APIs).
Ensures no credentials, secret tokens, or internal driver objects are stored or leaked.
"""

from enum import Enum
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class SourceCapability(str, Enum):
    """Functional capabilities supported by an external data source adapter."""
    DISCOVERY = "discovery"
    PROFILING = "profiling"
    BOUNDED_EXTRACTION = "bounded_extraction"
    STREAMING = "streaming"
    SCHEMA_INSPECTION = "schema_inspection"


class SourceStatus(str, Enum):
    """Operational status of a configured data source."""
    CONFIGURED = "configured"
    CONNECTED = "connected"
    DEGRADED = "degraded"
    UNREACHABLE = "unreachable"
    UNCONFIGURED = "unconfigured"


class DatasetDescriptor(BaseModel):
    """
    Source-agnostic descriptor representing a tabular dataset, NoSQL branch, collection, or resource.
    Abstracts away specific concepts like SQL tables, Firebase paths, or Mongo collections.
    """
    dataset_id: str = Field(..., description="Unique identifier for the dataset within the source")
    source_id: str = Field(..., description="Reference to parent source_id")
    logical_name: Optional[str] = Field(default=None, description="Domain-level or user-facing dataset name")
    physical_identifier: str = Field(..., description="Physical path or table name in underlying system (e.g. 'companies', '/companies')")
    dataset_type: str = Field(default="table", description="Conceptual type (e.g. 'table', 'document_branch', 'event_stream', 'file')")
    record_estimate: Optional[int] = Field(default=None, description="Estimated or exact total record count if known")
    is_synthetic: bool = Field(default=False, description="Whether this dataset contains synthetic or test data")
    description: Optional[str] = Field(default=None, description="Optional description of dataset contents")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Safe structural attributes")


class DatasetSelection(BaseModel):
    """
    Represents an explicitly chosen or excluded dataset under a source configuration.
    """
    dataset_id: str = Field(..., description="Unique dataset identifier within source")
    logical_name: Optional[str] = Field(default=None, description="Human-readable dataset name")
    physical_identifier: str = Field(..., description="Physical path or table name (e.g. '/companies')")
    dataset_type: str = Field(default="table", description="Conceptual type (table, document_branch, etc.)")
    record_estimate: Optional[int] = Field(default=None, description="Record count estimate")
    is_synthetic: bool = Field(default=False, description="Whether this dataset contains synthetic or test data")
    included: bool = Field(default=True, description="Whether this dataset is included for ingestion/reasoning")
    description: Optional[str] = Field(default=None, description="Dataset description")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class SourceDescriptor(BaseModel):
    """
    Source-agnostic metadata describing an external source system.
    Strictly contains safe, non-sensitive summary info. No passwords, private keys, or tokens.
    """
    source_id: str = Field(..., description="Unique logical identifier for the source system (e.g. 'firebase_main', 'pg_dw')")
    source_type: str = Field(..., description="Connector category (e.g. 'firebase', 'postgres', 'mongodb', 'csv', 'rest_api')")
    display_name: str = Field(..., description="Human-readable display name")
    description: Optional[str] = Field(default=None, description="Detailed description of the source and its domain")
    capabilities: List[SourceCapability] = Field(default_factory=list, description="Supported adapter operations")
    status: SourceStatus = Field(default=SourceStatus.CONFIGURED, description="Current connection status")
    connection_summary: Dict[str, Any] = Field(
        default_factory=dict,
        description="Safe summary of connection parameters (e.g. host, database name, project ID) excluding credentials"
    )
    datasets: List[DatasetDescriptor] = Field(
        default_factory=list,
        description="Discovered or configured datasets under this source"
    )
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional non-sensitive tags or environment metadata")


class SourceConfiguration(BaseModel):
    """
    Persisted configuration for a connected source system, encapsulating
    one source with multiple selected datasets.
    """
    source_id: str = Field(..., description="Unique source identifier")
    source_type: str = Field(..., description="Source connector type (firebase, postgres, mongodb, csv, rest_api)")
    display_name: str = Field(default="Data Source", description="Human-readable source name")
    datasets: List[DatasetSelection] = Field(
        default_factory=list,
        description="Selected datasets within this source"
    )
    connection_summary: Dict[str, Any] = Field(default_factory=dict, description="Safe connection summary")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional configuration metadata")

    def get_included_datasets(self) -> List[DatasetSelection]:
        """Return only datasets that are marked as included."""
        return [d for d in self.datasets if d.included]

    def validate_selection(self) -> bool:
        """Validate that at least one dataset is included."""
        if not self.get_included_datasets():
            raise ValueError(f"Source configuration for '{self.source_id}' must have at least one included dataset.")
        return True


class FieldDescriptor(BaseModel):
    """
    Source-agnostic descriptor for a field, column, or JSON attribute within a dataset.
    """
    field_path: str = Field(..., description="Field name or nested dotted path (e.g. 'cin', 'address.city')")
    inferred_type: str = Field(..., description="Standardized primitive type ('string', 'integer', 'float', 'boolean', 'datetime', 'object', 'array', 'null')")
    nullable: bool = Field(default=True, description="Whether null or missing values were observed")
    is_nested: bool = Field(default=False, description="Whether this field represents a nested object or array structure")
    sample_values: List[Any] = Field(
        default_factory=list,
        description="Bounded, sanitized sample values demonstrating observed formats (sensitive values redacted)"
    )
    identifier_likelihood: float = Field(default=0.0, ge=0.0, le=1.0, description="Heuristic likelihood that this field serves as a primary/unique key")
    reference_likelihood: float = Field(default=0.0, ge=0.0, le=1.0, description="Heuristic likelihood that this field references another entity or dataset")
    temporal_likelihood: float = Field(default=0.0, ge=0.0, le=1.0, description="Heuristic likelihood that this field represents an event or validity timestamp")
    presence_ratio: float = Field(default=1.0, ge=0.0, le=1.0, description="Observed fill rate or presence ratio (0.0 - 1.0)")
    distinct_count_estimate: Optional[int] = Field(default=None, description="Estimated count of distinct values in sample")


class ReferenceCandidate(BaseModel):
    """
    A structural or heuristic observation indicating that a field references another entity or dataset.
    """
    source_field: str = Field(..., description="Field in current dataset acting as reference pointer")
    target_dataset_candidate: Optional[str] = Field(default=None, description="Inferred or known target dataset name")
    target_field_candidate: Optional[str] = Field(default=None, description="Inferred target identifier field")
    confidence: float = Field(default=0.5, ge=0.0, le=1.0, description="Confidence of reference detection")
    candidate_type: str = Field(default="foreign_key", description="Type of reference: 'foreign_key', 'shared_identifier', 'nested_ref'")
    rationale: Optional[str] = Field(default=None, description="Heuristic or naming pattern explaining the recommendation")


class TemporalCandidate(BaseModel):
    """
    Observation indicating that a field contains temporal, chronological, or validity information.
    """
    field_path: str = Field(..., description="Field path observed to contain date or time data")
    detected_format: str = Field(..., description="Detected pattern: 'iso8601', 'unix_timestamp', 'standard_date', 'custom'")
    confidence: float = Field(default=0.8, ge=0.0, le=1.0, description="Confidence in temporal classification")
    sample_value: Optional[str] = Field(default=None, description="Safe formatted sample string")


class ProfileResult(BaseModel):
    """
    Universal profiling result representing observed schema, statistics, and relationship candidates.
    Independent of whether the profiler inspected Firebase JSON trees, PostgreSQL tables, or Parquet files.
    """
    source_id: str = Field(..., description="Source system identifier")
    dataset: DatasetDescriptor = Field(..., description="The profiled dataset")
    fields: List[FieldDescriptor] = Field(default_factory=list, description="Profiled field descriptions")
    records_sampled: int = Field(default=0, description="Total records sampled during profiling")
    structural_observations: Dict[str, Any] = Field(
        default_factory=dict,
        description="High-level structural traits (e.g. max nesting depth, uniform schema ratio)"
    )
    reference_candidates: List[ReferenceCandidate] = Field(
        default_factory=list,
        description="Candidate links to other datasets"
    )
    temporal_candidates: List[TemporalCandidate] = Field(
        default_factory=list,
        description="Fields detected as timestamps or validity dates"
    )
    profiled_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="UTC timestamp when profile was generated"
    )
    profiling_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Execution metadata (duration, sample strategy, adapter version)"
    )

    def get_field(self, field_path: str) -> Optional[FieldDescriptor]:
        """Find a field descriptor by path."""
        for f in self.fields:
            if f.field_path == field_path:
                return f
        return None
