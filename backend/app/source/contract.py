"""
Universal Source Contract
Defines the standard abstract lifecycle interface that any external data source connector must implement.
Establishes a uniform boundary across relational (PostgreSQL), NoSQL (Firebase, MongoDB), file (CSV, Parquet),
and API data sources.

Lifecycle:
CONNECT -> DISCOVER -> PROFILE -> EXTRACT
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field

from app.source.models import (
    SourceCapability,
    SourceDescriptor,
    DatasetDescriptor,
    ProfileResult,
)
from app.source.records import SourceBatch


class ConnectionTestResult(BaseModel):
    """Result of testing connectivity and credentials to an external source."""
    success: bool = Field(..., description="Whether the connection test succeeded")
    message: str = Field(..., description="Human-readable status or diagnostic message")
    connection_time_ms: float = Field(default=0.0, description="Observed round-trip ping/handshake time in milliseconds")
    capabilities: List[SourceCapability] = Field(default_factory=list, description="Verified available adapter capabilities")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Safe runtime information (engine version, cluster name)")
    tested_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Timestamp when test occurred"
    )


class ExtractOptions(BaseModel):
    """Parameters for bounded or paginated record extraction."""
    limit: int = Field(default=100, ge=1, le=1000, description="Maximum number of records to return in this batch")
    offset: Optional[int] = Field(default=None, ge=0, description="Optional zero-based record offset (for SQL/indexed sources)")
    cursor: Optional[str] = Field(default=None, description="Opaque pagination cursor (for NoSQL/streaming sources)")
    fields: Optional[List[str]] = Field(default=None, description="Optional projection list of specific field paths to extract")
    filters: Optional[Dict[str, Any]] = Field(default=None, description="Optional source-side filtering expressions")


class ProfileOptions(BaseModel):
    """Configuration options for dataset and source profiling."""
    sample_limit: int = Field(default=25, ge=1, le=500, description="Number of sample records to inspect per dataset")
    max_depth: int = Field(default=5, ge=1, le=10, description="Maximum nesting depth when profiling complex/hierarchical structures")
    include_reference_candidates: bool = Field(default=True, description="Whether to detect potential foreign keys and cross-dataset references")
    include_temporal_candidates: bool = Field(default=True, description="Whether to detect date and timestamp fields")


class BaseSourceAdapter(ABC):
    """
    Universal abstract base class for all data source adapters.
    Any supported database or connector (PostgreSQL, Firebase, MongoDB, CSV, etc.)
    must implement this interface.
    """

    @abstractmethod
    def connect(self) -> ConnectionTestResult:
        """
        Verify connection and authentication to the source system.
        Must NOT expose raw secrets or credentials in the response.
        """
        pass

    @abstractmethod
    def get_descriptor(self) -> SourceDescriptor:
        """
        Return the source descriptor providing metadata and capabilities for this source.
        """
        pass

    @abstractmethod
    def discover_datasets(self) -> List[DatasetDescriptor]:
        """
        Discover all available datasets, tables, branches, or collections in the source.
        """
        pass

    @abstractmethod
    def get_dataset(self, dataset_id: str) -> Optional[DatasetDescriptor]:
        """
        Get metadata for a specific dataset within the source.
        """
        pass

    @abstractmethod
    def profile_dataset(self, dataset_id: str, options: Optional[ProfileOptions] = None) -> ProfileResult:
        """
        Execute bounded observational profiling on a specific dataset.
        Returns field descriptors, types, fill rates, and candidate relationships.
        """
        pass

    @abstractmethod
    def profile_source(self, options: Optional[ProfileOptions] = None) -> List[ProfileResult]:
        """
        Profile all discovered datasets within the source.
        """
        pass

    @abstractmethod
    def extract_records(self, dataset_id: str, options: Optional[ExtractOptions] = None) -> SourceBatch:
        """
        Extract a bounded batch of records from a dataset and return them normalized
        into universal SourceRecord objects.
        """
        pass
