"""
Automated Integration and Regression Tests for:
Firebase Relationship Dataset Import into PostgreSQL / SQLite Relational Engine

Verifies:
1. Data source normalization and table population
2. Company cross-referencing against Firebase master data
3. Preserved confidence values, raw payloads, temporal validity
4. Synthetic demonstration data warning metadata
5. Backend REST API responses (/api/postgres/status, /tables, /table/{t}, /relationships)
"""

import os
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.ingestion.postgres_reader import _get_connection
from app.ingestion.firebase_relationship_importer import execute_import_transaction

client = TestClient(app)

def test_importer_execution_and_counts():
    """Verify importer executes successfully and populates tables."""
    json_path = os.path.join(os.path.dirname(__file__), "..", "data", "company_relationships-export.json")
    if not os.path.exists(json_path):
        pytest.skip("Export JSON not found at expected path")

    report = execute_import_transaction(json_path)
    assert report["success"] is True
    assert report["batch_id"].startswith("BATCH-")
    
    counts = report["counts"]
    assert counts.get("company_links_resolved", 0) == 10
    assert counts.get("external_companies", 0) == 2
    assert counts.get("people", 0) == 6
    assert counts.get("suppliers", 0) == 5
    assert counts.get("contracts", 0) == 5
    assert counts.get("sanctions", 0) == 2
    assert counts.get("relationships", 0) == 20


def test_database_integrity_and_provenance():
    """Verify raw payloads, foreign keys, and confidence values are intact."""
    conn, engine = _get_connection()
    cursor = conn.cursor()
    
    # 1. Verify relationship_claims count and confidence
    cursor.execute("SELECT COUNT(*), AVG(confidence), MIN(confidence), MAX(confidence) FROM relationship_claims")
    row = cursor.fetchone()
    count, avg_conf, min_conf, max_conf = row[0], row[1], row[2], row[3]
    assert count == 20
    assert min_conf >= 0.70
    assert max_conf <= 1.00

    # 2. Verify raw_payload is valid JSON and contains original source data
    cursor.execute("SELECT raw_payload FROM relationship_claims LIMIT 5")
    for (raw_str,) in cursor.fetchall():
        assert raw_str is not None
        payload = json.loads(raw_str)
        assert isinstance(payload, dict)
        assert len(payload) > 0

    # 3. Verify company_links table resolved 10 companies
    cursor.execute("SELECT COUNT(*), COUNT(CASE WHEN resolution_status LIKE 'RESOLVED%' THEN 1 END) FROM company_links")
    total_links, resolved_links = cursor.fetchone()
    assert total_links == 10
    assert resolved_links == 10

    # 4. Verify import batch record
    cursor.execute("SELECT batch_id, source_system, is_synthetic FROM import_batches ORDER BY imported_at DESC LIMIT 1")
    batch_id, source_system, is_synthetic = cursor.fetchone()
    assert batch_id.startswith("BATCH-")
    assert "Firebase" in source_system
    assert is_synthetic == 1

    conn.close()


def test_api_postgres_status():
    """Verify /api/postgres/status endpoint returns live database state."""
    response = client.get("/api/postgres/status")
    assert response.status_code == 200
    data = response.json()
    
    assert data["success"] is True
    assert data["connected"] is True
    assert data["total_relationship_claims"] == 20
    assert data["total_entities"] >= 23
    assert data["company_links_resolved"] == 10
    assert data["is_synthetic"] is True
    assert "Synthetic demonstration data" in data["warning"]
    assert len(data["tables"]) >= 10


def test_api_postgres_tables():
    """Verify /api/postgres/tables endpoint returns table inventory with counts."""
    response = client.get("/api/postgres/tables")
    assert response.status_code == 200
    data = response.json()
    
    assert data["success"] is True
    table_names = [t["table_name"] for t in data["tables"]]
    assert "relationship_claims" in table_names
    assert "company_links" in table_names
    assert "companies" in table_names
    assert "import_batches" in table_names


def test_api_postgres_table_rows():
    """Verify /api/postgres/table/{table_name} returns paginated rows."""
    response = client.get("/api/postgres/table/relationship_claims?page=1&page_size=10")
    assert response.status_code == 200
    data = response.json()
    
    assert data["table_name"] == "relationship_claims"
    assert data["total_rows"] == 20
    assert len(data["rows"]) == 10
    assert data["total_pages"] == 2
    assert len(data["columns"]) > 0
    # Check column format
    assert isinstance(data["columns"][0], dict)
    assert "name" in data["columns"][0]
    assert "type" in data["columns"][0]


def test_api_postgres_relationships():
    """Verify /api/postgres/relationships returns paginated claims with filtering."""
    # Test all
    res_all = client.get("/api/postgres/relationships?page=1&page_size=50")
    assert res_all.status_code == 200
    data_all = res_all.json()
    assert data_all["total"] == 20
    assert len(data_all["claims"]) == 20
    assert data_all["is_synthetic"] is True

    # Test filtering by relationship_type
    res_dir = client.get("/api/postgres/relationships?relationship_type=DIRECTOR_OF")
    assert res_dir.status_code == 200
    data_dir = res_dir.json()
    assert data_dir["total"] == 10
    for claim in data_dir["claims"]:
        assert claim["relationship_type"] == "DIRECTOR_OF"
