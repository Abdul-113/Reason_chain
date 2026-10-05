"""
Canonical Graph Payload Models
Source-independent container for graph nodes, edges, provenance, and dataset metadata.
"""

from typing import List, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from app.domain.entities import CanonicalEntity
from app.domain.relationships import CanonicalRelationship


class CanonicalGraphPayload(BaseModel):
    """
    Complete canonical graph dataset payload.
    Independent of Neo4j, PostgreSQL, or Firebase storage models.
    """
    entities: List[CanonicalEntity] = Field(default_factory=list, description="Canonical graph entities")
    relationships: List[CanonicalRelationship] = Field(default_factory=list, description="Canonical graph relationships")
    metadata: Dict[str, Any] = Field(
        default_factory=lambda: {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "version": "1.0",
        },
        description="Dataset metadata and stats"
    )

    def add_entity(self, entity: CanonicalEntity) -> None:
        self.entities.append(entity)

    def add_relationship(self, rel: CanonicalRelationship) -> None:
        self.relationships.append(rel)

    def to_neo4j_payload(self) -> Dict[str, Any]:
        """Convert payload into dictionary of nodes and relationships for Neo4jWriter."""
        return {
            "nodes": [e.to_neo4j_node_dict() for e in self.entities],
            "relationships": [r.to_neo4j_rel_dict() for r in self.relationships],
        }

    def to_api_response(self, source: str = "canonical_graph") -> Dict[str, Any]:
        """Format canonical graph into API response expected by React Flow frontend."""
        nodes_list = []
        for e in self.entities:
            props = dict(e.properties)
            props["id"] = e.canonical_id
            props["canonical_id"] = e.canonical_id
            props["name"] = e.display_name
            props["entity_type"] = str(e.entity_type)

            nodes_list.append({
                "id": e.canonical_id,
                "label": e.display_name,
                "type": str(e.entity_type),
                "properties": props,
            })

        edges_list = []
        seen_edges = set()
        for r in self.relationships:
            edge_id = r.relationship_id
            if edge_id not in seen_edges:
                seen_edges.add(edge_id)
                props = dict(r.properties)
                props["relationship_id"] = r.relationship_id

                edges_list.append({
                    "id": edge_id,
                    "source": r.source_entity_id,
                    "target": r.target_entity_id,
                    "label": str(r.relationship_type),
                    "properties": props,
                })

        return {
            "status": "success",
            "source": source,
            "total_nodes": len(nodes_list),
            "total_edges": len(edges_list),
            "nodes": nodes_list,
            "edges": edges_list,
        }
