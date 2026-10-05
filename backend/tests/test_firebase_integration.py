"""
Firebase Realtime Database Integration Test Suite
Validates REAL end-to-end connectivity with the ReasonChain Firebase RTDB instance.
"""

import os
import sys
import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.main import app
from app.db.firebase import FirebaseConnection
from app.core.config import settings

client = TestClient(app)


def test_real_firebase_connection_direct():
    """Verify direct connection to the live Firebase Realtime Database."""
    result = FirebaseConnection.test_connection()
    assert result["success"] is True, f"Direct Firebase connection failed: {result.get('message')}"
    assert "companies" in result["collections"]
    assert result["total_collections"] >= 1


def test_real_firebase_status_endpoint():
    """Verify GET /api/firebase/status with real server-side configuration."""
    response = client.get("/api/firebase/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["is_configured"] is True
    assert data["service_account_found"] is True
    assert data["project_id"] == "reason-chain"
    assert "firebaseio.com" in data["database_url"]


def test_real_firebase_test_server_connection_endpoint():
    """Verify POST /api/firebase/test-server-connection with real credentials."""
    response = client.post("/api/firebase/test-server-connection")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "companies" in data["collections"]


def test_real_firebase_paths_endpoint():
    """Verify GET /api/firebase/paths discovers real collections and counts."""
    response = client.get("/api/firebase/paths")
    assert response.status_code == 200
    data = response.json()
    assert data["total_paths"] >= 1
    assert data["total_records"] > 0
    path_names = [p["name"] for p in data["paths"]]
    assert "companies" in path_names


def test_real_firebase_sample_companies_endpoint():
    """Verify GET /api/firebase/sample/companies fetches real sample records."""
    response = client.get("/api/firebase/sample/companies?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert data["path"] == "/companies"
    assert data["sample_count"] == 5
    assert len(data["sample_records"]) == 5
    # Verify expected company fields in schema
    fields = data["fields"]
    assert "cin" in fields
    assert "company_name" in fields
    assert "company_status" in fields

    # Inspect first record
    first = data["sample_records"][0]
    assert "_key" in first
    assert "company_name" in first
    assert len(first["company_name"]) > 0
