from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List
from app.models.schemas import (
    PostgresConfigRequest,
    PostgresConnectionResponse,
    TableListResponse,
    TableDetailResponse
)
from app.services.ingestion_service import IngestionService

router = APIRouter()

@router.post("/test-connection", response_model=PostgresConnectionResponse)
def test_database_connection(config: PostgresConfigRequest):
    """
    Test connection to PostgreSQL database.
    """
    result = IngestionService.test_postgres_connection(
        host=config.host,
        port=config.port,
        database=config.database,
        username=config.username,
        password=config.password
    )
    return result

@router.get("/tables", response_model=TableListResponse)
def get_tables(
    host: str = Query(default="localhost"),
    port: int = Query(default=5432),
    database: str = Query(default="reasonchain_demo"),
    username: str = Query(default="postgres"),
    password: str = Query(default="postgres")
):
    """
    Get list of ingested tables and row counts.
    """
    tables = IngestionService.list_available_tables(
        host=host,
        port=port,
        database=database,
        username=username,
        password=password
    )
    return {"tables": tables}

@router.get("/table/{table_name}", response_model=TableDetailResponse)
def get_table_details(
    table_name: str,
    host: str = Query(default="localhost"),
    port: int = Query(default=5432),
    database: str = Query(default="reasonchain_demo"),
    username: str = Query(default="postgres"),
    password: str = Query(default="postgres")
):
    """
    Get column schema and sample rows for a table.
    """
    details = IngestionService.get_table_schema_and_samples(
        table_name=table_name,
        host=host,
        port=port,
        database=database,
        username=username,
        password=password
    )
    return details


# ============================================================
# STEP 3: INGESTION PIPELINE ENDPOINTS
# ============================================================

@router.post("/run")
def run_ingestion():
    """
    Trigger the full PostgreSQL -> Neo4j ingestion pipeline.
    Returns a detailed ingestion summary.
    """
    from app.ingestion.pipeline import run_ingestion_pipeline, is_ingestion_running

    if is_ingestion_running():
        raise HTTPException(
            status_code=409,
            detail="An ingestion job is already running. Please wait for it to complete."
        )

    result = run_ingestion_pipeline()

    if result.get("status") == "error":
        raise HTTPException(
            status_code=500,
            detail=result
        )

    return result


@router.get("/status")
def get_ingestion_status():
    """
    Return the last known ingestion pipeline state.
    """
    from app.ingestion.pipeline import get_last_ingestion_status, is_ingestion_running

    last = get_last_ingestion_status()
    if last is None:
        return {
            "status": "no_runs",
            "last_run": None,
            "nodes": 0,
            "relationships": 0,
            "errors": [],
            "message": "No ingestion pipeline has been executed yet.",
            "is_running": is_ingestion_running(),
        }

    return {
        "status": last.get("status", "unknown"),
        "last_run": last.get("completed_at", last.get("started_at")),
        "nodes": last.get("nodes_created", 0),
        "relationships": last.get("relationships_created", 0),
        "errors": last.get("errors", []),
        "is_running": is_ingestion_running(),
        "details": last,
    }


@router.get("/neo4j-health")
def neo4j_health_check():
    """
    Test Neo4j connectivity and return status.
    """
    from app.db.neo4j import Neo4jConnection

    result = Neo4jConnection.test_connection()
    if result["success"]:
        return {"status": "ok", "neo4j": result["message"], "uri": result.get("uri")}
    else:
        raise HTTPException(status_code=503, detail=result["message"])


# ============================================================
# STEP 4: SAFE SERVER-SIDE ENDPOINTS FOR ONBOARDING UI
# ============================================================

@router.post("/test-server-connection")
def test_server_connection():
    """
    Test database connection using server-side environment credentials ONLY.
    Never exposes or accepts passwords from the frontend.
    Returns connection status and basic metadata.
    """
    from app.core.config import settings

    result = IngestionService.test_postgres_connection(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        database=settings.POSTGRES_DB,
        username=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
    )

    # Return safe metadata — never include password or full connection string
    return {
        "success": result.get("success", False),
        "message": result.get("message", ""),
        "engine": result.get("engine", "unknown"),
        "database": settings.POSTGRES_DB,
        "host_display": f"{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}" if result.get("engine") == "postgresql" else "Local Demo Database",
    }


@router.get("/discover-tables")
def discover_tables():
    """
    Discover available tables and row counts using server-side credentials.
    Returns table list without exposing any credentials to the frontend.
    """
    from app.core.config import settings

    tables = IngestionService.list_available_tables(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        database=settings.POSTGRES_DB,
        username=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
    )

    return {
        "tables": [
            {"name": t["table_name"], "records": t["row_count"]}
            for t in tables
        ],
        "total_tables": len(tables),
        "total_records": sum(t["row_count"] for t in tables),
    }


