"""
Workspace Status Route
Returns onboarding state based on whether ingestion has been successfully completed.
"""

from fastapi import APIRouter
from typing import Dict, Any
from app.ingestion.pipeline import get_last_ingestion_status

router = APIRouter()


@router.get("/status")
def workspace_status() -> Dict[str, Any]:
    """
    Check workspace configuration state.
    Used by frontend to determine whether to show onboarding or workspace.
    """
    last = get_last_ingestion_status()

    if last is None or last.get("status") not in ("success", "completed_with_warnings"):
        return {
            "onboarding_complete": False,
            "data_sources": 0,
            "knowledge_graph_ready": False,
        }

    return {
        "onboarding_complete": True,
        "data_sources": 1,
        "knowledge_graph_ready": True,
        "last_ingestion": {
            "status": last.get("status"),
            "nodes_created": last.get("nodes_created", 0),
            "relationships_created": last.get("relationships_created", 0),
            "completed_at": last.get("completed_at"),
        }
    }
