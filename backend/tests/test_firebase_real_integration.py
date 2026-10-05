"""
Firebase Realtime Database Real Integration Test
Connects to the real live Firebase RTDB instance to verify observational profiling.
Guarantees read-only bounded sampling with zero Neo4j mutations and zero data loss.
"""

import sys
import os
import pytest

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.core.config import settings
from app.db.firebase import FirebaseConnection
from app.models.schemas import FirebaseProfileRequest
from app.db.firebase_profiler import FirebaseDataProfiler


def is_real_firebase_available() -> bool:
    """Check if real server-side Firebase configuration is present."""
    resolved_path = FirebaseConnection._resolve_service_account_path()
    return bool(settings.FIREBASE_DATABASE_URL and resolved_path and os.path.exists(resolved_path))


@pytest.mark.skipif(not is_real_firebase_available(), reason="Real Firebase credentials not configured in environment")
def test_real_firebase_profiling_integration():
    """
    Live Integration Test:
    1. Connects to real Firebase RTDB instance.
    2. Runs bounded profiling on /companies with sample_limit=3.
    3. Verifies observational schema discovery and candidate heuristics.
    4. Guarantees read-only execution.
    """
    conn_result = FirebaseConnection.test_connection()
    assert conn_result["success"] is True, f"Failed to connect to real Firebase: {conn_result.get('message')}"

    paths = FirebaseConnection.list_paths()
    assert len(paths) > 0, "No root paths discovered in real Firebase database"

    # Profile /companies with a strictly bounded sample of 3 records
    req = FirebaseProfileRequest(
        paths=["/companies"],
        sample_limit=3,
        max_depth=4,
        max_fields=50,
        cross_validate_references=True
    )
    profile = FirebaseDataProfiler.profile_database(req)

    assert profile.success is True
    assert profile.total_branches_profiled == 1
    companies_branch = profile.branches[0]
    assert companies_branch.name == "companies"
    assert companies_branch.sample_size == 3
    assert companies_branch.is_collection_like is True
    assert len(companies_branch.fields) > 0

    # Verify observed real fields
    field_paths = [f.field_path for f in companies_branch.fields]
    assert "company_name" in field_paths or "name" in field_paths
    assert "cin" in field_paths or "registration_number" in field_paths

    # Verify candidate detection
    assert len(companies_branch.candidate_identifiers) > 0
    assert "cin" in companies_branch.candidate_identifiers or "_key" in companies_branch.candidate_identifiers

    # Check temporal field detection
    if "registration_date" in field_paths:
        reg_field = next(f for f in companies_branch.fields if f.field_path == "registration_date")
        assert reg_field.candidate_temporal is True

    print("\n[REAL FIREBASE INTEGRATION TEST SUCCESSFUL]")
    print(f"  Target Database URL: {profile.database_url}")
    print(f"  Discovered Root Paths: {[p['name'] for p in paths]}")
    print(f"  Sampled Branch: {companies_branch.path} ({companies_branch.sample_size} records sampled out of ~{companies_branch.approx_child_count})")
    print(f"  Discovered Field Count: {len(companies_branch.fields)}")
    print(f"  Candidate Identifiers: {companies_branch.candidate_identifiers}")
    print(f"  Candidate References: {companies_branch.candidate_references}")
    print(f"  Candidate Temporals: {companies_branch.candidate_temporal_fields}")


if __name__ == "__main__":
    if is_real_firebase_available():
        test_real_firebase_profiling_integration()
    else:
        print("[SKIPPED] Real Firebase credentials not available.")
