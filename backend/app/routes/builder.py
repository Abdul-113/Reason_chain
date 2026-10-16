"""
Knowledge Graph Builder API Routes
Exposes endpoints for discovering data sources, initiating multi-database
knowledge graph builds, streaming real-time stage progress, reviewing
cross-source entity resolution decisions, and querying build history.
"""

import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Query, Path
from pydantic import BaseModel, Field

logger = logging.getLogger("reasonchain.builder.router")

from app.services.kg_builder_service import (
    KnowledgeGraphBuilderService,
    BuildJob,
    StageProgress,
    StageStatus,
)

router = APIRouter(prefix="/api/v1/builder", tags=["Knowledge Graph Builder"])


class StartBuildRequest(BaseModel):
    selected_databases: List[str] = Field(
        default=["firebase_rtdb", "postgres_main"],
        description="List of data source identifiers to integrate"
    )
    firebase_limit: int = Field(
        default=100,
        ge=10,
        le=1000,
        description="Bounded limit of company records to ingest from Firebase master"
    )
    mode: str = Field(
        default="cross_source",
        description="Integration mode: 'cross_source' (requires both Firebase and Postgres) or 'standalone_master'"
    )


def serialize_job(job: BuildJob) -> Dict[str, Any]:
    """Helper to convert BuildJob dataclass to clean JSON-serializable dictionary."""
    return {
        "job_id": job.job_id,
        "status": job.status,
        "selected_databases": job.selected_databases,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "completed_at": job.completed_at,
        "duration_ms": job.duration_ms,
        "stages": {
            s_id: {
                "stage_id": s.stage_id,
                "name": s.name,
                "group": s.group,
                "status": s.status,
                "records_processed": s.records_processed,
                "records_total": s.records_total,
                "started_at": s.started_at,
                "completed_at": s.completed_at,
                "duration_ms": s.duration_ms,
                "message": s.message,
                "warnings": s.warnings,
                "errors": s.errors,
            }
            for s_id, s in job.stages.items()
        },
        "counts": {
            "firebase_records_extracted": job.firebase_records_extracted,
            "postgres_records_extracted": job.postgres_records_extracted,
            "canonical_entities_count": job.canonical_entities_count,
            "canonical_relationships_count": job.canonical_relationships_count,
            "resolved_companies_count": job.resolved_companies_count,
            "unresolved_companies_count": job.unresolved_companies_count,
            "verified_relationships_count": job.verified_relationships_count,
            "unresolved_relationships_count": job.unresolved_relationships_count,
            "synthetic_relationships_count": job.synthetic_relationships_count,
            "neo4j_nodes_written": job.neo4j_nodes_written,
            "neo4j_edges_written": job.neo4j_edges_written,
            "neo4j_available": job.neo4j_available,
        },
        "neo4j_verification_notes": job.neo4j_verification_notes,
        "error_message": job.error_message,
    }


@router.get("/sources")
def get_builder_sources() -> Dict[str, Any]:
    """
    Get live connection status, datasets, table counts, and last build
    for selectable data sources (Firebase and PostgreSQL/Neon).
    """
    try:
        return KnowledgeGraphBuilderService.get_source_descriptors()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to inspect data sources: {str(e)}")


@router.get("/profile")
def get_builder_profiling(sources: Optional[str] = Query(None, description="Comma-separated source IDs")) -> Dict[str, Any]:
    """
    Step 2 Connect & Profile: retrieve deep dataset and table profiling,
    field types, null rates, and candidate identifier attributes.
    """
    selected = sources.split(",") if sources else ["firebase_rtdb", "postgres_main"]
    return KnowledgeGraphBuilderService.get_profiling_data(selected)


@router.get("/mapping-preview")
def get_builder_mapping_preview(sources: Optional[str] = Query(None, description="Comma-separated source IDs")) -> Dict[str, Any]:
    """
    Step 3 Map & Validate: retrieve proposed canonical mappings,
    validation reports, and confidence metrics.
    """
    selected = sources.split(",") if sources else ["firebase_rtdb", "postgres_main"]
    return KnowledgeGraphBuilderService.get_mapping_preview(selected)


@router.get("/resolution-preview")
def get_builder_resolution_preview(sources: Optional[str] = Query(None, description="Comma-separated source IDs")) -> Dict[str, Any]:
    """
    Step 4 Resolve Entities: retrieve cross-source deterministic entity
    resolution analysis, match rates, and isolated safeguards.
    """
    selected = sources.split(",") if sources else ["firebase_rtdb", "postgres_main"]
    return KnowledgeGraphBuilderService.get_resolution_preview(selected)


@router.get("/integration-preview")
def get_builder_integration_preview(sources: Optional[str] = Query(None, description="Comma-separated source IDs")) -> Dict[str, Any]:
    """
    Step 5 Review Integration: retrieve pre-flight integration summary,
    entity breakdown, claim counts, and synthetic data warnings.
    """
    selected = sources.split(",") if sources else ["firebase_rtdb", "postgres_main"]
    return KnowledgeGraphBuilderService.get_integration_preview(selected)


@router.post("/start")
def start_knowledge_graph_build(req: StartBuildRequest) -> Dict[str, Any]:
    """
    Start an asynchronous, multi-database Knowledge Graph build job.
    Returns the created job ID and initial stage progress.
    """
    if not req.selected_databases:
        raise HTTPException(status_code=400, detail="At least one data source must be selected.")

    if req.mode == "cross_source":
        if "firebase_rtdb" not in req.selected_databases or "postgres_main" not in req.selected_databases:
            raise HTTPException(
                status_code=400,
                detail="Unified cross-source integration requires both 'firebase_rtdb' (Company Master) and 'postgres_main' (Relationship Source). Please select both sources, or switch to standalone master mode."
            )

    # Validate that selected sources are actively connected
    try:
        descriptors = KnowledgeGraphBuilderService.get_source_descriptors()
        source_map = {s["source_id"]: s for s in descriptors.get("sources", [])}
        for db in req.selected_databases:
            src = source_map.get(db)
            if src and not src.get("is_connected"):
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot start build: Data source '{src.get('name', db)}' is disconnected. Please resolve connectivity in Data Sources before initiating integration."
                )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Connection pre-check warning: {e}")

    try:
        job = KnowledgeGraphBuilderService.create_build_job(
            selected_databases=req.selected_databases
        )
        KnowledgeGraphBuilderService.execute_build_async(
            job_id=job.job_id,
            firebase_limit=req.firebase_limit
        )
        return {
            "status": "success",
            "message": "Knowledge Graph build pipeline started",
            "job": serialize_job(job)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start build: {str(e)}")


@router.get("/job/{job_id}")
def get_job_progress(job_id: str = Path(..., description="Build Job ID")) -> Dict[str, Any]:
    """
    Retrieve live status and stage progress of an executing or completed build job.
    """
    job = KnowledgeGraphBuilderService.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Build job '{job_id}' not found.")
    return {
        "status": "success",
        "job": serialize_job(job)
    }


@router.get("/job/{job_id}/summary")
def get_job_summary(job_id: str = Path(..., description="Build Job ID")) -> Dict[str, Any]:
    """
    Retrieve comprehensive completion summary of a build job, including
    cross-source entity resolution decisions, unresolved links, and audit notes.
    """
    job = KnowledgeGraphBuilderService.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Build job '{job_id}' not found.")

    serialized = serialize_job(job)
    serialized["resolution_decisions"] = [
        {
            "source_entity_id": d.source_entity_id,
            "source_name": d.source_name,
            "source_identifier": d.source_identifier,
            "matched_canonical_id": d.matched_canonical_id,
            "matched_name": d.matched_name,
            "match_method": d.match_method,
            "confidence": d.confidence,
            "status": d.status,
            "reason": d.reason,
        }
        for d in job.resolution_decisions
    ]
    serialized["unresolved_entities"] = job.unresolved_entities

    return {
        "status": "success",
        "summary": serialized
    }


@router.get("/history")
def get_build_history() -> Dict[str, Any]:
    """
    Retrieve history of all Knowledge Graph build runs.
    """
    jobs = KnowledgeGraphBuilderService.get_all_jobs()
    return {
        "status": "success",
        "total_jobs": len(jobs),
        "jobs": [serialize_job(j) for j in jobs]
    }


@router.post("/job/{job_id}/retry")
def retry_build_job(job_id: str = Path(..., description="Build Job ID")) -> Dict[str, Any]:
    """
    Safely retry a failed or incomplete Knowledge Graph build job.
    Re-uses the same source configuration and maintains idempotency.
    """
    existing_job = KnowledgeGraphBuilderService.get_job(job_id)
    if not existing_job:
        raise HTTPException(status_code=404, detail=f"Build job '{job_id}' not found.")

    new_job = KnowledgeGraphBuilderService.create_build_job(
        selected_databases=existing_job.selected_databases
    )
    KnowledgeGraphBuilderService.execute_build_async(
        job_id=new_job.job_id,
        firebase_limit=100
    )

    return {
        "status": "success",
        "message": f"Retry started as new job {new_job.job_id}",
        "job": serialize_job(new_job)
    }
