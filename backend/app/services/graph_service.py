"""
Knowledge Graph Service
Queries Neo4j AuraDB for graph nodes and relationships and standardizes the API response format.
Supports active Neo4j query execution with fallback to database mapper dataset.
"""

import logging
from typing import Dict, Any, List, Set
from app.db.neo4j import Neo4jConnection
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
from app.ingestion.mapper import (
    map_companies_to_nodes,
    map_suppliers_to_nodes,
    map_people_to_nodes,
    map_contracts_to_nodes,
    map_sanctions_to_nodes,
    map_countries_to_nodes,
    map_supplier_relationships,
    map_director_relationships,
    map_ownership_relationships,
    map_contract_relationships,
    map_sanction_relationships,
    map_located_in_relationships,
)

logger = logging.getLogger("reasonchain.graph")


class GraphService:
    @staticmethod
    def get_full_graph() -> Dict[str, Any]:
        """
        Fetch complete Knowledge Graph from Neo4j AuraDB.
        Returns:
        {
          "nodes": [
            { "id": "C001", "label": "Acme Manufacturing", "type": "Company", "properties": {...} }
          ],
          "edges": [
            { "id": "S001-C001-SUPPLIES", "source": "S001", "target": "C001", "label": "SUPPLIES", "properties": {...} }
          ]
        }
        """
        # Try querying Neo4j first — with a fast connectivity check
        try:
            # Quick connectivity gate: skip Neo4j entirely if unreachable
            conn_check = Neo4jConnection.test_connection()
            if not conn_check["success"]:
                raise Exception(conn_check["message"])

            driver = Neo4jConnection.get_driver()
            with driver.session() as session:
                result = session.run("""
                    MATCH (n)
                    OPTIONAL MATCH (n)-[r]->(m)
                    RETURN n, r, m
                """)

                nodes_dict: Dict[str, Dict[str, Any]] = {}
                edges_list: List[Dict[str, Any]] = []
                seen_edges: Set[str] = set()

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
                        edge_id = f"{n_id}-{m_id}-{rel_type}"

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
                    logger.info(f"[GRAPH API] Retrieved {len(nodes_dict)} nodes and {len(edges_list)} edges from Neo4j")
                    return {
                        "status": "success",
                        "source": "neo4j",
                        "total_nodes": len(nodes_dict),
                        "total_edges": len(edges_list),
                        "nodes": list(nodes_dict.values()),
                        "edges": edges_list,
                    }

        except Exception as e:
            logger.warning(f"[GRAPH API] Neo4j direct query notice: {e}. Generating mapped graph dataset.")

        # Fallback: Generate graph directly from database ingestion mapper
        return GraphService._generate_mapped_fallback_graph()

    @staticmethod
    def _get_node_id(node_obj: Any) -> str:
        """Extract primary string ID from Neo4j node object or dict."""
        props = dict(node_obj)
        return str(props.get("id") or props.get("code") or getattr(node_obj, "element_id", ""))

    @staticmethod
    def _format_neo4j_node(node_obj: Any) -> Dict[str, Any]:
        """Format Neo4j Node object into standardized API dict."""
        props = dict(node_obj)
        labels = list(getattr(node_obj, "labels", []))
        node_type = labels[0] if labels else props.get("type", "Company")
        node_id = props.get("id") or props.get("code") or str(getattr(node_obj, "element_id", ""))

        label = (
            props.get("name")
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

    @staticmethod
    def _generate_mapped_fallback_graph() -> Dict[str, Any]:
        """Generate standardized graph response from relational mapper data."""
        raw_companies = extract_companies()
        raw_suppliers = extract_suppliers()
        raw_people = extract_people()
        raw_contracts = extract_contracts()
        raw_sanctions = extract_sanctions()
        raw_countries = extract_countries()

        norm_companies = normalize_companies(raw_companies)
        norm_suppliers = normalize_suppliers(raw_suppliers)
        norm_people = normalize_people(raw_people)
        norm_contracts = normalize_relationships(raw_contracts, "contracts")
        norm_sanctions = normalize_relationships(raw_sanctions, "sanctions")
        norm_countries = normalize_countries(raw_countries)

        norm_directors = normalize_relationships(extract_company_directors(), "company_directors")
        norm_supplier_rels = normalize_relationships(extract_supplier_relationships(), "supplier_relationships")
        norm_ownership = normalize_relationships(extract_ownership(), "ownership")

        # Map nodes
        nodes: List[Dict[str, Any]] = []
        for n in map_companies_to_nodes(norm_companies):
            nodes.append({
                "id": n["properties"]["id"],
                "label": n["properties"]["name"],
                "type": "Company",
                "properties": n["properties"],
            })
        for n in map_suppliers_to_nodes(norm_suppliers):
            nodes.append({
                "id": n["properties"]["id"],
                "label": n["properties"]["name"],
                "type": "Supplier",
                "properties": n["properties"],
            })
        for n in map_people_to_nodes(norm_people):
            nodes.append({
                "id": n["properties"]["id"],
                "label": n["properties"]["full_name"],
                "type": "Person",
                "properties": n["properties"],
            })
        for n in map_contracts_to_nodes(norm_contracts):
            nodes.append({
                "id": n["properties"]["id"],
                "label": n["properties"]["contract_number"],
                "type": "Contract",
                "properties": n["properties"],
            })
        for n in map_sanctions_to_nodes(norm_sanctions):
            nodes.append({
                "id": n["properties"]["id"],
                "label": f"Sanction ({n['properties'].get('authority', 'OFAC')})",
                "type": "Sanction",
                "properties": n["properties"],
            })
        for n in map_countries_to_nodes(norm_countries):
            nodes.append({
                "id": n["properties"]["code"],
                "label": n["properties"]["name"],
                "type": "Country",
                "properties": n["properties"],
            })

        # Map edges
        raw_edges: List[Dict[str, Any]] = []
        raw_edges.extend(map_supplier_relationships(norm_supplier_rels))
        raw_edges.extend(map_director_relationships(norm_directors))
        raw_edges.extend(map_ownership_relationships(norm_ownership))
        raw_edges.extend(map_contract_relationships(norm_contracts))
        raw_edges.extend(map_sanction_relationships(norm_sanctions))
        raw_edges.extend(map_located_in_relationships(norm_companies, norm_suppliers, norm_people))

        edges: List[Dict[str, Any]] = []
        seen_edges: Set[str] = set()

        for idx, e in enumerate(raw_edges):
            source = str(e["from_value"])
            target = str(e["to_value"])
            label = e["rel_type"]
            edge_id = f"{source}-{target}-{label}"

            if edge_id not in seen_edges and source and target:
                seen_edges.add(edge_id)
                edges.append({
                    "id": edge_id,
                    "source": source,
                    "target": target,
                    "label": label,
                    "properties": e.get("properties", {}),
                })

        return {
            "status": "success",
            "source": "relational_mapped",
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "nodes": nodes,
            "edges": edges,
        }
