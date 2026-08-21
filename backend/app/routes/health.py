from fastapi import APIRouter
from typing import Dict, Any
from app.models.schemas import HealthResponse
from app.services.ingestion_service import IngestionService
from app.core.config import settings

router = APIRouter()

@router.get("/health", response_model=HealthResponse)
def health_check():
    """
    General system health check endpoint.
    Returns status: ok.
    """
    return {"status": "ok"}

@router.get("/health/database")
def database_health_check() -> Dict[str, Any]:
    """
    Database connectivity and status health check endpoint.
    Returns status: ok, database name, and table count.
    """
    tables = IngestionService.list_available_tables()
    return {
        "status": "ok",
        "database": settings.POSTGRES_DB,
        "tables": len(tables)
    }
