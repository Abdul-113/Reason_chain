"""
Entity Resolution & Identity Management API Routes
REST endpoints for running resolution, reviewing candidates, and managing identities.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional

from app.resolution.models import (
    MatchDecision,
    ResolutionStatus,
    MatchCandidate,
    EntityIdentity,
    ResolutionConfig,
    ResolutionTask,
)
from app.resolution.engine import UniversalResolutionEngine
from app.source.records import SourceRecord, SourceLocation

router = APIRouter()

# In-memory stores for demo/development (replace with persistent storage in production)
_resolution_tasks: Dict[str, ResolutionTask] = {}
_identities: Dict[str, EntityIdentity] = {}
_current_config = ResolutionConfig()


# ========================================================================
# REQUEST / RESPONSE MODELS
# ========================================================================

class ResolutionRequest(BaseModel):
    """Request body for running entity resolution on a batch of records."""
    records: List[Dict[str, Any]] = Field(..., description="List of record attribute dicts")
    source_id: str = Field(default="manual", description="Source system identifier")
    dataset_id: str = Field(default="manual_input", description="Dataset identifier")
    config_overrides: Optional[Dict[str, Any]] = Field(default=None, description="Optional config overrides")


class DecisionRequest(BaseModel):
    """Request body for making a human decision on a candidate."""
    action: str = Field(..., description="'confirm' or 'reject'")
    decided_by: str = Field(default="analyst", description="Who made the decision")
    reason: Optional[str] = Field(default=None, description="Optional reason for rejection")


class ResolutionSummary(BaseModel):
    """Summary response for a resolution task."""
    task_id: str
    status: str
    input_record_count: int
    total_candidates: int
    match_count: int
    review_count: int
    non_match_count: int
    identities_created: int


# ========================================================================
# ENDPOINTS
# ========================================================================

@router.post("/api/v1/resolution/resolve", response_model=Dict[str, Any])
async def run_resolution(request: ResolutionRequest):
    """
    Run entity resolution on a batch of records.
    Returns a ResolutionTask with all candidates and decisions.
    """
    # Build config
    config = ResolutionConfig()
    if request.config_overrides:
        for key, val in request.config_overrides.items():
            if hasattr(config, key):
                setattr(config, key, val)
    
    # Convert raw dicts to SourceRecords
    source_records: List[SourceRecord] = []
    for idx, attrs in enumerate(request.records):
        record_id = attrs.get("_key", attrs.get("cin", attrs.get("id", f"rec-{idx}")))
        source_records.append(SourceRecord(
            source_id=request.source_id,
            dataset_id=request.dataset_id,
            record_id=str(record_id),
            attributes=attrs,
            source_location=SourceLocation(
                source_id=request.source_id,
                dataset_id=request.dataset_id,
                record_key=str(record_id),
            ),
        ))
    
    # Run resolution
    engine = UniversalResolutionEngine(config=config)
    task = engine.resolve_batch(source_records)
    task.source_id = request.source_id
    task.dataset_id = request.dataset_id
    
    # Store task
    _resolution_tasks[task.task_id] = task
    
    # Store created identities
    for identity in task.identities_created:
        _identities[identity.identity_id] = identity
    
    return {
        "status": "success",
        "task_id": task.task_id,
        "summary": task.summary,
        "candidates": [c.model_dump() for c in task.candidates],
        "identities_created": [i.model_dump() for i in task.identities_created],
    }


@router.get("/api/v1/resolution/candidates", response_model=Dict[str, Any])
async def list_candidates(
    task_id: Optional[str] = None,
    decision: Optional[str] = None,
    status: Optional[str] = None,
):
    """
    List match candidates, optionally filtered by task, decision, or status.
    """
    candidates: List[MatchCandidate] = []
    
    if task_id:
        task = _resolution_tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
        candidates = task.candidates
    else:
        for task in _resolution_tasks.values():
            candidates.extend(task.candidates)
    
    # Apply filters
    if decision:
        candidates = [c for c in candidates if c.decision.value == decision]
    if status:
        candidates = [c for c in candidates if c.status.value == status]
    
    return {
        "status": "success",
        "total": len(candidates),
        "candidates": [c.model_dump() for c in candidates],
    }


@router.post("/api/v1/resolution/candidates/{candidate_id}/decide", response_model=Dict[str, Any])
async def decide_candidate(candidate_id: str, request: DecisionRequest):
    """
    Make a human decision (confirm/reject) on a match candidate.
    """
    # Find candidate across all tasks
    target_candidate: Optional[MatchCandidate] = None
    for task in _resolution_tasks.values():
        for c in task.candidates:
            if c.candidate_id == candidate_id:
                target_candidate = c
                break
        if target_candidate:
            break
    
    if not target_candidate:
        raise HTTPException(status_code=404, detail=f"Candidate {candidate_id} not found")
    
    if request.action == "confirm":
        target_candidate.confirm(decided_by=request.decided_by)
    elif request.action == "reject":
        target_candidate.reject(decided_by=request.decided_by, reason=request.reason)
    else:
        raise HTTPException(status_code=400, detail=f"Invalid action: {request.action}. Use 'confirm' or 'reject'.")
    
    return {
        "status": "success",
        "candidate_id": candidate_id,
        "decision": target_candidate.decision.value,
        "resolution_status": target_candidate.status.value,
        "decided_by": target_candidate.decided_by,
    }


@router.get("/api/v1/resolution/identities", response_model=Dict[str, Any])
async def list_identities():
    """
    List all resolved entity identities.
    """
    return {
        "status": "success",
        "total": len(_identities),
        "identities": [i.model_dump() for i in _identities.values()],
    }


@router.get("/api/v1/resolution/config", response_model=Dict[str, Any])
async def get_config():
    """
    Get the current resolution configuration.
    """
    return {
        "status": "success",
        "config": _current_config.model_dump(),
    }


@router.put("/api/v1/resolution/config", response_model=Dict[str, Any])
async def update_config(config: Dict[str, Any]):
    """
    Update resolution configuration.
    """
    global _current_config
    
    for key, val in config.items():
        if hasattr(_current_config, key):
            setattr(_current_config, key, val)
    
    return {
        "status": "success",
        "config": _current_config.model_dump(),
    }
