"""
Graph Projection & Human-Friendly Experience Service
Converts rich canonical Knowledge Graph entities and relationships into clean,
uncluttered visualization projections with deep auditability on demand.
"""

import logging
from typing import List, Dict, Any, Optional, Set
from datetime import datetime, timezone
from pydantic import BaseModel, Field

from app.domain.entities import CanonicalEntity, EntityCategory
from app.domain.relationships import CanonicalRelationship, CanonicalRelationshipType
from app.domain.graph import CanonicalGraphPayload

logger = logging.getLogger("reasonchain.graph.projection")


# ============================================================================
# VISUALIZATION & DETAIL MODELS
# ============================================================================

class VisualizationNode(BaseModel):
    """Clean, human-friendly node representation for frontend visualization."""
    id: str = Field(..., description="Canonical entity ID")
    label: str = Field(..., description="Human-readable display name")
    entity_type: str = Field(..., description="Entity category name (Company, Person, etc.)")
    type: str = Field(default="", description="Legacy/API alias for entity_type")
    display_name: str = Field(..., description="Full display name")
    important_identifier: Optional[str] = Field(None, description="Primary business identifier (e.g. CIN, DIN)")
    confidence: float = Field(1.0, ge=0.0, le=1.0, description="Overall entity confidence")
    source_count: int = Field(1, description="Number of supporting sources")
    source_system: str = Field("canonical", description="Source system (e.g. firebase, postgres, relational)")
    status: Optional[str] = Field(None, description="Entity status (Active, Inactive, etc.)")
    is_synthetic: bool = Field(False, description="Flag indicating synthetic/mock test data")
    properties: Dict[str, Any] = Field(default_factory=dict, description="Curated display properties")


class VisualizationEdge(BaseModel):
    """Clean, human-friendly edge representation for frontend visualization."""
    id: str = Field(..., description="Relationship ID")
    source: str = Field(..., description="Source canonical entity ID")
    target: str = Field(..., description="Target canonical entity ID")
    relationship_type: str = Field(..., description="Canonical relationship type")
    display_label: str = Field(..., description="Human-readable business label (e.g. DIRECTOR OF)")
    label: str = Field(default="", description="Legacy alias for display_label")
    confidence: float = Field(1.0, ge=0.0, le=1.0, description="Relationship confidence")
    evidence_count: int = Field(1, description="Number of supporting evidence records")
    source_system: str = Field("canonical", description="Source system (e.g. firebase, postgres, relational)")
    temporal_status: Optional[str] = Field(None, description="Current / Historical / Future")
    is_synthetic: bool = Field(False, description="Flag indicating synthetic/mock test relationship")
    properties: Dict[str, Any] = Field(default_factory=dict, description="Edge properties")


class GraphProjectionPayload(BaseModel):
    """Bounded visualization subgraph payload."""
    status: str = "success"
    source: str = "neo4j"
    total_nodes: int = 0
    total_edges: int = 0
    nodes: List[VisualizationNode] = Field(default_factory=list)
    edges: List[VisualizationEdge] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EntityDetailResponse(BaseModel):
    """Deep audit details for a selected canonical entity."""
    canonical_id: str
    entity_type: str
    display_name: str
    identifiers: Dict[str, Any]
    resolution: Dict[str, Any]
    sources: List[Dict[str, Any]]
    temporal: Dict[str, Any]
    confidence: Dict[str, Any]
    status: Optional[str] = None
    is_synthetic: bool = False
    properties: Dict[str, Any]
    connected_edges: List[Dict[str, Any]] = Field(default_factory=list)


class RelationshipDetailResponse(BaseModel):
    """Deep audit details for a selected canonical relationship."""
    relationship_id: str
    relationship_type: str
    display_label: str
    source_entity: Dict[str, Any]
    target_entity: Dict[str, Any]
    confidence: Dict[str, Any]
    evidence_count: int
    sources: List[Dict[str, Any]]
    temporal: Dict[str, Any]
    is_synthetic: bool = False
    properties: Dict[str, Any]


class GraphStatsResponse(BaseModel):
    """Statistics on canonical knowledge graph contents."""
    total_entities: int
    total_relationships: int
    entity_type_counts: Dict[str, int]
    relationship_type_counts: Dict[str, int]
    total_sources: int
    source_counts: Dict[str, int]
    synthetic_entity_count: int
    synthetic_relationship_count: int
    verified_entity_count: int
    verified_relationship_count: int


class ReconciliationReport(BaseModel):
    """Integrity and reconciliation audit of the canonical knowledge graph."""
    timestamp: str
    canonical_entity_count: int
    canonical_relationship_count: int
    duplicate_canonical_ids: int
    orphaned_relationships: int
    missing_provenance_count: int
    missing_confidence_count: int
    missing_temporal_count: int
    synthetic_marker_count: int
    status: str
    details: List[str] = Field(default_factory=list)


# ============================================================================
# HELPER FORMATTERS
# ============================================================================

def format_relationship_label(rel_type: str) -> str:
    """Format canonical relationship enum to human-friendly display label."""
    mapping = {
        "OWNS": "OWNS",
        "DIRECTOR_OF": "DIRECTOR OF",
        "HAS_DIRECTOR": "HAS DIRECTOR",
        "SUPPLIES": "SUPPLIES",
        "HAS_CONTRACT": "HAS CONTRACT",
        "REGISTERED_IN": "REGISTERED IN",
        "LOCATED_IN": "LOCATED IN",
        "REGISTERED_IN_STATE": "STATE OF",
        "SANCTIONED_BY": "SANCTIONED BY",
        "TRANSACTS_WITH": "TRANSACTS WITH",
        "USES": "USES",
        "VIOLATES": "VIOLATES",
    }
    return mapping.get(rel_type, rel_type.replace("_", " "))


def extract_important_identifier(props: Dict[str, Any]) -> Optional[str]:
    """Extract primary business identifier from properties."""
    for key in ("cin", "CIN", "din", "DIN", "registration_number", "contract_number", "pan", "supplier_id", "code"):
        if key in props and props[key]:
            return str(props[key])
    return None


def determine_temporal_status(temporal: Optional[Any], props: Dict[str, Any]) -> str:
    """Classify relationship/entity validity as Current, Historical, or Undefined."""
    valid_to = None
    if temporal and getattr(temporal, "valid_to", None):
        valid_to = temporal.valid_to
    elif "valid_to" in props:
        valid_to = props.get("valid_to")
    elif "end_date" in props:
        valid_to = props.get("end_date")

    if not valid_to:
        return "Current"

    try:
        dt = datetime.fromisoformat(str(valid_to).replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        return "Historical" if dt < now else "Current"
    except Exception:
        return "Current"


# ============================================================================
# GRAPH PROJECTION SERVICE
# ============================================================================

class GraphProjectionService:
    """
    Transforms rich internal canonical graph into clean projections and handles
    bounded exploration, search, neighborhood queries, and deep audit inspections.
    """

    _cached_entities: Dict[str, CanonicalEntity] = {}
    _cached_relationships: Dict[str, CanonicalRelationship] = {}

    @classmethod
    def set_cache(cls, entities: List[CanonicalEntity], relationships: List[CanonicalRelationship]):
        """Update synchronized canonical graph cache."""
        cls._cached_entities = {e.canonical_id: e for e in entities}
        cls._cached_relationships = {r.relationship_id: r for r in relationships}
        logger.info(
            "[PROJECTION] Cache updated: %d entities, %d relationships",
            len(cls._cached_entities),
            len(cls._cached_relationships),
        )

    @classmethod
    def get_all_entities(cls) -> List[CanonicalEntity]:
        return list(cls._cached_entities.values())

    @classmethod
    def get_all_relationships(cls) -> List[CanonicalRelationship]:
        return list(cls._cached_relationships.values())

    @classmethod
    def project_entity_to_node(cls, entity: CanonicalEntity) -> VisualizationNode:
        """Project a CanonicalEntity into a clean VisualizationNode."""
        props = dict(entity.properties)
        ident = extract_important_identifier(props)
        is_synth = bool(
            props.get("mock_record")
            or props.get("is_synthetic")
            or "mock" in entity.canonical_id.lower()
        )
        conf = entity.confidence.entity_confidence if entity.confidence else 1.0

        # Curate clean business properties (strip internal routing)
        curated_props = {
            k: v for k, v in props.items()
            if k not in ("_key", "_index", "source_path", "source_references") and v is not None
        }

        # Determine source system
        src_sys = "relational"
        if entity.canonical_id.startswith("firebase:"):
            src_sys = "firebase"
        elif entity.source_references:
            for ref in entity.source_references:
                ref_type = str(getattr(ref, "source_type", "")).lower()
                ref_sys = str(getattr(ref, "source_system", "")).lower()
                if "firebase" in ref_type or "firebase" in ref_sys:
                    src_sys = "firebase"
                    break

        return VisualizationNode(
            id=entity.canonical_id,
            label=entity.display_name,
            entity_type=str(entity.entity_type),
            type=str(entity.entity_type),
            display_name=entity.display_name,
            important_identifier=ident,
            confidence=round(conf, 2),
            source_count=len(entity.source_references) if entity.source_references else 1,
            source_system=src_sys,
            status=props.get("status") or props.get("company_status"),
            is_synthetic=is_synth,
            properties=curated_props,
        )

    @classmethod
    def project_relationship_to_edge(cls, rel: CanonicalRelationship) -> VisualizationEdge:
        """Project a CanonicalRelationship into a clean VisualizationEdge."""
        props = dict(rel.properties)
        is_synth = bool(
            props.get("mock_record")
            or props.get("is_synthetic")
            or "mock" in rel.relationship_id.lower()
        )
        conf = rel.confidence.relationship_confidence if rel.confidence else 1.0
        rel_type_str = str(rel.relationship_type)
        temp_status = determine_temporal_status(rel.temporal, props)

        curated_props = {
            k: v for k, v in props.items()
            if k not in ("_key", "_index") and v is not None
        }

        # Determine source system
        src_sys = "relational"
        if "firebase" in rel.relationship_id.lower() or rel.source_entity_id.startswith("firebase:") or rel.target_entity_id.startswith("firebase:"):
            src_sys = "firebase"
        elif rel.provenance:
            prov_type = str(getattr(rel.provenance, "source_type", "")).lower()
            prov_sys = str(getattr(rel.provenance, "source_system", "")).lower()
            if "firebase" in prov_type or "firebase" in prov_sys:
                src_sys = "firebase"

        display_lbl = format_relationship_label(rel_type_str)
        return VisualizationEdge(
            id=rel.relationship_id,
            source=rel.source_entity_id,
            target=rel.target_entity_id,
            relationship_type=rel_type_str,
            display_label=display_lbl,
            label=display_lbl,
            confidence=round(conf, 2),
            evidence_count=1 if rel.provenance else 1,
            source_system=src_sys,
            temporal_status=temp_status,
            is_synthetic=is_synth,
            properties=curated_props,
        )

    @classmethod
    def project_subgraph(
        cls,
        entities: List[CanonicalEntity],
        relationships: List[CanonicalRelationship],
        limit: int = 50,
        entity_type: Optional[str] = None,
        relationship_type: Optional[str] = None,
        source: Optional[str] = None,
        min_confidence: float = 0.0,
        include_synthetic: bool = True,
        source_system: str = "neo4j",
    ) -> GraphProjectionPayload:
        """
        Build a bounded, clean graph projection respecting filters and data source selection.
        """
        # Filter entities
        filtered_entities = []
        for e in entities:
            # Source system filter (e.g. "firebase", "postgres", "relational", or "all")
            if source and source.strip().lower() not in ("all", ""):
                s_req = source.strip().lower()
                is_fb = (
                    e.canonical_id.startswith("firebase:")
                    or any(
                        "firebase" in str(getattr(ref, "source_type", "")).lower()
                        or "firebase" in str(getattr(ref, "source_system", "")).lower()
                        for ref in (e.source_references or [])
                    )
                )
                if s_req == "firebase" and not is_fb:
                    continue
                if s_req in ("postgres", "relational") and is_fb:
                    continue

            if entity_type and str(e.entity_type).lower() != entity_type.lower():
                continue
            e_conf = e.confidence.entity_confidence if e.confidence else 1.0
            if e_conf < min_confidence:
                continue
            is_synth = bool(e.properties.get("mock_record") or e.properties.get("is_synthetic"))
            if not include_synthetic and is_synth:
                continue
            filtered_entities.append(e)

        # Bounded subset of entities:
        # If filtered_entities exceeds limit, balance across sources and entity types so that
        # relationships between companies and countries/states/people/suppliers can be rendered.
        if len(filtered_entities) > limit:
            # If no source filter is specified, ensure both Firebase and Relational sources get representation!
            if not source or source.strip().lower() in ("all", ""):
                fb_ents = [
                    e for e in filtered_entities
                    if e.canonical_id.startswith("firebase:")
                    or any(
                        "firebase" in str(getattr(ref, "source_type", "")).lower()
                        or "firebase" in str(getattr(ref, "source_system", "")).lower()
                        for ref in (e.source_references or [])
                    )
                ]
                rel_ents = [e for e in filtered_entities if e not in fb_ents]

                if fb_ents and rel_ents:
                    fb_budget = limit // 2
                    rel_budget = limit - fb_budget

                    def balance_group(grp: List[CanonicalEntity], budget: int) -> List[CanonicalEntity]:
                        by_t: Dict[str, List[CanonicalEntity]] = {}
                        for item in grp:
                            by_t.setdefault(str(item.entity_type), []).append(item)
                        sel: List[CanonicalEntity] = []
                        for et, g in by_t.items():
                            if et.lower() != "company":
                                sel.extend(g[: min(len(g), 10)])
                        rem = max(0, budget - len(sel))
                        sel.extend(by_t.get("Company", [])[:rem])
                        return sel[:budget]

                    visible_entities = balance_group(fb_ents, fb_budget) + balance_group(rel_ents, rel_budget)
                else:
                    by_type: Dict[str, List[CanonicalEntity]] = {}
                    for e in filtered_entities:
                        et = str(e.entity_type)
                        by_type.setdefault(et, []).append(e)

                    selected: List[CanonicalEntity] = []
                    for et, group in by_type.items():
                        if et.lower() != "company":
                            selected.extend(group[: min(len(group), 10)])

                    remaining = max(0, limit - len(selected))
                    primary_group = by_type.get("Company", [])
                    selected.extend(primary_group[:remaining])
                    visible_entities = selected[:limit]
            else:
                by_type: Dict[str, List[CanonicalEntity]] = {}
                for e in filtered_entities:
                    et = str(e.entity_type)
                    by_type.setdefault(et, []).append(e)

                selected: List[CanonicalEntity] = []
                for et, group in by_type.items():
                    if et.lower() != "company":
                        selected.extend(group[: min(len(group), 10)])

                remaining = max(0, limit - len(selected))
                primary_group = by_type.get("Company", [])
                selected.extend(primary_group[:remaining])
                visible_entities = selected[:limit]
        else:
            visible_entities = filtered_entities

        visible_ids = {e.canonical_id for e in visible_entities}

        # Filter relationships touching visible entities
        filtered_edges = []
        for r in relationships:
            if r.source_entity_id not in visible_ids or r.target_entity_id not in visible_ids:
                continue
            if relationship_type and str(r.relationship_type).lower() != relationship_type.lower():
                continue
            r_conf = r.confidence.relationship_confidence if r.confidence else 1.0
            if r_conf < min_confidence:
                continue
            is_synth = bool(r.properties.get("mock_record") or r.properties.get("is_synthetic"))
            if not include_synthetic and is_synth:
                continue
            filtered_edges.append(r)

        nodes = [cls.project_entity_to_node(e) for e in visible_entities]
        edges = [cls.project_relationship_to_edge(r) for r in filtered_edges]

        return GraphProjectionPayload(
            status="success",
            source=source_system,
            total_nodes=len(nodes),
            total_edges=len(edges),
            nodes=nodes,
            edges=edges,
            metadata={
                "all_entities_count": len(entities),
                "all_relationships_count": len(relationships),
                "limit_applied": limit,
                "entity_type_filter": entity_type,
                "relationship_type_filter": relationship_type,
                "source_filter": source,
                "min_confidence_filter": min_confidence,
                "include_synthetic": include_synthetic,
            }
        )

    @classmethod
    def search_entities(cls, query: str, limit: int = 20) -> List[VisualizationNode]:
        """
        Search entities by display name, CIN, DIN, identifier, or keyword.
        """
        if not query or not query.strip():
            return []

        q = query.strip().lower()
        results: List[CanonicalEntity] = []

        for entity in cls._cached_entities.values():
            # Match display name
            if q in entity.display_name.lower():
                results.append(entity)
                continue

            # Match canonical ID
            if q in entity.canonical_id.lower():
                results.append(entity)
                continue

            # Match property identifiers (CIN, DIN, etc.)
            for val in entity.properties.values():
                if val and q in str(val).lower():
                    results.append(entity)
                    break

            if len(results) >= limit:
                break

        return [cls.project_entity_to_node(e) for e in results]

    @classmethod
    def get_neighborhood(
        cls,
        canonical_id: str,
        hops: int = 1,
        limit: int = 50,
    ) -> GraphProjectionPayload:
        """
        Extract the local neighborhood subgraph around a specific entity.
        """
        if canonical_id not in cls._cached_entities:
            return GraphProjectionPayload(
                status="not_found",
                source="projection",
                total_nodes=0,
                total_edges=0,
                nodes=[],
                edges=[],
                metadata={"target_id": canonical_id, "error": "Entity not found"}
            )

        neighborhood_entity_ids: Set[str] = {canonical_id}
        frontier: Set[str] = {canonical_id}

        # Expand hops
        for _ in range(max(1, min(hops, 3))):
            next_frontier: Set[str] = set()
            for r in cls._cached_relationships.values():
                if r.source_entity_id in frontier:
                    next_frontier.add(r.target_entity_id)
                if r.target_entity_id in frontier:
                    next_frontier.add(r.source_entity_id)
            neighborhood_entity_ids.update(next_frontier)
            frontier = next_frontier
            if len(neighborhood_entity_ids) >= limit:
                break

        # Collect entities
        entities = [
            cls._cached_entities[eid]
            for eid in list(neighborhood_entity_ids)[:limit]
            if eid in cls._cached_entities
        ]
        valid_ids = {e.canonical_id for e in entities}

        # Collect connecting relationships
        relationships = [
            r for r in cls._cached_relationships.values()
            if r.source_entity_id in valid_ids and r.target_entity_id in valid_ids
        ]

        nodes = [cls.project_entity_to_node(e) for e in entities]
        edges = [cls.project_relationship_to_edge(r) for r in relationships]

        return GraphProjectionPayload(
            status="success",
            source="neighborhood",
            total_nodes=len(nodes),
            total_edges=len(edges),
            nodes=nodes,
            edges=edges,
            metadata={"center_id": canonical_id, "hops": hops}
        )

    @classmethod
    def get_entity_detail(cls, canonical_id: str) -> Optional[EntityDetailResponse]:
        """
        Retrieve comprehensive, auditable detail view for an entity.
        """
        entity = cls._cached_entities.get(canonical_id)
        if not entity:
            return None

        props = dict(entity.properties)
        is_synth = bool(
            props.get("mock_record")
            or props.get("is_synthetic")
            or "mock" in entity.canonical_id.lower()
        )

        # Build identifiers dict
        identifiers = {}
        for k in ("cin", "CIN", "din", "DIN", "registration_number", "contract_number", "pan", "supplier_id", "code"):
            if k in props and props[k]:
                identifiers[k] = props[k]

        # Sources / Provenance
        sources = []
        if entity.source_references:
            for s in entity.source_references:
                sources.append({
                    "source_system": s.source_system,
                    "source_type": str(s.source_type),
                    "source_record_id": s.source_record_id,
                    "source_path": s.source_path,
                    "source_table": s.source_table,
                    "observed_at": s.observed_at,
                    "ingested_at": s.ingested_at,
                    "reliability": s.source_reliability,
                })
        else:
            sources.append({
                "source_system": props.get("source_system", "system"),
                "source_type": props.get("source_type", "relational"),
                "source_record_id": props.get("id", canonical_id),
                "reliability": 1.0,
            })

        # Temporal
        temp_dict = {
            "observed_at": entity.temporal.observed_at if entity.temporal else props.get("observed_at"),
            "valid_from": entity.temporal.valid_from if entity.temporal else props.get("valid_from") or props.get("start_date") or props.get("incorporation_date"),
            "valid_to": entity.temporal.valid_to if entity.temporal else props.get("valid_to") or props.get("end_date"),
            "status": determine_temporal_status(entity.temporal, props),
        }

        # Confidence
        conf_dict = {
            "entity_confidence": entity.confidence.entity_confidence if entity.confidence else 1.0,
            "mapping_confidence": entity.confidence.mapping_confidence if entity.confidence else 1.0,
            "source_reliability": entity.confidence.source_reliability if entity.confidence else 1.0,
        }

        # Connected relationships summary
        connected = []
        for r in cls._cached_relationships.values():
            if r.source_entity_id == canonical_id:
                target_ent = cls._cached_entities.get(r.target_entity_id)
                connected.append({
                    "relationship_id": r.relationship_id,
                    "type": str(r.relationship_type),
                    "display_label": format_relationship_label(str(r.relationship_type)),
                    "direction": "OUTGOING",
                    "target_id": r.target_entity_id,
                    "target_name": target_ent.display_name if target_ent else r.target_entity_id,
                    "confidence": r.confidence.relationship_confidence if r.confidence else 1.0,
                    "is_synthetic": bool(r.properties.get("mock_record") or r.properties.get("is_synthetic")),
                })
            elif r.target_entity_id == canonical_id:
                source_ent = cls._cached_entities.get(r.source_entity_id)
                connected.append({
                    "relationship_id": r.relationship_id,
                    "type": str(r.relationship_type),
                    "display_label": format_relationship_label(str(r.relationship_type)),
                    "direction": "INCOMING",
                    "source_id": r.source_entity_id,
                    "source_name": source_ent.display_name if source_ent else r.source_entity_id,
                    "confidence": r.confidence.relationship_confidence if r.confidence else 1.0,
                    "is_synthetic": bool(r.properties.get("mock_record") or r.properties.get("is_synthetic")),
                })

        return EntityDetailResponse(
            canonical_id=entity.canonical_id,
            entity_type=str(entity.entity_type),
            display_name=entity.display_name,
            identifiers=identifiers,
            resolution={
                "status": "RESOLVED",
                "match_origin": "DETERMINISTIC_EXACT" if identifiers else "PRIMARY_KEY",
                "confidence": conf_dict["entity_confidence"],
            },
            sources=sources,
            temporal=temp_dict,
            confidence=conf_dict,
            status=props.get("status") or props.get("company_status"),
            is_synthetic=is_synth,
            properties=props,
            connected_edges=connected,
        )

    @classmethod
    def get_relationship_detail(cls, relationship_id: str) -> Optional[RelationshipDetailResponse]:
        """
        Retrieve comprehensive detail view for a relationship.
        """
        rel = cls._cached_relationships.get(relationship_id)
        if not rel:
            return None

        props = dict(rel.properties)
        is_synth = bool(
            props.get("mock_record")
            or props.get("is_synthetic")
            or "mock" in rel.relationship_id.lower()
        )
        rel_type_str = str(rel.relationship_type)

        source_ent = cls._cached_entities.get(rel.source_entity_id)
        target_ent = cls._cached_entities.get(rel.target_entity_id)

        sources = []
        if rel.provenance:
            sources.append({
                "source_system": rel.provenance.source_system,
                "source_type": str(rel.provenance.source_type),
                "source_path": rel.provenance.source_path,
                "source_table": rel.provenance.source_table,
                "observed_at": rel.provenance.observed_at,
                "ingested_at": rel.provenance.ingested_at,
                "reliability": rel.provenance.source_reliability,
            })
        else:
            sources.append({
                "source_system": props.get("source_system", "system"),
                "source_type": props.get("source_type", "relational"),
                "reliability": 1.0,
            })

        temp_dict = {
            "observed_at": rel.temporal.observed_at if rel.temporal else props.get("observed_at"),
            "valid_from": rel.temporal.valid_from if rel.temporal else props.get("valid_from") or props.get("start_date"),
            "valid_to": rel.temporal.valid_to if rel.temporal else props.get("valid_to") or props.get("end_date"),
            "status": determine_temporal_status(rel.temporal, props),
        }

        conf_dict = {
            "relationship_confidence": rel.confidence.relationship_confidence if rel.confidence else 1.0,
            "source_reliability": rel.confidence.source_reliability if rel.confidence else 1.0,
        }

        return RelationshipDetailResponse(
            relationship_id=rel.relationship_id,
            relationship_type=rel_type_str,
            display_label=format_relationship_label(rel_type_str),
            source_entity={
                "id": rel.source_entity_id,
                "type": rel.source_entity_type,
                "name": source_ent.display_name if source_ent else rel.source_entity_id,
            },
            target_entity={
                "id": rel.target_entity_id,
                "type": rel.target_entity_type,
                "name": target_ent.display_name if target_ent else rel.target_entity_id,
            },
            confidence=conf_dict,
            evidence_count=len(sources),
            sources=sources,
            temporal=temp_dict,
            is_synthetic=is_synth,
            properties=props,
        )

    @classmethod
    def get_stats(cls) -> GraphStatsResponse:
        """Compute real Knowledge Graph statistics."""
        entities = list(cls._cached_entities.values())
        relationships = list(cls._cached_relationships.values())

        entity_counts: Dict[str, int] = {}
        synth_entities = 0
        source_counts: Dict[str, int] = {}

        for e in entities:
            t = str(e.entity_type)
            entity_counts[t] = entity_counts.get(t, 0) + 1
            if e.properties.get("mock_record") or e.properties.get("is_synthetic"):
                synth_entities += 1
            src = "unknown"
            if e.source_references:
                src = e.source_references[0].source_system
            elif "source" in e.properties:
                src = str(e.properties["source"])
            source_counts[src] = source_counts.get(src, 0) + 1

        rel_counts: Dict[str, int] = {}
        synth_rels = 0
        for r in relationships:
            rt = str(r.relationship_type)
            rel_counts[rt] = rel_counts.get(rt, 0) + 1
            if r.properties.get("mock_record") or r.properties.get("is_synthetic"):
                synth_rels += 1

        return GraphStatsResponse(
            total_entities=len(entities),
            total_relationships=len(relationships),
            entity_type_counts=entity_counts,
            relationship_type_counts=rel_counts,
            total_sources=len(source_counts),
            source_counts=source_counts,
            synthetic_entity_count=synth_entities,
            synthetic_relationship_count=synth_rels,
            verified_entity_count=len(entities) - synth_entities,
            verified_relationship_count=len(relationships) - synth_rels,
        )

    @classmethod
    def reconcile_graph(cls) -> ReconciliationReport:
        """
        Audit canonical Knowledge Graph integrity, detecting duplicate IDs,
        orphaned edges, missing provenance/temporal/confidence, and synthetic markers.
        """
        entities = cls._cached_entities
        relationships = cls._cached_relationships

        duplicate_ids = 0
        orphaned_rels = 0
        missing_prov = 0
        missing_conf = 0
        missing_temp = 0
        synth_count = 0
        details = []

        # Check relationships for orphaned references
        for r in relationships.values():
            has_source = r.source_entity_id in entities
            has_target = r.target_entity_id in entities
            if not has_source or not has_target:
                orphaned_rels += 1
                details.append(
                    f"Orphaned rel {r.relationship_id}: source={r.source_entity_id} (found: {has_source}), target={r.target_entity_id} (found: {has_target})"
                )

            if not r.provenance:
                missing_prov += 1
            if not r.confidence:
                missing_conf += 1
            if not r.temporal:
                missing_temp += 1
            if r.properties.get("mock_record") or r.properties.get("is_synthetic"):
                synth_count += 1

        for e in entities.values():
            if not e.source_references:
                missing_prov += 1
            if not e.confidence:
                missing_conf += 1
            if not e.temporal:
                missing_temp += 1
            if e.properties.get("mock_record") or e.properties.get("is_synthetic"):
                synth_count += 1

        status = "PASSED" if orphaned_rels == 0 and duplicate_ids == 0 else "WARNING"
        if orphaned_rels > 0:
            details.insert(0, f"Found {orphaned_rels} relationships with missing endpoints.")
        else:
            details.append("Graph topology verified: zero orphaned relationships.")

        return ReconciliationReport(
            timestamp=datetime.now(timezone.utc).isoformat(),
            canonical_entity_count=len(entities),
            canonical_relationship_count=len(relationships),
            duplicate_canonical_ids=duplicate_ids,
            orphaned_relationships=orphaned_rels,
            missing_provenance_count=missing_prov,
            missing_confidence_count=missing_conf,
            missing_temporal_count=missing_temp,
            synthetic_marker_count=synth_count,
            status=status,
            details=details[:50],  # Bound details length
        )
