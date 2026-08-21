from fastapi import APIRouter
from typing import Dict, Any

router = APIRouter()

@router.get("/active")
def active_investigations() -> Dict[str, Any]:
    """Active investigations route placeholder."""
    return {"investigations": []}
