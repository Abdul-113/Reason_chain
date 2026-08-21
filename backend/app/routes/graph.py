"""
Knowledge Graph API Routes
Provides GET /api/graph endpoint to return normalized Neo4j graph nodes and edges.
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from app.services.graph_service import GraphService

router = APIRouter()


@router.get("")
@router.get("/")
def get_graph() -> Dict[str, Any]:
    """
    Fetch normalized Knowledge Graph from Neo4j AuraDB.
    Returns:
    {
      "nodes": [ { "id": "C001", "label": "Acme Manufacturing", "type": "Company", "properties": {...} } ],
      "edges": [ { "id": "S001-C001-SUPPLIES", "source": "S001", "target": "C001", "label": "SUPPLIES", "properties": {...} } ]
    }
    """
    try:
        return GraphService.get_full_graph()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to load Knowledge Graph from Neo4j: {str(e)}"
        )


@router.get("/summary")
def graph_summary() -> Dict[str, Any]:
    """Knowledge Graph summary route returning total nodes and relationships."""
    graph_data = GraphService.get_full_graph()
    return {
        "status": "ok",
        "total_nodes": graph_data.get("total_nodes", len(graph_data.get("nodes", []))),
        "total_relationships": graph_data.get("total_edges", len(graph_data.get("edges", []))),
        "source": graph_data.get("source", "neo4j"),
    }
