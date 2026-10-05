"""
Knowledge Graph API Routes
Provides endpoints for projected Knowledge Graph exploration, search,
local neighborhood expansion, deep audit panels, statistics, reconciliation,
and on-demand materialization.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
from app.services.graph_service import GraphService
from app.ingestion.materialization_pipeline import MaterializationPipeline

router = APIRouter()


class MaterializeRequest(BaseModel):
    firebase_limit: int = Field(default=100, ge=1, le=1000, description="Max Firebase records to materialize")
    include_synthetic: bool = Field(default=True, description="Include /company_relationships synthetic links")


@router.get("")
@router.get("/")
def get_graph(
    limit: int = Query(default=60, ge=1, le=1000, description="Maximum visible entities in projected view"),
    entity_type: Optional[str] = Query(default=None, description="Filter by entity type (Company, Person, etc.)"),
    relationship_type: Optional[str] = Query(default=None, description="Filter by relationship type"),
    source: Optional[str] = Query(default=None, description="Filter by data source (all, firebase, postgres, relational)"),
    min_confidence: float = Query(default=0.0, ge=0.0, le=1.0, description="Minimum confidence threshold"),
    include_synthetic: bool = Query(default=True, description="Whether to include synthetic test data"),
    full: bool = Query(default=False, description="Whether to return full unprojected graph (legacy)")
) -> Dict[str, Any]:
    """
    Fetch clean, projected Knowledge Graph nodes and edges.
    Supports query-driven bounded browsing, type filters, source filters, and confidence thresholds.
    """
    try:
        if full:
            return GraphService.get_full_graph()

        return GraphService.get_projected_subgraph(
            limit=limit,
            entity_type=entity_type,
            relationship_type=relationship_type,
            source=source,
            min_confidence=min_confidence,
            include_synthetic=include_synthetic,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to load Knowledge Graph: {str(e)}"
        )


@router.get("/summary")
def graph_summary() -> Dict[str, Any]:
    """Knowledge Graph summary route returning total nodes and relationships."""
    try:
        stats = GraphService.get_stats()
        return {
            "status": "ok",
            "total_nodes": stats.get("total_entities", 0),
            "total_relationships": stats.get("total_relationships", 0),
            "total_sources": stats.get("total_sources", 1),
            "synthetic_relationships": stats.get("synthetic_relationship_count", 0),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch summary: {str(e)}")


@router.get("/search")
def search_entities(
    q: str = Query(..., min_length=1, description="Search term (company name, CIN, DIN, etc.)"),
    limit: int = Query(default=20, ge=1, le=100, description="Max search results")
) -> Dict[str, Any]:
    """
    Search canonical entities by name, CIN, DIN, or other identifiers.
    """
    try:
        results = GraphService.search(query=q, limit=limit)
        return {
            "status": "success",
            "query": q,
            "count": len(results),
            "results": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/neighborhood/{canonical_id:path}")
def get_neighborhood(
    canonical_id: str,
    hops: int = Query(default=1, ge=1, le=3, description="Number of hops to expand"),
    limit: int = Query(default=50, ge=1, le=200, description="Max entities to return")
) -> Dict[str, Any]:
    """
    Fetch the local neighborhood subgraph around a specific canonical entity.
    """
    try:
        result = GraphService.get_neighborhood(canonical_id=canonical_id, hops=hops, limit=limit)
        if result.get("status") == "not_found":
            raise HTTPException(status_code=404, detail=f"Entity '{canonical_id}' not found.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Neighborhood query failed: {str(e)}")


@router.get("/entity/{canonical_id:path}")
def get_entity_details(canonical_id: str) -> Dict[str, Any]:
    """
    Retrieve comprehensive, auditable detail view for a canonical entity:
    Identity, Resolution, Provenance, Temporal, Confidence, and Connected Relationships.
    """
    try:
        detail = GraphService.get_entity_details(canonical_id=canonical_id)
        if not detail:
            raise HTTPException(status_code=404, detail=f"Entity '{canonical_id}' not found.")
        return detail
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch entity details: {str(e)}")


@router.get("/relationship/{relationship_id:path}")
def get_relationship_details(relationship_id: str) -> Dict[str, Any]:
    """
    Retrieve comprehensive audit detail view for a canonical relationship.
    """
    try:
        detail = GraphService.get_relationship_details(relationship_id=relationship_id)
        if not detail:
            raise HTTPException(status_code=404, detail=f"Relationship '{relationship_id}' not found.")
        return detail
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch relationship details: {str(e)}")


@router.get("/stats")
def get_graph_stats() -> Dict[str, Any]:
    """
    Retrieve detailed statistics on canonical Knowledge Graph contents.
    """
    try:
        return GraphService.get_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve graph stats: {str(e)}")


@router.get("/reconciliation")
def get_reconciliation_report() -> Dict[str, Any]:
    """
    Audit canonical Knowledge Graph integrity (orphaned edges, duplicate IDs, missing metadata).
    """
    try:
        return GraphService.get_reconciliation()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate reconciliation report: {str(e)}")


@router.post("/materialize")
def materialize_graph(request: MaterializeRequest = MaterializeRequest()) -> Dict[str, Any]:
    """
    Trigger on-demand materialization of canonical Knowledge Graph from real sources.
    """
    try:
        pipeline = MaterializationPipeline()
        result = pipeline.materialize_all(firebase_limit=request.firebase_limit)
        return {
            "status": "success",
            "message": "Canonical Knowledge Graph materialization complete",
            "details": result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Materialization failed: {str(e)}")
