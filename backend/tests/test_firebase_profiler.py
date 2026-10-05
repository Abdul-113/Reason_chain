"""
Firebase Realtime Database Data Profiler Unit Tests
Validates all 20 observational profiling scenarios, heuristics, and safety boundaries.
"""

import sys
import os
from unittest.mock import MagicMock, patch

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.models.schemas import (
    FirebaseProfileRequest,
    FirebaseFieldProfile,
    FirebaseReferenceCandidate,
    FirebaseBranchProfile,
    FirebaseDataProfileResponse,
)
from app.db.firebase_profiler import FirebaseDataProfiler


def test_1_empty_database():
    """1. Profiler handles empty database gracefully."""
    with patch("app.db.firebase_profiler.FirebaseConnection.get_app"), \
         patch("app.db.firebase_profiler.FirebaseConnection.list_paths", return_value=[]):
        req = FirebaseProfileRequest(paths=[])
        profile = FirebaseDataProfiler.profile_database(req)
        assert profile.success is True
        assert profile.total_branches_profiled == 0
        assert len(profile.branches) == 0


def test_2_single_path_profiling():
    """2. Profiler correctly profiles a single collection-like path."""
    mock_sample = {
        "-N001": {"name": "Alpha Corp", "cin": "U12345DL2020PTC123456", "country": "India"},
        "-N002": {"name": "Beta Ltd", "cin": "U98765MH2019PLC987654", "country": "India"},
    }
    mock_ref = MagicMock()
    mock_ref.order_by_key().limit_to_first().get.return_value = mock_sample

    with patch("app.db.firebase_profiler.FirebaseConnection.get_app"), \
         patch("app.db.firebase_profiler.FirebaseConnection.list_paths", return_value=[{"name": "companies", "path": "/companies", "record_count": 2}]), \
         patch("app.db.firebase_profiler.FirebaseConnection.get_reference", return_value=mock_ref):
        req = FirebaseProfileRequest(paths=["/companies"], sample_limit=5)
        profile = FirebaseDataProfiler.profile_database(req)
        assert profile.success is True
        assert len(profile.branches) == 1
        b = profile.branches[0]
        assert b.name == "companies"
        assert b.sample_size == 2
        assert b.is_collection_like is True


def test_3_multiple_paths_profiling():
    """3. Profiler profiles multiple selected branches independently."""
    sample_companies = {"c1": {"cin": "C01", "name": "Co 1"}}
    sample_suppliers = {"s1": {"supplier_id": "S01", "company_id": "C01"}}

    def mock_get_ref(path):
        m = MagicMock()
        if "companies" in path:
            m.order_by_key().limit_to_first().get.return_value = sample_companies
        else:
            m.order_by_key().limit_to_first().get.return_value = sample_suppliers
        return m

    with patch("app.db.firebase_profiler.FirebaseConnection.get_app"), \
         patch("app.db.firebase_profiler.FirebaseConnection.list_paths", return_value=[
             {"name": "companies", "path": "/companies", "record_count": 1},
             {"name": "suppliers", "path": "/suppliers", "record_count": 1}
         ]), \
         patch("app.db.firebase_profiler.FirebaseConnection.get_reference", side_effect=mock_get_ref):
        req = FirebaseProfileRequest(paths=["/companies", "/suppliers"], sample_limit=5)
        profile = FirebaseDataProfiler.profile_database(req)
        assert profile.total_branches_profiled == 2
        names = [b.name for b in profile.branches]
        assert "companies" in names
        assert "suppliers" in names


def test_4_mixed_field_types():
    """4. Profiler detects multiple observed types across records for the same field."""
    records = [
        {"_key": "1", "status_code": 200},
        {"_key": "2", "status_code": "ACTIVE"},
        {"_key": "3", "status_code": None},
    ]
    fields, _, _ = FirebaseDataProfiler._profile_records_fields(records, "/test", max_depth=4, max_fields=10)
    status_field = next(f for f in fields if f.field_path == "status_code")
    assert "number" in status_field.observed_types
    assert "string" in status_field.observed_types
    assert "null" in status_field.observed_types


def test_5_nested_objects():
    """5. Deeply nested objects are flattened to dot-notation paths."""
    records = [
        {
            "_key": "1",
            "address": {
                "city": "Mumbai",
                "geo": {
                    "lat": 19.076,
                    "lng": 72.877
                }
            }
        }
    ]
    fields, has_nested, _ = FirebaseDataProfiler._profile_records_fields(records, "/test", max_depth=4, max_fields=10)
    assert has_nested is True
    paths = [f.field_path for f in fields]
    assert "address.city" in paths
    assert "address.geo.lat" in paths
    assert "address.geo.lng" in paths


def test_6_arrays_profiling():
    """6. Arrays of primitives and arrays of objects are correctly profiled."""
    records = [
        {
            "_key": "1",
            "tags": ["retail", "technology"],
            "directors": [
                {"person_id": "P01", "role": "Managing Director"}
            ]
        }
    ]
    fields, _, has_arrays = FirebaseDataProfiler._profile_records_fields(records, "/test", max_depth=4, max_fields=10)
    assert has_arrays is True
    paths = [f.field_path for f in fields]
    assert "tags[]" in paths
    assert "directors[].person_id" in paths


def test_7_null_values_accounting():
    """7. Explicit null values are counted accurately in null_count."""
    records = [
        {"_key": "1", "score": 10},
        {"_key": "2", "score": None},
        {"_key": "3", "score": None},
    ]
    fields, _, _ = FirebaseDataProfiler._profile_records_fields(records, "/test", max_depth=4, max_fields=10)
    score_f = next(f for f in fields if f.field_path == "score")
    assert score_f.null_count == 2
    assert score_f.presence_count == 1
    assert score_f.total_sampled == 3


def test_8_missing_values_calculation():
    """8. Omitted fields across heterogeneous records are counted in missing_count."""
    records = [
        {"_key": "1", "optional_field": "Present"},
        {"_key": "2"},
        {"_key": "3"},
    ]
    fields, _, _ = FirebaseDataProfiler._profile_records_fields(records, "/test", max_depth=4, max_fields=10)
    opt_f = next(f for f in fields if f.field_path == "optional_field")
    assert opt_f.missing_count == 2
    assert opt_f.presence_count == 1
    assert opt_f.presence_ratio == 0.333


def test_9_candidate_identifier_detection():
    """9. Candidate identifier heuristics detect CIN, registration numbers, and unique IDs."""
    cand, reason = FirebaseDataProfiler._evaluate_identifier_candidate(
        field_path="cin",
        presence_count=10,
        total_sampled=10,
        unique_count=10,
        observed_types={"string"}
    )
    assert cand is True
    assert "Exact identifier naming pattern" in reason
    assert "100% presence" in reason


def test_10_candidate_reference_detection():
    """10. Candidate reference heuristics detect company_id, supplier_id, and foreign keys."""
    cand, reason = FirebaseDataProfiler._evaluate_reference_candidate(
        field_path="company_id",
        observed_types={"string"},
        sample_values=["C001", "C002"],
        is_candidate_id=False
    )
    assert cand is True
    assert "foreign reference/key" in reason


def test_11_reference_matching_and_rate():
    """11. Cross-branch reference validation calculates accurate empirical match rate."""
    source_branch = FirebaseBranchProfile(
        path="/suppliers",
        name="suppliers",
        exists=True,
        approx_child_count=2,
        sample_size=2,
        is_collection_like=True,
        fields=[
            FirebaseFieldProfile(
                field_path="company_id",
                observed_types=["string"],
                presence_count=2,
                total_sampled=2,
                presence_ratio=1.0,
                candidate_reference=True,
                reference_reason="Candidate reference",
                sample_values=["C001", "C002"],
            )
        ]
    )
    source_records = [
        {"company_id": "C001"},
        {"company_id": "C002"}
    ]
    target_branch = FirebaseBranchProfile(
        path="/companies",
        name="companies",
        exists=True,
        approx_child_count=2,
        sample_size=2,
        is_collection_like=True,
        fields=[
            FirebaseFieldProfile(
                field_path="id",
                observed_types=["string"],
                presence_count=2,
                total_sampled=2,
                presence_ratio=1.0,
                candidate_identifier=True,
                sample_values=["C001", "C002"],
            )
        ]
    )
    branch_keys_cache = {"companies": {"C001", "C002"}}

    checks = FirebaseDataProfiler._cross_check_references(
        source_branch=source_branch,
        source_records=source_records,
        all_branches=[source_branch, target_branch],
        branch_keys_cache=branch_keys_cache
    )
    assert len(checks) == 1
    assert checks[0].match_rate == 1.0
    assert checks[0].sampled_matches == 2
    assert checks[0].target_path == "/companies"


def test_12_temporal_candidate_detection():
    """12. Temporal heuristics detect ISO-8601 strings and Unix epoch timestamps."""
    cand_iso, reason_iso, fmt_iso = FirebaseDataProfiler._evaluate_temporal_candidate(
        field_path="registration_date",
        observed_types={"string"},
        sample_values=["2024-05-15T10:30:00Z"]
    )
    assert cand_iso is True
    assert fmt_iso == "ISO-8601 Timestamp"

    cand_unix, _, fmt_unix = FirebaseDataProfiler._evaluate_temporal_candidate(
        field_path="created_at",
        observed_types={"number"},
        sample_values=[1715769000]
    )
    assert cand_unix is True
    assert "Unix Epoch" in fmt_unix


def test_13_depth_limit_enforcement():
    """13. Traversal stops cleanly when max_depth is reached without infinite recursion."""
    deep_record = {"a": {"b": {"c": {"d": {"e": {"f": "too deep"}}}}}}
    flattened = FirebaseDataProfiler._flatten_record(deep_record, prefix="", depth=1, max_depth=3)
    paths = [item[0] for item in flattened]
    # At depth 3, 'a.b.c' is recorded as a nested object and not traversed further
    assert "a.b.c" in paths
    assert not any("a.b.c.d.e" in p for p in paths)


def test_14_sample_limit_enforcement():
    """14. Sample limit parameter is validated by Pydantic (max 50) and bounded strictly."""
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        FirebaseProfileRequest(sample_limit=100)

    req = FirebaseProfileRequest(sample_limit=25)
    assert req.sample_limit == 25



def test_15_field_limit_enforcement():
    """15. Maximum fields per branch cap is respected."""
    many_fields_rec = {f"field_{i}": i for i in range(50)}
    fields, _, _ = FirebaseDataProfiler._profile_records_fields([many_fields_rec], "/test", max_depth=4, max_fields=15)
    assert len(fields) <= 15


def test_16_invalid_path_handling():
    """16. Nonexistent/invalid path does not crash the profiler and returns warning."""
    mock_ref = MagicMock()
    mock_ref.order_by_key().limit_to_first().get.return_value = None

    with patch("app.db.firebase_profiler.FirebaseConnection.get_app"), \
         patch("app.db.firebase_profiler.FirebaseConnection.list_paths", return_value=[]), \
         patch("app.db.firebase_profiler.FirebaseConnection.get_reference", return_value=mock_ref):
        req = FirebaseProfileRequest(paths=["/nonexistent_branch"])
        profile = FirebaseDataProfiler.profile_database(req)
        assert profile.success is True
        assert len(profile.branches) == 1
        assert profile.branches[0].sample_size == 0


def test_17_firebase_connection_failure_handling():
    """17. Connection failure creates error warnings cleanly."""
    mock_ref = MagicMock()
    mock_ref.order_by_key().limit_to_first().get.side_effect = Exception("Permission denied")

    with patch("app.db.firebase_profiler.FirebaseConnection.get_app"), \
         patch("app.db.firebase_profiler.FirebaseConnection.list_paths", return_value=[{"name": "secure", "path": "/secure", "record_count": 5}]), \
         patch("app.db.firebase_profiler.FirebaseConnection.get_reference", return_value=mock_ref):
        req = FirebaseProfileRequest(paths=["/secure"])
        profile = FirebaseDataProfiler.profile_database(req)
        assert profile.branches[0].exists is False
        assert any("Permission denied" in w for w in profile.branches[0].warnings)


def test_18_large_branch_protection():
    """18. Verify that bounded sampling query order_by_key().limit_to_first() is used."""
    mock_ref = MagicMock()
    mock_query = MagicMock()
    mock_ref.order_by_key.return_value = mock_query
    mock_query.limit_to_first.return_value = mock_query
    mock_query.get.return_value = {"k1": {"val": 1}}

    with patch("app.db.firebase_profiler.FirebaseConnection.get_app"), \
         patch("app.db.firebase_profiler.FirebaseConnection.list_paths", return_value=[{"name": "huge", "path": "/huge", "record_count": 100000}]), \
         patch("app.db.firebase_profiler.FirebaseConnection.get_reference", return_value=mock_ref):
        req = FirebaseProfileRequest(paths=["/huge"], sample_limit=10)
        profile = FirebaseDataProfiler.profile_database(req)
        mock_ref.order_by_key.assert_called_once()
        mock_query.limit_to_first.assert_called_once_with(10)
        assert profile.branches[0].sample_size == 1


def test_19_pydantic_serialization_deserialization():
    """19. Profile response cleanly serializes to and deserializes from JSON."""
    field_p = FirebaseFieldProfile(
        field_path="cin",
        observed_types=["string"],
        presence_count=5,
        total_sampled=5,
        presence_ratio=1.0,
        candidate_identifier=True,
        identifier_reason="Primary identifier",
        sample_values=["U12345DL2020PTC123456"]
    )
    branch_p = FirebaseBranchProfile(
        path="/companies",
        name="companies",
        fields=[field_p],
        candidate_identifiers=["cin"]
    )
    resp = FirebaseDataProfileResponse(
        success=True,
        profiled_at="2026-09-08T00:00:00Z",
        branches=[branch_p],
        human_readable_summary="# Summary"
    )
    json_data = resp.model_dump_json()
    assert "cin" in json_data
    assert "U12345DL2020PTC123456" in json_data
    restored = FirebaseDataProfileResponse.model_validate_json(json_data)
    assert restored.branches[0].fields[0].field_path == "cin"


def test_20_human_readable_markdown_summary():
    """20. Markdown summary is generated with tables, flags, and observational note."""
    branch = FirebaseBranchProfile(
        path="/companies",
        name="companies",
        exists=True,
        approx_child_count=1000,
        sample_size=10,
        is_collection_like=True,
        fields=[
            FirebaseFieldProfile(
                field_path="cin",
                observed_types=["string"],
                presence_count=10,
                total_sampled=10,
                presence_ratio=1.0,
                candidate_identifier=True,
                sample_values=["U12345DL2020PTC123456"]
            )
        ],
        candidate_identifiers=["cin"]
    )
    md = FirebaseDataProfiler._generate_markdown_summary([branch], [], 10, "2026-09-08T00:00:00Z")
    assert "Firebase Realtime Database" in md
    assert "observational" in md
    assert "| `cin` | string | 10/10 (100%)" in md
    assert "[ID]" in md
