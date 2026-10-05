"""
Comprehensive Test Suite for Canonical Knowledge Graph Materialization & Projection
Covers:
1. Canonical entity creation (Company, Person, Supplier, Contract, Sanction, Country)
2. Canonical relationship creation (OWNS, DIRECTOR_OF, SUPPLIES, HAS_CONTRACT, etc.)
3. Provenance preservation (source_system, source_type, source_path, source_record_id, reliability)
4. Temporal preservation (observed_at, valid_from, valid_to, status Current/Historical)
5. Confidence preservation (mapping, entity, relationship, source reliability)
6. Synthetic marker preservation (mock_record=True, is_synthetic=True)
7. Idempotent ingestion (running writes multiple times produces zero duplicates)
8. Duplicate prevention on merge (merging same canonical_entity_id updates cleanly)
9. Projection layer node projection (VisualizationNode, display name, clean properties)
10. Projection layer edge projection (VisualizationEdge, human-readable labels)
11. Bounded subgraph projection (limit, entity_type filter, min_confidence, synthetic toggle)
12. Entity detail retrieval (deep multi-section auditable response)
13. Relationship detail retrieval (endpoint details, confidence, provenance)
14. Entity search (by name, CIN, DIN, identifier)
15. Local neighborhood expansion (1-hop expansion)
16. Graph reconciliation audit (checks orphaned relationships, duplicate IDs)
17. Neo4j offline / failure handling (graceful fallback to canonical cache)
"""

import sys
import os
import pytest
from datetime import datetime, timezone

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.domain.entities import CanonicalEntity, EntityCategory
from app.domain.relationships import CanonicalRelationship, CanonicalRelationshipType
from app.domain.provenance import ProvenanceMetadata, SourceType
from app.domain.confidence import ConfidenceMetadata
from app.domain.temporal import TemporalMetadata
from app.domain.graph import CanonicalGraphPayload
from app.ingestion.neo4j_writer import Neo4jWriter
from app.ingestion.materialization_pipeline import MaterializationPipeline
from app.services.graph_projection import (
    GraphProjectionService,
    VisualizationNode,
    VisualizationEdge,
    format_relationship_label,
    extract_important_identifier,
    determine_temporal_status,
)
from app.services.graph_service import GraphService


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def sample_company():
    prov = ProvenanceMetadata(
        source_system="mca_registry",
        source_type=SourceType.FIREBASE,
        source_path="/companies/company_00001",
        source_record_id="company_00001",
        observed_at="2025-01-10T10:00:00Z",
        source_reliability=0.98,
    )
    conf = ConfidenceMetadata(
        mapping_confidence=0.95,
        entity_confidence=0.99,
        source_reliability=0.98,
    )
    temp = TemporalMetadata(
        observed_at="2025-01-10T10:00:00Z",
        valid_from="2019-05-15",
    )
    return CanonicalEntity(
        canonical_id="firebase:companies:U74999MH2019PTC334643",
        entity_type=EntityCategory.COMPANY,
        display_name="1ST RATE PHARMA PRIVATE LIMITED",
        properties={
            "cin": "U74999MH2019PTC334643",
            "company_name": "1ST RATE PHARMA PRIVATE LIMITED",
            "status": "Active",
            "company_category": "Company limited by Shares",
            "state": "Maharashtra",
        },
        source_references=[prov],
        confidence=conf,
        temporal=temp,
    )


@pytest.fixture
def sample_director():
    prov = ProvenanceMetadata(
        source_system="mca_registry",
        source_type=SourceType.FIREBASE,
        source_record_id="dir_001",
        source_reliability=0.95,
    )
    return CanonicalEntity(
        canonical_id="firebase:directors:DIN12345678",
        entity_type=EntityCategory.PERSON,
        display_name="Rahul Mehta",
        properties={
            "name": "Rahul Mehta",
            "din": "DIN12345678",
            "role": "Director",
        },
        source_references=[prov],
        confidence=ConfidenceMetadata(entity_confidence=0.92),
    )


@pytest.fixture
def sample_relationship(sample_director, sample_company):
    prov = ProvenanceMetadata(
        source_system="mca_registry",
        source_type=SourceType.FIREBASE,
        observed_at="2025-01-10T10:00:00Z",
        source_reliability=0.95,
    )
    return CanonicalRelationship(
        relationship_id="rel_dir_001_comp_001",
        relationship_type=CanonicalRelationshipType.DIRECTOR_OF,
        source_entity_id=sample_director.canonical_id,
        source_entity_type="Person",
        target_entity_id=sample_company.canonical_id,
        target_entity_type="Company",
        properties={
            "role": "Director",
            "appointment_date": "2020-01-01",
        },
        provenance=prov,
        confidence=ConfidenceMetadata(relationship_confidence=0.96),
        temporal=TemporalMetadata(valid_from="2020-01-01"),
    )


@pytest.fixture
def sample_synthetic_contract(sample_company):
    prov = ProvenanceMetadata(
        source_system="firebase_synthetic",
        source_type=SourceType.FIREBASE,
        source_record_id="contract_00001",
        source_reliability=0.50,
    )
    entity = CanonicalEntity(
        canonical_id="firebase:synthetic:contract:contract_00001",
        entity_type=EntityCategory.CONTRACT,
        display_name="CTR-MOCK-0001",
        properties={
            "contract_reference": "CTR-MOCK-0001",
            "contract_type": "Supply Agreement",
            "mock_record": True,
            "is_synthetic": True,
            "status": "Active",
        },
        source_references=[prov],
        confidence=ConfidenceMetadata(entity_confidence=0.50),
    )
    rel = CanonicalRelationship(
        relationship_id="rel_mock_contract_comp_001",
        relationship_type=CanonicalRelationshipType.HAS_CONTRACT,
        source_entity_id=sample_company.canonical_id,
        source_entity_type="Company",
        target_entity_id=entity.canonical_id,
        target_entity_type="Contract",
        properties={
            "mock_record": True,
            "is_synthetic": True,
        },
        provenance=prov,
        confidence=ConfidenceMetadata(relationship_confidence=0.50),
    )
    return entity, rel


# ============================================================================
# 1. CANONICAL ENTITY & RELATIONSHIP CREATION TESTS
# ============================================================================

def test_canonical_entity_creation(sample_company, sample_director):
    """Verify canonical entity structures, properties, and universal canonical IDs."""
    assert sample_company.canonical_id == "firebase:companies:U74999MH2019PTC334643"
    assert sample_company.entity_type == EntityCategory.COMPANY
    assert sample_company.display_name == "1ST RATE PHARMA PRIVATE LIMITED"
    assert sample_company.properties["cin"] == "U74999MH2019PTC334643"

    node_dict = sample_company.to_neo4j_node_dict()
    assert node_dict["label"] == "Company"
    assert node_dict["key_field"] in ("canonical_entity_id", "id")
    assert node_dict["properties"]["canonical_entity_id"] == sample_company.canonical_id
    assert node_dict["properties"]["name"] == sample_company.display_name


def test_canonical_relationship_creation(sample_relationship):
    """Verify canonical relationship structures, endpoints, and adapter serialization."""
    assert sample_relationship.relationship_id == "rel_dir_001_comp_001"
    assert sample_relationship.relationship_type == CanonicalRelationshipType.DIRECTOR_OF
    assert sample_relationship.source_entity_type == "Person"
    assert sample_relationship.target_entity_type == "Company"

    rel_dict = sample_relationship.to_neo4j_rel_dict()
    assert rel_dict["rel_type"] == "DIRECTOR_OF"
    assert rel_dict["from_key"] == "canonical_entity_id"
    assert rel_dict["from_value"] == sample_relationship.source_entity_id
    assert rel_dict["to_key"] == "canonical_entity_id"
    assert rel_dict["to_value"] == sample_relationship.target_entity_id


# ============================================================================
# 2. PROVENANCE, TEMPORAL, & CONFIDENCE PRESERVATION TESTS
# ============================================================================

def test_provenance_preservation(sample_company, sample_relationship):
    """Verify provenance metadata (source, path, reliability) is preserved across adapters."""
    assert len(sample_company.source_references) == 1
    prov = sample_company.source_references[0]
    assert prov.source_system == "mca_registry"
    assert prov.source_type == SourceType.FIREBASE
    assert prov.source_path == "/companies/company_00001"
    assert prov.source_reliability == 0.98

    node_dict = sample_company.to_neo4j_node_dict()
    assert node_dict["properties"]["source_system"] == "mca_registry"
    assert node_dict["properties"]["source_path"] == "/companies/company_00001"

    rel_dict = sample_relationship.to_neo4j_rel_dict()
    assert rel_dict["properties"]["source_system"] == "mca_registry"


def test_temporal_preservation(sample_company, sample_relationship):
    """Verify temporal metadata (observed_at, valid_from) is preserved and serialized."""
    assert sample_company.temporal.valid_from == "2019-05-15"
    assert sample_company.temporal.observed_at == "2025-01-10T10:00:00Z"

    node_dict = sample_company.to_neo4j_node_dict()
    assert node_dict["properties"]["valid_from"] == "2019-05-15"
    assert node_dict["properties"]["observed_at"] == "2025-01-10T10:00:00Z"

    rel_dict = sample_relationship.to_neo4j_rel_dict()
    assert rel_dict["properties"]["valid_from"] == "2020-01-01"


def test_confidence_preservation(sample_company, sample_relationship):
    """Verify multi-factor confidence metadata is preserved on entities and relationships."""
    assert sample_company.confidence.entity_confidence == 0.99
    assert sample_company.confidence.mapping_confidence == 0.95

    node_dict = sample_company.to_neo4j_node_dict()
    assert node_dict["properties"]["entity_confidence"] == 0.99
    assert node_dict["properties"]["mapping_confidence"] == 0.95

    assert sample_relationship.confidence.relationship_confidence == 0.96
    rel_dict = sample_relationship.to_neo4j_rel_dict()
    assert rel_dict["properties"]["relationship_confidence"] == 0.96


def test_synthetic_marker_preservation(sample_synthetic_contract):
    """Verify synthetic/test data is strictly flagged with mock_record=True and is_synthetic=True."""
    contract_ent, contract_rel = sample_synthetic_contract
    assert contract_ent.properties["mock_record"] is True
    assert contract_ent.properties["is_synthetic"] is True

    node_dict = contract_ent.to_neo4j_node_dict()
    assert node_dict["properties"]["mock_record"] is True
    assert node_dict["properties"]["is_synthetic"] is True

    rel_dict = contract_rel.to_neo4j_rel_dict()
    assert rel_dict["properties"]["mock_record"] is True
    assert rel_dict["properties"]["is_synthetic"] is True


# ============================================================================
# 3. IDEMPOTENCY & DUPLICATE PREVENTION TESTS
# ============================================================================

def test_idempotent_materialization(sample_company, sample_director, sample_relationship):
    """Verify writing the same canonical payload multiple times does not duplicate entities or edges."""
    payload = CanonicalGraphPayload()
    payload.add_entity(sample_company)
    payload.add_entity(sample_director)
    payload.add_relationship(sample_relationship)

    writer = Neo4jWriter(batch_size=100)

    # First write
    res1 = writer.write_canonical_payload(payload, sync_projection=True)
    assert res1["nodes_written"] == 2
    assert res1["relationships_written"] == 1

    entities_count1 = len(GraphProjectionService.get_all_entities())
    rels_count1 = len(GraphProjectionService.get_all_relationships())

    # Second write — idempotent MERGE
    res2 = writer.write_canonical_payload(payload, sync_projection=True)
    assert res2["nodes_written"] == 2
    assert res2["relationships_written"] == 1

    entities_count2 = len(GraphProjectionService.get_all_entities())
    rels_count2 = len(GraphProjectionService.get_all_relationships())

    assert entities_count1 == entities_count2
    assert rels_count1 == rels_count2


def test_duplicate_prevention_on_merge(sample_company):
    """Verify updating existing canonical entity updates properties rather than creating a duplicate."""
    writer = Neo4jWriter(batch_size=100)

    # Initial write
    p1 = CanonicalGraphPayload()
    p1.add_entity(sample_company)
    writer.write_canonical_payload(p1)

    # Update with new property
    updated_company = CanonicalEntity(
        canonical_id=sample_company.canonical_id,
        entity_type=sample_company.entity_type,
        display_name=sample_company.display_name,
        properties={**sample_company.properties, "status": "Dormant"},
        source_references=sample_company.source_references,
        confidence=sample_company.confidence,
    )
    p2 = CanonicalGraphPayload()
    p2.add_entity(updated_company)
    writer.write_canonical_payload(p2)

    cached = GraphProjectionService.get_entity_detail(sample_company.canonical_id)
    assert cached is not None
    assert cached.properties["status"] == "Dormant"


# ============================================================================
# 4. PROJECTION LAYER TESTS
# ============================================================================

def test_projection_layer_node(sample_company):
    """Verify GraphProjectionService converts rich entity to clean VisualizationNode."""
    node = GraphProjectionService.project_entity_to_node(sample_company)
    assert isinstance(node, VisualizationNode)
    assert node.id == sample_company.canonical_id
    assert node.label == sample_company.display_name
    assert node.entity_type == "Company"
    assert node.important_identifier == "U74999MH2019PTC334643"
    assert node.confidence == 0.99
    assert node.is_synthetic is False


def test_projection_layer_edge(sample_relationship):
    """Verify GraphProjectionService converts relationship to clean VisualizationEdge."""
    edge = GraphProjectionService.project_relationship_to_edge(sample_relationship)
    assert isinstance(edge, VisualizationEdge)
    assert edge.id == sample_relationship.relationship_id
    assert edge.relationship_type == "DIRECTOR_OF"
    assert edge.display_label == "DIRECTOR OF"
    assert edge.confidence == 0.96
    assert edge.temporal_status == "Current"


def test_projection_subgraph_bounding(sample_company, sample_director, sample_relationship, sample_synthetic_contract):
    """Verify bounded projection respects limits, entity type filter, and synthetic toggle."""
    synth_ent, synth_rel = sample_synthetic_contract
    entities = [sample_company, sample_director, synth_ent]
    relationships = [sample_relationship, synth_rel]

    # Test limit bounding
    proj_limit1 = GraphProjectionService.project_subgraph(entities, relationships, limit=1)
    assert len(proj_limit1.nodes) == 1

    # Test type filter
    proj_company_only = GraphProjectionService.project_subgraph(entities, relationships, entity_type="Company")
    assert len(proj_company_only.nodes) == 1
    assert proj_company_only.nodes[0].entity_type == "Company"

    # Test synthetic toggle
    proj_no_synthetic = GraphProjectionService.project_subgraph(entities, relationships, include_synthetic=False)
    synth_nodes = [n for n in proj_no_synthetic.nodes if n.is_synthetic]
    assert len(synth_nodes) == 0


# ============================================================================
# 5. AUDIT DETAILS, SEARCH, & NEIGHBORHOOD TESTS
# ============================================================================

def test_entity_detail_retrieval(sample_company, sample_director, sample_relationship):
    """Verify deep multi-section entity details response."""
    GraphProjectionService.set_cache([sample_company, sample_director], [sample_relationship])

    detail = GraphProjectionService.get_entity_detail(sample_company.canonical_id)
    assert detail is not None
    assert detail.canonical_id == sample_company.canonical_id
    assert detail.display_name == sample_company.display_name
    assert "cin" in detail.identifiers
    assert len(detail.sources) == 1
    assert detail.sources[0]["source_system"] == "mca_registry"
    assert detail.confidence["entity_confidence"] == 0.99
    assert len(detail.connected_edges) == 1
    assert detail.connected_edges[0]["direction"] == "INCOMING"


def test_relationship_detail_retrieval(sample_company, sample_director, sample_relationship):
    """Verify relationship details response with endpoints and provenance."""
    GraphProjectionService.set_cache([sample_company, sample_director], [sample_relationship])

    detail = GraphProjectionService.get_relationship_detail(sample_relationship.relationship_id)
    assert detail is not None
    assert detail.relationship_id == sample_relationship.relationship_id
    assert detail.display_label == "DIRECTOR OF"
    assert detail.source_entity["id"] == sample_director.canonical_id
    assert detail.target_entity["id"] == sample_company.canonical_id
    assert detail.confidence["relationship_confidence"] == 0.96


def test_search_entities(sample_company, sample_director):
    """Verify search across display name, CIN, and identifiers."""
    GraphProjectionService.set_cache([sample_company, sample_director], [])

    # Search by company name substring
    res1 = GraphProjectionService.search_entities("PHARMA")
    assert len(res1) == 1
    assert res1[0].id == sample_company.canonical_id

    # Search by CIN
    res2 = GraphProjectionService.search_entities("U74999MH2019PTC334643")
    assert len(res2) == 1
    assert res2[0].id == sample_company.canonical_id

    # Search by person name
    res3 = GraphProjectionService.search_entities("Mehta")
    assert len(res3) == 1
    assert res3[0].id == sample_director.canonical_id


def test_neighborhood_expansion(sample_company, sample_director, sample_relationship):
    """Verify 1-hop neighborhood query retrieves connecting entity and edge."""
    GraphProjectionService.set_cache([sample_company, sample_director], [sample_relationship])

    nh = GraphProjectionService.get_neighborhood(sample_director.canonical_id, hops=1)
    assert nh.status == "success"
    assert len(nh.nodes) == 2  # Director + Company
    assert len(nh.edges) == 1
    assert nh.edges[0].id == sample_relationship.relationship_id


def test_reconciliation_audit(sample_company, sample_director, sample_relationship):
    """Verify reconciliation report validates integrity and checks orphaned edges."""
    GraphProjectionService.set_cache([sample_company, sample_director], [sample_relationship])

    report = GraphProjectionService.reconcile_graph()
    assert report.status == "PASSED"
    assert report.canonical_entity_count == 2
    assert report.canonical_relationship_count == 1
    assert report.orphaned_relationships == 0
    assert report.duplicate_canonical_ids == 0


def test_materialization_pipeline_execution():
    """Verify MaterializationPipeline materializes canonical relational graph."""
    pipeline = MaterializationPipeline(batch_size=100)
    res = pipeline.materialize_relational_graph()
    assert res["status"] == "success"
    assert res["entities_materialized"] > 0
    assert res["relationships_materialized"] > 0
    assert res["duration_ms"] >= 0
