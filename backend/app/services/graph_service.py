"""
Knowledge Graph Service
Queries Neo4j AuraDB for graph nodes and relationships and standardizes the API response format.
Integrates directly with GraphProjectionService for clean, bounded projections,
interactive search, neighborhood expansion, deep audit panels, and reconciliation.
"""

import logging
from typing import Dict, Any, List, Optional
from app.db.neo4j import Neo4jConnection
from app.services.graph_projection import (
    GraphProjectionService,
    GraphProjectionPayload,
    EntityDetailResponse,
    RelationshipDetailResponse,
    GraphStatsResponse,
    ReconciliationReport,
)
from app.ingestion.postgres_reader import (
    extract_companies,
    extract_suppliers,
    extract_people,
    extract_contracts,
    extract_sanctions,
    extract_countries,
    extract_company_directors,
    extract_supplier_relationships,
    extract_ownership,
)
from app.ingestion.normalizer import (
    normalize_companies,
    normalize_suppliers,
    normalize_people,
    normalize_countries,
    normalize_relationships,
)
from app.ingestion.mapper import build_canonical_graph_payload

logger = logging.getLogger("reasonchain.graph")


class GraphService:
    """Core service managing Knowledge Graph queries, projections, and audits."""

    @classmethod
    def _ensure_populated(cls):
        """Ensure the graph projection service has loaded entities."""
        if not GraphProjectionService.get_all_entities():
            logger.info("[GRAPH SERVICE] Initializing canonical graph into projection cache...")
            cls._populate_from_canonical_sources()

    @classmethod
    def _populate_from_canonical_sources(cls):
        """Populate initial canonical graph from relational mapper and Firebase if available."""
        all_entities = []
        all_relationships = []

        # 1. Build relational mapped dataset
        try:
            norm_companies = normalize_companies(extract_companies())
            norm_suppliers = normalize_suppliers(extract_suppliers())
            norm_people = normalize_people(extract_people())
            norm_contracts = normalize_relationships(extract_contracts(), "contracts")
            norm_sanctions = normalize_relationships(extract_sanctions(), "sanctions")
            norm_countries = normalize_countries(extract_countries())
            norm_directors = normalize_relationships(extract_company_directors(), "company_directors")
            norm_supplier_rels = normalize_relationships(extract_supplier_relationships(), "supplier_relationships")
            norm_ownership = normalize_relationships(extract_ownership(), "ownership")

            payload = build_canonical_graph_payload(
                norm_countries=norm_countries,
                norm_companies=norm_companies,
                norm_suppliers=norm_suppliers,
                norm_people=norm_people,
                norm_contracts=norm_contracts,
                norm_sanctions=norm_sanctions,
                norm_directors=norm_directors,
                norm_supplier_rels=norm_supplier_rels,
                norm_ownership=norm_ownership,
            )

            all_entities.extend(payload.entities)
            all_relationships.extend(payload.relationships)
        except Exception as rel_ex:
            logger.warning(f"[GRAPH SERVICE] Relational canonical population notice: {rel_ex}")

        # 2. Build Firebase mapped dataset
        try:
            from app.ingestion.firebase_mapper import build_firebase_canonical_payload
            fb_payload = build_firebase_canonical_payload(
                path="/companies",
                limit=100,
                include_relationships=True,
                include_nested_entities=True,
            )
            if fb_payload and fb_payload.entities:
                all_entities.extend(fb_payload.entities)
                all_relationships.extend(fb_payload.relationships)
                logger.info(
                    f"[GRAPH SERVICE] Merged {len(fb_payload.entities)} entities and {len(fb_payload.relationships)} relationships from Firebase"
                )
        except Exception as fb_ex:
            logger.warning(f"[GRAPH SERVICE] Firebase canonical population notice: {fb_ex}")

        GraphProjectionService.set_cache(all_entities, all_relationships)
        logger.info(
            f"[GRAPH SERVICE] Total cached: {len(all_entities)} entities and {len(all_relationships)} relationships"
        )

    @staticmethod
    def get_full_graph() -> Dict[str, Any]:
        """
        Fetch complete Knowledge Graph with backward compatibility.
        """
        GraphService._ensure_populated()

        # Try querying Neo4j first if reachable
        try:
            conn_check = Neo4jConnection.test_connection()
            if conn_check.get("success"):
                driver = Neo4jConnection.get_driver()
                with driver.session() as session:
                    result = session.run("""
                        MATCH (n)
                        OPTIONAL MATCH (n)-[r]->(m)
                        RETURN n, r, m
                    """)

                    nodes_dict: Dict[str, Dict[str, Any]] = {}
                    edges_list: List[Dict[str, Any]] = []
                    seen_edges = set()

                    for record in result:
                        n_node = record.get("n")
                        r_rel = record.get("r")
                        m_node = record.get("m")

                        if n_node:
                            n_data = GraphService._format_neo4j_node(n_node)
                            if n_data and n_data["id"]:
                                nodes_dict[n_data["id"]] = n_data

                        if m_node:
                            m_data = GraphService._format_neo4j_node(m_node)
                            if m_data and m_data["id"]:
                                nodes_dict[m_data["id"]] = m_data

                        if r_rel and n_node and m_node:
                            n_id = GraphService._get_node_id(n_node)
                            m_id = GraphService._get_node_id(m_node)
                            rel_type = r_rel.type
                            edge_id = str(r_rel.get("relationship_id") or f"{n_id}-{m_id}-{rel_type}")

                            if edge_id not in seen_edges and n_id and m_id:
                                seen_edges.add(edge_id)
                                edges_list.append({
                                    "id": edge_id,
                                    "source": n_id,
                                    "target": m_id,
                                    "label": rel_type,
                                    "properties": dict(r_rel),
                                })

                    if nodes_dict:
                        return {
                            "status": "success",
                            "source": "neo4j",
                            "total_nodes": len(nodes_dict),
                            "total_edges": len(edges_list),
                            "nodes": list(nodes_dict.values()),
                            "edges": edges_list,
                        }
        except Exception as e:
            logger.info(f"[GRAPH API] Neo4j offline ({e}), utilizing synchronized canonical graph cache.")

        # Return from GraphProjectionService
        entities = GraphProjectionService.get_all_entities()
        relationships = GraphProjectionService.get_all_relationships()

        projected = GraphProjectionService.project_subgraph(
            entities=entities,
            relationships=relationships,
            limit=len(entities),
            source_system="canonical_cache",
        )

        return {
            "status": "success",
            "source": "canonical_cache",
            "total_nodes": projected.total_nodes,
            "total_edges": projected.total_edges,
            "nodes": [n.model_dump() for n in projected.nodes],
            "edges": [e.model_dump() for e in projected.edges],
            "metadata": projected.metadata,
        }

    @classmethod
    def get_projected_subgraph(
        cls,
        limit: int = 50,
        entity_type: Optional[str] = None,
        relationship_type: Optional[str] = None,
        source: Optional[str] = None,
        min_confidence: float = 0.0,
        include_synthetic: bool = True,
    ) -> Dict[str, Any]:
        """Get clean bounded graph projection."""
        cls._ensure_populated()
        entities = GraphProjectionService.get_all_entities()
        relationships = GraphProjectionService.get_all_relationships()

        projected = GraphProjectionService.project_subgraph(
            entities=entities,
            relationships=relationships,
            limit=limit,
            entity_type=entity_type,
            relationship_type=relationship_type,
            source=source,
            min_confidence=min_confidence,
            include_synthetic=include_synthetic,
        )
        return projected.model_dump()

    @classmethod
    def search(cls, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Search canonical entities."""
        cls._ensure_populated()
        results = GraphProjectionService.search_entities(query=query, limit=limit)
        return [n.model_dump() for n in results]

    @classmethod
    def get_neighborhood(cls, canonical_id: str, hops: int = 1, limit: int = 50) -> Dict[str, Any]:
        """Fetch local neighborhood for entity."""
        cls._ensure_populated()
        res = GraphProjectionService.get_neighborhood(canonical_id=canonical_id, hops=hops, limit=limit)
        return res.model_dump()

    @classmethod
    def get_entity_details(cls, canonical_id: str) -> Optional[Dict[str, Any]]:
        """Fetch deep audit details for an entity."""
        cls._ensure_populated()
        detail = GraphProjectionService.get_entity_detail(canonical_id)
        return detail.model_dump() if detail else None

    @classmethod
    def get_relationship_details(cls, relationship_id: str) -> Optional[Dict[str, Any]]:
        """Fetch deep audit details for a relationship."""
        cls._ensure_populated()
        detail = GraphProjectionService.get_relationship_detail(relationship_id)
        return detail.model_dump() if detail else None

    @classmethod
    def get_stats(cls) -> Dict[str, Any]:
        """Get canonical graph statistics."""
        cls._ensure_populated()
        return GraphProjectionService.get_stats().model_dump()

    @classmethod
    def get_reconciliation(cls) -> Dict[str, Any]:
        """Run graph reconciliation audit."""
        cls._ensure_populated()
        return GraphProjectionService.reconcile_graph().model_dump()

    @staticmethod
    def _get_node_id(node_obj: Any) -> str:
        """Extract primary string ID from Neo4j node object or dict."""
        props = dict(node_obj)
        return str(
            props.get("canonical_entity_id")
            or props.get("canonical_id")
            or props.get("id")
            or props.get("code")
            or getattr(node_obj, "element_id", "")
        )

    @staticmethod
    def _format_neo4j_node(node_obj: Any) -> Dict[str, Any]:
        """Format Neo4j Node object into standardized API dict."""
        props = dict(node_obj)
        labels = list(getattr(node_obj, "labels", []))
        node_type = labels[0] if labels else props.get("entity_type") or props.get("type", "Company")
        node_id = str(
            props.get("canonical_entity_id")
            or props.get("canonical_id")
            or props.get("id")
            or props.get("code")
            or getattr(node_obj, "element_id", "")
        )

        label = (
            props.get("display_name")
            or props.get("name")
            or props.get("full_name")
            or props.get("contract_number")
            or props.get("code")
            or node_id
        )

        return {
            "id": node_id,
            "label": label,
            "type": node_type,
            "properties": props,
        }
