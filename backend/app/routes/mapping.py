"""
Mapping Governance & AI Proposal API Endpoints
Exposes REST endpoints for:
- Checking AI mapping provider configuration status
- Generating AI-assisted semantic mapping proposals
- Running deterministic validation against dataset profiles
- Human review governance (approval/rejection)
- Querying proposal details and history
"""

from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel, Field

from app.source.ai.mapping_service import mapping_service
from app.source.ai.ai_context import MappingProposalResponse
from app.source.ai.validator import ValidationReport
from app.source.mapping import MappingSpecification

router = APIRouter(prefix="/api/mapping", tags=["AI-Assisted Semantic Mapping"])


class ProposeMappingRequest(BaseModel):
    source_id: str = Field(..., description="Universal source identifier (e.g. 'firebase_rtdb', 'postgres_main')")
    dataset_id: str = Field(..., description="Target dataset identifier (e.g. 'companies', 'raw_suppliers')")
    sample_limit: int = Field(default=10, ge=1, le=50, description="Max sample records to inspect for profiling")
    constraints: Optional[Dict[str, Any]] = Field(default=None, description="Optional mapping constraints or hints")


class ReviewDecisionRequest(BaseModel):
    reviewer_id: str = Field(default="human_operator", description="Identifier of the human reviewer")
    notes: Optional[str] = Field(default=None, description="Optional review notes or rejection reason")


@router.get("/status")
def get_mapping_status() -> Dict[str, Any]:
    """Check AI provider configuration status and active model information."""
    provider = mapping_service.get_provider()
    if provider is None:
        return {
            "configured": False,
            "provider": None,
            "message": "No AI mapping provider configured. Set AI_API_KEY in server environment.",
        }

    info = provider.get_provider_info()
    return {
        "configured": provider.is_configured(),
        "provider": info.get("provider"),
        "model": info.get("model"),
        "prompt_version": info.get("prompt_version"),
        "base_url": info.get("base_url"),
        "message": "AI mapping provider configured and ready" if provider.is_configured() else "AI API key missing or invalid",
    }


@router.post("/propose", response_model=MappingProposalResponse)
def propose_mapping(req: ProposeMappingRequest) -> MappingProposalResponse:
    """
    Generate an AI-assisted semantic mapping proposal for a dataset.
    Follows strict boundaries:
    - AI is proposal generator only (origin=AI_PROPOSED)
    - Default status is PENDING and UNVALIDATED
    - Deterministic validation is performed against real profile
    """
    try:
        response = mapping_service.propose_mapping(
            source_id=req.source_id,
            dataset_id=req.dataset_id,
            sample_limit=req.sample_limit,
            constraints=req.constraints,
        )
        return response
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=502, detail=str(re))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate mapping proposal: {str(e)}")


@router.get("/proposals")
def list_proposals() -> List[Dict[str, Any]]:
    """List all generated mapping proposals and their current governance states."""
    return mapping_service.list_proposals()


@router.get("/proposals/{proposal_id}", response_model=MappingProposalResponse)
def get_proposal(proposal_id: str) -> MappingProposalResponse:
    """Retrieve full proposal details including specification, rationale, and ambiguities."""
    prop = mapping_service.get_proposal(proposal_id)
    if not prop:
        raise HTTPException(status_code=404, detail=f"Proposal '{proposal_id}' not found")
    return prop


@router.get("/proposals/{proposal_id}/validation", response_model=ValidationReport)
def get_validation_report(proposal_id: str) -> ValidationReport:
    """Get the deterministic validation report for a proposal."""
    report = mapping_service.get_validation_report(proposal_id)
    if not report:
        # Try running validation now
        try:
            report = mapping_service.validate_proposal(proposal_id)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"Proposal '{proposal_id}' not found")
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
    return report


@router.post("/validate/{proposal_id}", response_model=ValidationReport)
def validate_proposal(proposal_id: str) -> ValidationReport:
    """Re-run deterministic schema and ontology validation on a proposal."""
    try:
        return mapping_service.validate_proposal(proposal_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Proposal '{proposal_id}' not found")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.post("/approve/{proposal_id}", response_model=MappingSpecification)
def approve_proposal(
    proposal_id: str,
    req: ReviewDecisionRequest = Body(default_factory=ReviewDecisionRequest),
) -> MappingSpecification:
    """
    Approve an AI-proposed mapping specification for active knowledge graph ingestion.
    Enforces deterministic validation pass before approval.
    """
    try:
        return mapping_service.approve_proposal(
            proposal_id=proposal_id,
            reviewer_id=req.reviewer_id,
            notes=req.notes,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Proposal '{proposal_id}' not found")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.post("/reject/{proposal_id}", response_model=MappingSpecification)
def reject_proposal(
    proposal_id: str,
    req: ReviewDecisionRequest = Body(default_factory=ReviewDecisionRequest),
) -> MappingSpecification:
    """Reject an AI-proposed mapping specification."""
    try:
        return mapping_service.reject_proposal(
            proposal_id=proposal_id,
            reviewer_id=req.reviewer_id,
            reason=req.notes,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Proposal '{proposal_id}' not found")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
