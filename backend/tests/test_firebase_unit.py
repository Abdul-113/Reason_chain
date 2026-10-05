"""
Firebase Connector Unit Test Suite
Tests Pydantic schemas, path resolution logic, mock connection behavior, and route handlers.
"""

import os
import sys
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.main import app
from app.db.firebase import FirebaseConnection
from app.models.schemas import (
    FirebaseConfigRequest,
    FirebaseConnectionResponse,
    FirebasePathInfo,
    FirebasePathsResponse,
    FirebaseSampleResponse,
    FirebaseStatusResponse,
)

client = TestClient(app)


def test_firebase_config_schema():
    """Verify FirebaseConfigRequest default and custom values."""
    req_default = FirebaseConfigRequest()
    assert req_default.database_url is None
    assert req_default.service_account_path is None

    req_custom = FirebaseConfigRequest(
        database_url="https://custom-project-default-rtdb.firebaseio.com",
        service_account_path="/path/to/creds.json"
    )
    assert req_custom.database_url == "https://custom-project-default-rtdb.firebaseio.com"
    assert req_custom.service_account_path == "/path/to/creds.json"


def test_firebase_connection_response_schema():
    """Verify FirebaseConnectionResponse structure."""
    resp = FirebaseConnectionResponse(
        success=True,
        message="Connected",
        database_url="https://reason-chain-default-rtdb.firebaseio.com",
        collections=["companies", "users"],
        total_collections=2
    )
    assert resp.success is True
    assert len(resp.collections) == 2
    assert resp.total_collections == 2


def test_firebase_path_info_schema():
    """Verify FirebasePathInfo and PathsResponse serialization."""
    info = FirebasePathInfo(path="/companies", name="companies", record_count=100)
    assert info.record_count == 100

    paths_resp = FirebasePathsResponse(
        paths=[info],
        total_paths=1,
        total_records=100
    )
    assert paths_resp.total_paths == 1
    assert paths_resp.total_records == 100


def test_firebase_sample_response_schema():
    """Verify FirebaseSampleResponse fields and records."""
    sample = FirebaseSampleResponse(
        path="/companies",
        sample_count=2,
        fields=["cin", "company_name"],
        sample_records=[
            {"_key": "c1", "cin": "U12345", "company_name": "Test Alpha"},
            {"_key": "c2", "cin": "U67890", "company_name": "Test Beta"},
        ]
    )
    assert sample.sample_count == 2
    assert "cin" in sample.fields
    assert len(sample.sample_records) == 2


def test_firebase_status_response_schema():
    """Verify FirebaseStatusResponse structure."""
    status = FirebaseStatusResponse(
        status="ready",
        is_configured=True,
        database_url="https://reason-chain-default-rtdb.firebaseio.com",
        project_id="reason-chain",
        service_account_found=True
    )
    assert status.status == "ready"
    assert status.is_configured is True
    assert status.project_id == "reason-chain"


def test_service_account_path_resolution_nonexistent():
    """Verify resolution returns None for a non-existent path."""
    resolved = FirebaseConnection._resolve_service_account_path("/non/existent/path/creds.json")
    assert resolved is None


def test_service_account_path_resolution_existing():
    """Verify resolution finds the local service account file."""
    backend_sa = os.path.join(BACKEND_DIR, "firebase-service-account.json")
    if os.path.exists(backend_sa):
        resolved = FirebaseConnection._resolve_service_account_path(backend_sa)
        assert resolved is not None
        assert os.path.exists(resolved)


@patch("app.db.firebase.FirebaseConnection.test_connection")
def test_test_server_connection_route_mocked(mock_test):
    """Test POST /api/firebase/test-server-connection route with mock."""
    mock_test.return_value = {
        "success": True,
        "message": "Connected successfully to Firebase RTDB.",
        "database_url": "https://reason-chain-default-rtdb.firebaseio.com",
        "collections": ["companies"],
        "total_collections": 1
    }

    response = client.post("/api/firebase/test-server-connection")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "companies" in data["collections"]


@patch("app.db.firebase.FirebaseConnection.list_paths")
def test_get_firebase_paths_route_mocked(mock_list):
    """Test GET /api/firebase/paths route with mock."""
    mock_list.return_value = [
        {"path": "/companies", "name": "companies", "record_count": 500}
    ]

    response = client.get("/api/firebase/paths")
    assert response.status_code == 200
    data = response.json()
    assert data["total_paths"] == 1
    assert data["total_records"] == 500
    assert data["paths"][0]["name"] == "companies"


@patch("app.db.firebase.FirebaseConnection.get_sample_records")
def test_get_firebase_sample_route_mocked(mock_sample):
    """Test GET /api/firebase/sample/companies route with mock."""
    mock_sample.return_value = {
        "path": "/companies",
        "sample_count": 1,
        "fields": ["cin", "company_name"],
        "sample_records": [{"_key": "c1", "cin": "U12345", "company_name": "Acme"}]
    }

    response = client.get("/api/firebase/sample/companies?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert data["sample_count"] == 1
    assert data["fields"] == ["cin", "company_name"]
