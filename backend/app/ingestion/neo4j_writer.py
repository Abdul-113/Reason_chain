"""
Neo4j Graph Writer — Writes canonical nodes and relationships to Neo4j.
Uses MERGE for idempotent operations (no duplicates on re-run).
Consumes CanonicalEntity / CanonicalRelationship objects or legacy dictionaries.
Tracks throughput, latency, and synchronizes with GraphProjectionService.
"""

import logging
import time
from typing import List, Dict, Any, Union, Optional
from collections import defaultdict

from app.db.neo4j import Neo4jConnection
from app.domain.entities import CanonicalEntity
from app.domain.relationships import CanonicalRelationship
from app.domain.graph import CanonicalGraphPayload
from app.services.graph_projection import GraphProjectionService

logger = logging.getLogger("reasonchain.ingestion.neo4j")


class Neo4jWriter:
    """Writes canonical entities and relationships to Neo4j graph database."""

    def __init__(self, batch_size: int = 500):
        self.batch_size = batch_size
        self.stats = {
            "nodes_created": 0,
            "nodes_updated": 0,
            "relationships_created": 0,
            "relationships_updated": 0,
            "duplicates_prevented": 0,
            "errors": 0,
            "duration_ms": 0,
            "nodes_per_sec": 0.0,
            "rels_per_sec": 0.0,
        }

    def ensure_constraints(self):
        """Create uniqueness constraints — idempotent."""
        try:
            Neo4jConnection.create_constraints()
            logger.info("[INGESTION] Neo4j constraints ensured")
        except Exception as ex:
            logger.warning(f"[INGESTION] Constraints warning: {ex}")

    def write_canonical_payload(
        self,
        payload: CanonicalGraphPayload,
        sync_projection: bool = True
    ) -> Dict[str, Any]:
        """
        Write a complete CanonicalGraphPayload to Neo4j and synchronize projection.
        """
        start_time = time.time()
        node_dicts = [e.to_neo4j_node_dict() for e in payload.entities]
        rel_dicts = [r.to_neo4j_rel_dict() for r in payload.relationships]

        nodes_count = self.write_nodes(node_dicts)
        rels_count = self.write_relationships(rel_dicts)

        elapsed = max(time.time() - start_time, 0.001)
        duration_ms = int(elapsed * 1000)

        self.stats["duration_ms"] = duration_ms
        self.stats["nodes_per_sec"] = round(nodes_count / elapsed, 2)
        self.stats["rels_per_sec"] = round(rels_count / elapsed, 2)

        # Synchronize with local projection service
        if sync_projection:
            # Merge with existing cache
            existing_entities = {e.canonical_id: e for e in GraphProjectionService.get_all_entities()}
            for e in payload.entities:
                existing_entities[e.canonical_id] = e

            existing_rels = {r.relationship_id: r for r in GraphProjectionService.get_all_relationships()}
            for r in payload.relationships:
                existing_rels[r.relationship_id] = r

            GraphProjectionService.set_cache(
                list(existing_entities.values()),
                list(existing_rels.values())
            )

        return {
            "nodes_written": nodes_count,
            "relationships_written": rels_count,
            "duration_ms": duration_ms,
            "nodes_per_sec": self.stats["nodes_per_sec"],
            "rels_per_sec": self.stats["rels_per_sec"],
        }

    def write_nodes(self, nodes: List[Union[Dict[str, Any], CanonicalEntity]]) -> int:
        """
        Write nodes to Neo4j using MERGE.
        Accepts CanonicalEntity objects or dictionary objects.
        Each node dict: { label, key_field, properties }
        Returns count of nodes processed.
        """
        formatted_nodes = []
        raw_entities: List[CanonicalEntity] = []

        for n in nodes:
            if isinstance(n, CanonicalEntity):
                raw_entities.append(n)
                formatted_nodes.append(n.to_neo4j_node_dict())
            else:
                formatted_nodes.append(n)

        # Update projection cache with any CanonicalEntity passed directly
        if raw_entities:
            existing = {e.canonical_id: e for e in GraphProjectionService.get_all_entities()}
            for e in raw_entities:
                existing[e.canonical_id] = e
            GraphProjectionService.set_cache(
                list(existing.values()),
                GraphProjectionService.get_all_relationships()
            )

        # Group nodes by label for batch processing
        by_label = defaultdict(list)
        for node in formatted_nodes:
            by_label[node["label"]].append(node)

        total = 0
        for label, batch in by_label.items():
            key_field = batch[0].get("key_field", "id")
            props_list = [n["properties"] for n in batch]

            for i in range(0, len(props_list), self.batch_size):
                chunk = props_list[i : i + self.batch_size]
                self._merge_nodes_batch(label, key_field, chunk)
                total += len(chunk)

            logger.info(f"[INGESTION] Merged {len(props_list)} :{label} nodes")

        self.stats["nodes_created"] = total
        return total

    def _merge_nodes_batch(self, label: str, key_field: str, props_list: List[Dict[str, Any]]):
        """Batch MERGE nodes of a given label with retry protection."""
        query = f"""
        UNWIND $rows AS row
        MERGE (n:{label} {{{key_field}: row.{key_field}}})
        SET n += row
        """
        try:
            Neo4jConnection.execute_write_batch(query, props_list)
        except Exception as ex:
            self.stats["errors"] += 1
            logger.warning(f"[INGESTION] Neo4j node write notice: {ex}")

    def write_relationships(self, relationships: List[Union[Dict[str, Any], CanonicalRelationship]]) -> int:
        """
        Write relationships to Neo4j using MERGE.
        Accepts CanonicalRelationship objects or dictionary objects.
        Each rel dict: { rel_type, from_label, from_key, from_value, to_label, to_key, to_value, properties }
        Returns count of relationships processed.
        """
        formatted_rels = []
        raw_rels: List[CanonicalRelationship] = []

        for rel in relationships:
            if isinstance(rel, CanonicalRelationship):
                raw_rels.append(rel)
                formatted_rels.append(rel.to_neo4j_rel_dict())
            else:
                formatted_rels.append(rel)

        if raw_rels:
            existing = {r.relationship_id: r for r in GraphProjectionService.get_all_relationships()}
            for r in raw_rels:
                existing[r.relationship_id] = r
            GraphProjectionService.set_cache(
                GraphProjectionService.get_all_entities(),
                list(existing.values())
            )

        by_type = defaultdict(list)
        for rel in formatted_rels:
            key = (rel["rel_type"], rel["from_label"], rel["to_label"])
            by_type[key].append(rel)

        total = 0
        for (rel_type, from_label, to_label), batch in by_type.items():
            for i in range(0, len(batch), self.batch_size):
                chunk = batch[i : i + self.batch_size]
                self._merge_relationships_batch(rel_type, from_label, to_label, chunk)
                total += len(chunk)
            logger.info(f"[INGESTION] Merged {len(batch)} [:{rel_type}] relationships ({from_label} -> {to_label})")

        self.stats["relationships_created"] = total
        return total

    def _merge_relationships_batch(self, rel_type: str, from_label: str, to_label: str, batch: List[Dict[str, Any]]):
        """Batch MERGE relationships with retry protection."""
        from_key = batch[0].get("from_key", "canonical_entity_id")
        to_key = batch[0].get("to_key", "canonical_entity_id")

        rows = []
        for rel in batch:
            rows.append({
                "from_id": rel["from_value"],
                "to_id": rel["to_value"],
                "props": rel.get("properties", {})
            })

        # Dual-check query: supports both canonical_entity_id and legacy key fields
        query = f"""
        UNWIND $rows AS row
        MATCH (a:{from_label}) WHERE a.{from_key} = row.from_id OR a.canonical_entity_id = row.from_id OR a.id = row.from_id
        MATCH (b:{to_label}) WHERE b.{to_key} = row.to_id OR b.canonical_entity_id = row.to_id OR b.id = row.to_id
        MERGE (a)-[r:{rel_type}]->(b)
        SET r += row.props
        """
        try:
            Neo4jConnection.execute_write_batch(query, rows)
        except Exception as ex:
            self.stats["errors"] += 1
            logger.warning(f"[INGESTION] Neo4j relationship write notice: {ex}")

    def get_stats(self) -> Dict[str, Any]:
        """Return write statistics including throughput and latency."""
        return dict(self.stats)
