"""
Pydantic Schemas for ReasonChain Data Flow
Interface definitions for ingestion, graph, and investigation APIs.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class HealthResponse(BaseModel):
    status: str

class PostgresConfigRequest(BaseModel):
    host: str = Field(default="localhost")
    port: int = Field(default=5432)
    database: str = Field(default="reasonchain_demo")
    username: str = Field(default="postgres")
    password: str = Field(default="postgres")

class PostgresConnectionResponse(BaseModel):
    success: bool
    message: str
    engine: str

class TableInfo(BaseModel):
    table_name: str
    row_count: int

class TableListResponse(BaseModel):
    tables: List[TableInfo]

class ColumnInfo(BaseModel):
    name: str
    type: str

class TableDetailResponse(BaseModel):
    table_name: str
    columns: List[ColumnInfo]
    sample_rows: List[List[Any]]

class TableSelectionRequest(BaseModel):
    tables: List[str]

class IngestionStatusResponse(BaseModel):
    status: str
    tables_processed: int
    total_records: int

class InvestigationQueryRequest(BaseModel):
    query: str
    max_hops: Optional[int] = 3

class InvestigationResponse(BaseModel):
    query: str
    risk_level: str
    confidence: str
    proof_steps: List[Dict[str, Any]]


# ============================================================
# FIREBASE REALTIME DATABASE SCHEMAS
# ============================================================

class FirebaseConfigRequest(BaseModel):
    database_url: Optional[str] = Field(default=None, description="Firebase Realtime Database URL")
    service_account_path: Optional[str] = Field(default=None, description="Path to service account JSON (optional override)")

class FirebaseConnectionResponse(BaseModel):
    success: bool
    message: str
    database_url: str
    collections: List[str] = Field(default_factory=list)
    total_collections: int = 0

class FirebasePathInfo(BaseModel):
    path: str
    name: str
    record_count: int
    is_synthetic: bool = False
    description: Optional[str] = None

class FirebasePathsResponse(BaseModel):
    paths: List[FirebasePathInfo]
    total_paths: int
    total_records: int

class DatasetSelectionItem(BaseModel):
    dataset_id: str
    logical_name: Optional[str] = None
    physical_identifier: str
    record_estimate: Optional[int] = None
    is_synthetic: bool = False
    included: bool = True
    description: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

class SourceConfigRequest(BaseModel):
    source_id: str = "firebase_rtdb"
    source_type: str = "firebase"
    display_name: str = "Firebase Realtime Database"
    datasets: List[DatasetSelectionItem] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)

class SourceConfigResponse(BaseModel):
    success: bool
    source_id: str
    source_type: str
    display_name: str
    total_datasets_discovered: int
    selected_datasets_count: int
    datasets: List[DatasetSelectionItem]
    message: str

class FirebaseSampleResponse(BaseModel):
    path: str
    sample_count: int
    fields: List[str]
    sample_records: List[Dict[str, Any]]

class FirebaseStatusResponse(BaseModel):
    status: str
    is_configured: bool
    database_url: Optional[str] = None
    project_id: Optional[str] = None
    service_account_found: bool = False


# ============================================================
# FIREBASE DATA PROFILER SCHEMAS
# ============================================================

class FirebaseProfileRequest(BaseModel):
    paths: Optional[List[str]] = Field(default=None, description="List of Firebase paths to profile (e.g. ['/companies']). If empty, all discovered paths will be profiled.")
    sample_limit: int = Field(default=10, ge=1, le=50, description="Maximum sample records to read per path")
    max_depth: int = Field(default=4, ge=1, le=8, description="Maximum nesting depth to inspect")
    max_fields: int = Field(default=100, ge=5, le=300, description="Maximum number of fields to profile per branch")
    cross_validate_references: bool = Field(default=True, description="Whether to cross-check reference candidates against other discovered branch keys")


class FirebaseFieldProfile(BaseModel):
    field_path: str = Field(..., description="Dot-notated or array-notated field path (e.g. 'cin', 'address.city', 'directors[].personId')")
    observed_types: List[str] = Field(default_factory=list, description="All distinct types observed across sampled records (e.g. ['string'], ['string', 'null'])")
    presence_count: int = Field(default=0, description="Number of sampled records containing this field with a non-null value")
    null_count: int = Field(default=0, description="Number of sampled records where field value is explicitly null")
    missing_count: int = Field(default=0, description="Number of sampled records where field is completely missing")
    total_sampled: int = Field(default=0, description="Total records sampled in this branch")
    presence_ratio: float = Field(default=0.0, description="Presence percentage (0.0 to 1.0)")
    is_nested: bool = Field(default=False, description="True if field is within a nested object")
    is_array: bool = Field(default=False, description="True if field is an array or inside an array")
    array_item_types: Optional[List[str]] = Field(default=None, description="Observed array element types if this field is an array")
    candidate_identifier: bool = Field(default=False, description="True if field looks structurally suitable as an identifier")
    identifier_reason: Optional[str] = Field(default=None, description="Evidence heuristic explaining why this is a candidate identifier")
    candidate_reference: bool = Field(default=False, description="True if field appears to be a foreign reference to another entity/branch")
    reference_reason: Optional[str] = Field(default=None, description="Evidence heuristic explaining why this is a candidate reference")
    candidate_temporal: bool = Field(default=False, description="True if field appears to contain date/time/temporal data")
    temporal_reason: Optional[str] = Field(default=None, description="Evidence heuristic explaining why this is a candidate temporal field")
    temporal_format: Optional[str] = Field(default=None, description="Detected temporal format (e.g. 'ISO-8601 Date', 'Unix Timestamp')")
    sample_values: List[Any] = Field(default_factory=list, description="Bounded, sanitized, truncated sample values")
    unique_value_count: int = Field(default=0, description="Number of distinct values observed in sample")


class FirebaseReferenceCandidate(BaseModel):
    source_path: str = Field(..., description="Source Firebase branch (e.g. '/suppliers')")
    source_field: str = Field(..., description="Source candidate reference field (e.g. 'company_id')")
    target_path: Optional[str] = Field(default=None, description="Potential target Firebase branch (e.g. '/companies')")
    reason: str = Field(..., description="Evidence heuristic description")
    match_rate: Optional[float] = Field(default=None, description="Observed match rate against target branch child keys (0.0 to 1.0)")
    sampled_matches: Optional[int] = Field(default=None, description="Number of sampled values that matched target keys")
    sampled_total: Optional[int] = Field(default=None, description="Total non-null sampled reference values checked")


class FirebaseBranchProfile(BaseModel):
    path: str = Field(..., description="Firebase branch path (e.g. '/companies')")
    name: str = Field(..., description="Firebase branch key name")
    exists: bool = Field(default=True, description="True if branch exists and is accessible")
    approx_child_count: int = Field(default=0, description="Approximate direct child count from shallow query")
    sample_size: int = Field(default=0, description="Number of records sampled and profiled")
    is_collection_like: bool = Field(default=True, description="True if branch represents a collection/list of records")
    is_object_like: bool = Field(default=False, description="True if branch is a single object/map rather than a collection")
    is_primitive_like: bool = Field(default=False, description="True if branch is a primitive value")
    has_nested_children: bool = Field(default=False, description="True if sampled records contain nested objects")
    has_arrays: bool = Field(default=False, description="True if sampled records contain arrays")
    fields: List[FirebaseFieldProfile] = Field(default_factory=list, description="Profile of all discovered fields in this branch")
    candidate_identifiers: List[str] = Field(default_factory=list, description="List of candidate identifier field paths")
    candidate_references: List[str] = Field(default_factory=list, description="List of candidate reference field paths")
    candidate_temporal_fields: List[str] = Field(default_factory=list, description="List of candidate temporal field paths")
    reference_cross_checks: List[FirebaseReferenceCandidate] = Field(default_factory=list, description="Cross-branch reference validation results")
    warnings: List[str] = Field(default_factory=list, description="Warnings encountered during profiling")


class FirebaseDataProfileResponse(BaseModel):
    success: bool = True
    database_url: Optional[str] = None
    project_id: Optional[str] = None
    profiled_at: str = Field(..., description="ISO timestamp of profiling completion")
    config_limits: Dict[str, Any] = Field(default_factory=dict, description="Configuration limits used during profiling")
    total_branches_profiled: int = 0
    branches: List[FirebaseBranchProfile] = Field(default_factory=list, description="Profiles for each selected/discovered branch")
    global_reference_candidates: List[FirebaseReferenceCandidate] = Field(default_factory=list, description="All cross-branch candidate references found")
    human_readable_summary: str = Field(..., description="Formatted markdown report of the profiling results")


# ============================================================
# FIREBASE ENTITY MAPPER SCHEMAS
# ============================================================

class FirebaseMappingRequest(BaseModel):
    path: str = Field(default="/companies", description="Firebase collection path to map")
    limit: int = Field(default=100, ge=1, le=500, description="Maximum records to map")
    include_relationships: bool = Field(default=True, description="Whether to extract entity relationships (directors, state, country)")
    include_nested_entities: bool = Field(default=True, description="Whether to extract nested entities (e.g., directors from arrays)")


class FirebaseMappedEntitySummary(BaseModel):
    canonical_id: str
    entity_type: str
    display_name: str
    properties: Dict[str, Any] = Field(default_factory=dict)
    source_system: str = "firebase"
    source_path: Optional[str] = None
    mapping_confidence: float = 1.0


class FirebaseMappedRelationshipSummary(BaseModel):
    relationship_id: str
    relationship_type: str
    source_entity_id: str
    target_entity_id: str
    source_entity_type: str = ""
    target_entity_type: str = ""
    properties: Dict[str, Any] = Field(default_factory=dict)


class FirebaseMappingResponse(BaseModel):
    success: bool = True
    path: str = ""
    total_records_processed: int = 0
    total_entities: int = 0
    total_relationships: int = 0
    entity_type_counts: Dict[str, int] = Field(default_factory=dict)
    relationship_type_counts: Dict[str, int] = Field(default_factory=dict)
    provenance_summary: Dict[str, Any] = Field(default_factory=dict)
    entities: List[FirebaseMappedEntitySummary] = Field(default_factory=list)
    relationships: List[FirebaseMappedRelationshipSummary] = Field(default_factory=list)
    mapping_duration_ms: int = 0

