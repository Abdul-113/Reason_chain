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
