"""
Neo4j Graph Writer — Writes mapped nodes and relationships to Neo4j.
Uses MERGE for idempotent operations (no duplicates on re-run).
"""

import logging
from typing import List, Dict, Any
from app.db.neo4j import Neo4jConnection

logger = logging.getLogger("reasonchain.ingestion")


class Neo4jWriter:
    """Writes nodes and relationships to Neo4j graph database."""

    def __init__(self):
        self.stats = {
            "nodes_created": 0,
            "nodes_updated": 0,
            "relationships_created": 0,
            "relationships_updated": 0,
            "duplicates_prevented": 0,
            "errors": 0,
        }

    def ensure_constraints(self):
        """Create uniqueness constraints — idempotent."""
        Neo4jConnection.create_constraints()
        logger.info("[INGESTION] Neo4j constraints ensured")

    def write_nodes(self, nodes: List[Dict[str, Any]]) -> int:
        """
        Write nodes to Neo4j using MERGE.
        Each node dict: { label, key_field, properties }
        Returns count of nodes processed.
        """
        # Group nodes by label for batch processing
        from collections import defaultdict
        by_label = defaultdict(list)
        for node in nodes:
            by_label[node["label"]].append(node)

        total = 0
        for label, batch in by_label.items():
            key_field = batch[0]["key_field"]
            props_list = [n["properties"] for n in batch]
            self._merge_nodes_batch(label, key_field, props_list)
            total += len(props_list)
            logger.info(f"[INGESTION] Merged {len(props_list)} :{label} nodes")

        self.stats["nodes_created"] = total
        return total

    def _merge_nodes_batch(self, label: str, key_field: str, props_list: List[Dict[str, Any]]):
        """Batch MERGE nodes of a given label."""
        query = f"""
        UNWIND $rows AS row
        MERGE (n:{label} {{{key_field}: row.{key_field}}})
        SET n += row
        """
        Neo4jConnection.execute_write_batch(query, props_list)

    def write_relationships(self, relationships: List[Dict[str, Any]]) -> int:
        """
        Write relationships to Neo4j using MERGE.
        Each rel dict: { rel_type, from_label, from_key, from_value, to_label, to_key, to_value, properties }
        Returns count of relationships processed.
        """
        from collections import defaultdict
        by_type = defaultdict(list)
        for rel in relationships:
            key = (rel["rel_type"], rel["from_label"], rel["to_label"])
            by_type[key].append(rel)

        total = 0
        for (rel_type, from_label, to_label), batch in by_type.items():
            self._merge_relationships_batch(rel_type, from_label, to_label, batch)
            total += len(batch)
            logger.info(f"[INGESTION] Merged {len(batch)} [:{rel_type}] relationships ({from_label} -> {to_label})")

        self.stats["relationships_created"] = total
        return total

    def _merge_relationships_batch(self, rel_type: str, from_label: str, to_label: str, batch: List[Dict[str, Any]]):
        """Batch MERGE relationships."""
        from_key = batch[0]["from_key"]
        to_key = batch[0]["to_key"]

        # Build rows for UNWIND
        rows = []
        for rel in batch:
            rows.append({
                "from_id": rel["from_value"],
                "to_id": rel["to_value"],
                "props": rel.get("properties", {})
            })

        query = f"""
        UNWIND $rows AS row
        MATCH (a:{from_label} {{{from_key}: row.from_id}})
        MATCH (b:{to_label} {{{to_key}: row.to_id}})
        MERGE (a)-[r:{rel_type}]->(b)
        SET r += row.props
        """
        Neo4jConnection.execute_write_batch(query, rows)

    def get_stats(self) -> Dict[str, int]:
        """Return current write statistics."""
        return dict(self.stats)
