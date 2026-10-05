"""
Firebase Entity Mapper — Unit Tests
Tests the Firebase-to-Canonical mapping pipeline with mocked Firebase data.
"""

import pytest
from unittest.mock import patch, MagicMock
from app.ingestion.firebase_mapper import (
    _generate_firebase_canonical_id,
    _generate_director_canonical_id,
    map_firebase_company_to_canonical,
    map_firebase_director_to_canonical,
    map_firebase_state_to_canonical,
    map_firebase_company_director_relationships,
    map_firebase_company_state_relationships,
    map_firebase_company_country_relationships,
    build_firebase_canonical_payload,
)
from app.domain.entities import EntityCategory
from app.domain.relationships import CanonicalRelationshipType
from app.domain.provenance import SourceType


# =============================================================================
# SAMPLE TEST DATA (mirrors real Firebase /companies structure)
# =============================================================================

SAMPLE_COMPANY_RECORD = {
    "cin": "U74999KA2020PTC123456",
    "company_name": "TechCorp Solutions Private Limited",
    "company_status": "Active",
    "company_category": "Company limited by Shares",
    "company_class": "Private",
    "registration_date": "2020-03-15",
    "state": "Karnataka",
    "country": "India",
    "registration_number": "123456",
    "authorized_capital": "1000000",
    "paid_up_capital": "500000",
}

SAMPLE_COMPANY_WITH_DIRECTORS = {
    **SAMPLE_COMPANY_RECORD,
    "directors": [
        {
            "din": "07891234",
            "name": "Ravi Kumar",
            "designation": "Director",
        },
        {
            "din": "07891235",
            "name": "Priya Sharma",
            "designation": "Managing Director",
        },
    ],
}

SAMPLE_COMPANY_MINIMAL = {
    "company_name": "MinimalCo",
}

SAMPLE_COMPANY_NO_LOCATION = {
    "cin": "L99999MH2015PLC000001",
    "company_name": "NoLocationCo",
    "company_status": "Active",
}


# =============================================================================
# TEST: CANONICAL ID GENERATION
# =============================================================================

class TestCanonicalIdGeneration:
    def test_firebase_canonical_id_with_identifier(self):
        cid = _generate_firebase_canonical_id("companies", "push_key_1", "U74999KA2020PTC123456")
        assert cid == "firebase:companies:U74999KA2020PTC123456"

    def test_firebase_canonical_id_without_identifier(self):
        cid = _generate_firebase_canonical_id("companies", "push_key_1")
        assert cid == "firebase:companies:push_key_1"

    def test_director_canonical_id_with_din(self):
        director = {"din": "07891234", "name": "Ravi Kumar"}
        cid = _generate_director_canonical_id(director, "company_1", 0)
        assert cid == "firebase:directors:07891234"

    def test_director_canonical_id_without_din(self):
        director = {"name": "Ravi Kumar"}
        cid = _generate_director_canonical_id(director, "company_1", 0)
        assert cid.startswith("firebase:directors:")
        assert len(cid) > len("firebase:directors:")

    def test_director_canonical_id_deterministic(self):
        """Same director data should produce the same canonical ID."""
        director = {"name": "Ravi Kumar"}
        cid1 = _generate_director_canonical_id(director, "company_1", 0)
        cid2 = _generate_director_canonical_id(director, "company_1", 0)
        assert cid1 == cid2

    def test_entity_ids_are_prefixed_with_firebase(self):
        """All Firebase entity IDs must be prefixed with 'firebase:'."""
        cid = _generate_firebase_canonical_id("companies", "key1", "CIN001")
        assert cid.startswith("firebase:")


# =============================================================================
# TEST: COMPANY ENTITY MAPPING
# =============================================================================

class TestCompanyEntityMapping:
    def test_single_company_maps_to_canonical_entity(self):
        entity = map_firebase_company_to_canonical("key1", SAMPLE_COMPANY_RECORD)
        assert entity.entity_type == EntityCategory.COMPANY
        assert entity.display_name == "TechCorp Solutions Private Limited"
        assert entity.canonical_id == "firebase:companies:U74999KA2020PTC123456"

    def test_company_properties_contain_flat_fields(self):
        entity = map_firebase_company_to_canonical("key1", SAMPLE_COMPANY_RECORD)
        assert entity.properties["cin"] == "U74999KA2020PTC123456"
        assert entity.properties["company_status"] == "Active"
        assert entity.properties["state"] == "Karnataka"
        assert entity.properties["_firebase_key"] == "key1"

    def test_company_with_registration_date_produces_temporal_metadata(self):
        entity = map_firebase_company_to_canonical("key1", SAMPLE_COMPANY_RECORD)
        assert entity.temporal is not None
        assert entity.temporal.valid_from == "2020-03-15"

    def test_company_without_registration_date_has_no_temporal(self):
        entity = map_firebase_company_to_canonical("key1", SAMPLE_COMPANY_MINIMAL)
        assert entity.temporal is None

    def test_provenance_has_firebase_source_type(self):
        entity = map_firebase_company_to_canonical("key1", SAMPLE_COMPANY_RECORD)
        assert len(entity.source_references) == 1
        prov = entity.source_references[0]
        assert prov.source_type == SourceType.FIREBASE
        assert prov.source_system == "firebase"
        assert prov.source_path == "/companies/key1"
        assert prov.source_record_id == "key1"

    def test_confidence_metadata_reflects_mapping_confidence(self):
        entity = map_firebase_company_to_canonical("key1", SAMPLE_COMPANY_RECORD)
        assert entity.confidence.mapping_confidence == 0.95
        assert entity.confidence.source_reliability == 0.90

    def test_empty_record_produces_entity_with_minimal_properties(self):
        entity = map_firebase_company_to_canonical("key1", {})
        assert entity.canonical_id == "firebase:companies:key1"
        assert entity.display_name == "key1"
        assert entity.properties["_firebase_key"] == "key1"

    def test_nested_objects_excluded_from_properties(self):
        """Nested dicts and lists should not be in flat properties."""
        entity = map_firebase_company_to_canonical("key1", SAMPLE_COMPANY_WITH_DIRECTORS)
        assert "directors" not in entity.properties


# =============================================================================
# TEST: DIRECTOR ENTITY MAPPING
# =============================================================================

class TestDirectorEntityMapping:
    def test_director_maps_to_person_entity(self):
        director = {"din": "07891234", "name": "Ravi Kumar", "designation": "Director"}
        entity = map_firebase_director_to_canonical("company_1", director, 0)
        assert entity.entity_type == EntityCategory.PERSON
        assert entity.display_name == "Ravi Kumar"
        assert entity.canonical_id == "firebase:directors:07891234"

    def test_director_provenance_points_to_nested_path(self):
        director = {"din": "07891234", "name": "Ravi Kumar"}
        entity = map_firebase_director_to_canonical("company_1", director, 2)
        prov = entity.source_references[0]
        assert prov.source_path == "/companies/company_1/directors[2]"
        assert prov.source_field == "directors"

    def test_director_has_lower_confidence(self):
        director = {"din": "07891234", "name": "Ravi Kumar"}
        entity = map_firebase_director_to_canonical("company_1", director, 0)
        assert entity.confidence.mapping_confidence == 0.85


# =============================================================================
# TEST: RELATIONSHIP MAPPING
# =============================================================================

class TestRelationshipMapping:
    def test_company_with_directors_produces_relationships(self):
        directors = [
            {"din": "07891234", "name": "Ravi Kumar", "designation": "Director"},
            {"din": "07891235", "name": "Priya Sharma", "designation": "MD"},
        ]
        entities, rels = map_firebase_company_director_relationships(
            "firebase:companies:CIN001", "company_1", directors
        )
        # 2 directors => 2 entities, 4 relationships (HAS_DIRECTOR + DIRECTOR_OF each)
        assert len(entities) == 2
        assert len(rels) == 4

        # Check relationship types
        has_director_rels = [r for r in rels if r.relationship_type == CanonicalRelationshipType.HAS_DIRECTOR]
        director_of_rels = [r for r in rels if r.relationship_type == CanonicalRelationshipType.DIRECTOR_OF]
        assert len(has_director_rels) == 2
        assert len(director_of_rels) == 2

    def test_company_with_state_produces_registered_in_state(self):
        entity = map_firebase_company_to_canonical("key1", SAMPLE_COMPANY_RECORD)
        state_entities, state_rels = map_firebase_company_state_relationships([entity])
        assert len(state_entities) == 1
        assert state_entities[0].display_name == "Karnataka"
        assert len(state_rels) == 1
        assert state_rels[0].relationship_type == CanonicalRelationshipType.REGISTERED_IN_STATE

    def test_company_with_country_produces_located_in(self):
        entity = map_firebase_company_to_canonical("key1", SAMPLE_COMPANY_RECORD)
        country_entities, country_rels = map_firebase_company_country_relationships([entity])
        assert len(country_entities) == 1
        assert country_entities[0].display_name == "India"
        assert len(country_rels) == 1
        assert country_rels[0].relationship_type == CanonicalRelationshipType.LOCATED_IN

    def test_company_without_location_produces_no_relationships(self):
        entity = map_firebase_company_to_canonical("key1", SAMPLE_COMPANY_NO_LOCATION)
        _, state_rels = map_firebase_company_state_relationships([entity])
        _, country_rels = map_firebase_company_country_relationships([entity])
        assert len(state_rels) == 0
        assert len(country_rels) == 0

    def test_duplicate_states_are_deduplicated(self):
        """Two companies in the same state should produce only one state entity."""
        e1 = map_firebase_company_to_canonical("k1", {**SAMPLE_COMPANY_RECORD, "cin": "CIN1"})
        e2 = map_firebase_company_to_canonical("k2", {**SAMPLE_COMPANY_RECORD, "cin": "CIN2"})
        state_entities, state_rels = map_firebase_company_state_relationships([e1, e2])
        assert len(state_entities) == 1  # Deduplicated
        assert len(state_rels) == 2  # One per company


# =============================================================================
# TEST: BUILD CANONICAL GRAPH PAYLOAD (Mocked Firebase)
# =============================================================================

class TestBuildCanonicalPayload:
    @patch("app.ingestion.firebase_mapper.FirebaseConnection")
    def test_build_payload_assembles_complete_graph(self, mock_conn):
        """Integration test: full pipeline from mocked Firebase data to CanonicalGraphPayload."""
        mock_conn.get_sample_records.return_value = {
            "path": "/companies",
            "sample_count": 2,
            "fields": list(SAMPLE_COMPANY_RECORD.keys()),
            "sample_records": [
                {"_key": "k1", **SAMPLE_COMPANY_RECORD},
                {"_key": "k2", "cin": "L99999MH2015PLC000002", "company_name": "AnotherCorp",
                 "state": "Maharashtra", "country": "India"},
            ],
        }

        payload = build_firebase_canonical_payload(path="/companies", limit=10)

        # Should have company entities + state entities + country entities
        assert len(payload.entities) > 0
        assert payload.metadata.get("source") == "firebase"
        assert payload.metadata.get("records_processed") == 2

        # Verify entity types
        company_entities = [e for e in payload.entities if str(e.entity_type) == "Company"]
        assert len(company_entities) == 2

    @patch("app.ingestion.firebase_mapper.FirebaseConnection")
    def test_payload_can_serialize_to_api_response(self, mock_conn):
        """CanonicalGraphPayload should serialize correctly for the React Flow frontend."""
        mock_conn.get_sample_records.return_value = {
            "path": "/companies",
            "sample_count": 1,
            "fields": list(SAMPLE_COMPANY_RECORD.keys()),
            "sample_records": [{"_key": "k1", **SAMPLE_COMPANY_RECORD}],
        }

        payload = build_firebase_canonical_payload(path="/companies", limit=1)
        api_response = payload.to_api_response(source="firebase")

        assert api_response["status"] == "success"
        assert api_response["source"] == "firebase"
        assert api_response["total_nodes"] > 0
        assert isinstance(api_response["nodes"], list)
        assert isinstance(api_response["edges"], list)

    @patch("app.ingestion.firebase_mapper.FirebaseConnection")
    def test_payload_can_serialize_to_neo4j_format(self, mock_conn):
        """CanonicalGraphPayload should serialize correctly for Neo4j writer."""
        mock_conn.get_sample_records.return_value = {
            "path": "/companies",
            "sample_count": 1,
            "fields": list(SAMPLE_COMPANY_RECORD.keys()),
            "sample_records": [{"_key": "k1", **SAMPLE_COMPANY_RECORD}],
        }

        payload = build_firebase_canonical_payload(path="/companies", limit=1)
        neo4j_payload = payload.to_neo4j_payload()

        assert "nodes" in neo4j_payload
        assert "relationships" in neo4j_payload
        assert len(neo4j_payload["nodes"]) > 0
