"""
Tests for Multi-Dataset Source Architecture in ReasonChain.

Verifies:
1. Single dataset selection on SourceDescriptor / SourceConfiguration
2. Multiple dataset selection under ONE source (1 Source -> N Datasets)
3. Zero dataset selection validation (rejected with 400 / ValueError)
4. Dataset inspection without selection (independent inspection capability)
5. Synthetic dataset flagging (e.g. /company_relationships marked is_synthetic=True)
6. Dataset deselection / exclusion
7. Persisted multi-dataset configuration (GET & POST /api/firebase/source-config)
8. Firebase and PostgreSQL adapter dataset descriptor populating
9. Multi-dataset profile propagation in AI mapping assistant
"""

import os
import sys
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.main import app
from app.source.models import (
    SourceCapability,
    SourceStatus,
    SourceDescriptor,
    DatasetDescriptor,
    DatasetSelection,
    SourceConfiguration,
)
from app.source.adapters.firebase_adapter import FirebaseSourceAdapter
from app.source.adapters.postgres_adapter import PostgreSQLSourceAdapter
from app.source.ai.ai_context import (
    MappingProposalRequest,
    build_mapping_request,
)
from app.models.schemas import (
    DatasetSelectionItem,
    SourceConfigRequest,
    SourceConfigResponse,
)

client = TestClient(app)


# =========================================================================
# 1. ARCHITECTURAL INVARIANT: 1 SOURCE -> N DATASETS
# =========================================================================

def test_source_descriptor_has_multiple_datasets():
    """Verify that a single SourceDescriptor contains multiple DatasetDescriptors."""
    d1 = DatasetDescriptor(
        dataset_id="companies",
        source_id="firebase_rtdb",
        display_name="Firebase Companies",
        physical_identifier="/companies",
        is_synthetic=False,
        record_estimate=10000,
    )
    d2 = DatasetDescriptor(
        dataset_id="company_relationships",
        source_id="firebase_rtdb",
        display_name="Firebase Relationships",
        physical_identifier="/company_relationships",
        is_synthetic=True,
        record_estimate=8,
    )
    d3 = DatasetDescriptor(
        dataset_id="company_reference",
        source_id="firebase_rtdb",
        display_name="Firebase Reference",
        physical_identifier="/company_reference",
        is_synthetic=False,
        record_estimate=500,
    )

    source = SourceDescriptor(
        source_id="firebase_rtdb",
        source_type="firebase_rtdb",
        display_name="Firebase Realtime Database",
        status=SourceStatus.CONNECTED,
        capabilities=[SourceCapability.DISCOVERY, SourceCapability.PROFILING],
        datasets=[d1, d2, d3],
    )

    assert source.source_id == "firebase_rtdb"
    assert len(source.datasets) == 3
    assert source.datasets[0].dataset_id == "companies"
    assert source.datasets[1].is_synthetic is True
    assert source.datasets[2].dataset_id == "company_reference"


# =========================================================================
# 2. DATASET SELECTION & EXCLUSION MODELS
# =========================================================================

def test_single_dataset_selection():
    """Verify selecting a single dataset in SourceConfiguration."""
    config = SourceConfiguration(
        source_id="firebase_rtdb",
        source_type="firebase_rtdb",
        datasets=[
            DatasetSelection(dataset_id="companies", physical_identifier="/companies", included=True),
            DatasetSelection(dataset_id="company_reference", physical_identifier="/company_reference", included=False),
        ],
    )
    included = config.get_included_datasets()
    assert len(included) == 1
    assert included[0].dataset_id == "companies"
    assert included[0].included is True


def test_multiple_dataset_selection_under_one_source():
    """Verify selecting multiple datasets (/companies + /company_relationships) under 1 source."""
    config = SourceConfiguration(
        source_id="firebase_rtdb",
        source_type="firebase_rtdb",
        datasets=[
            DatasetSelection(
                dataset_id="companies",
                physical_identifier="/companies",
                is_synthetic=False,
                included=True,
            ),
            DatasetSelection(
                dataset_id="company_relationships",
                physical_identifier="/company_relationships",
                is_synthetic=True,
                included=True,
            ),
            DatasetSelection(
                dataset_id="company_reference",
                physical_identifier="/company_reference",
                is_synthetic=False,
                included=False,
            ),
        ],
    )
    included = config.get_included_datasets()
    assert len(included) == 2
    included_ids = [d.dataset_id for d in included]
    assert "companies" in included_ids
    assert "company_relationships" in included_ids
    assert "company_reference" not in included_ids

    # Verify synthetic status preserved
    rel_dataset = next(d for d in included if d.dataset_id == "company_relationships")
    assert rel_dataset.is_synthetic is True


def test_zero_dataset_selection_raises_error():
    """Verify SourceConfiguration validation fails if 0 datasets are selected/included."""
    config1 = SourceConfiguration(
        source_id="firebase_rtdb",
        source_type="firebase_rtdb",
        datasets=[],
    )
    with pytest.raises(ValueError, match="must have at least one included dataset"):
        config1.validate_selection()

    config2 = SourceConfiguration(
        source_id="firebase_rtdb",
        source_type="firebase_rtdb",
        datasets=[
            DatasetSelection(dataset_id="companies", physical_identifier="/companies", included=False),
            DatasetSelection(dataset_id="company_reference", physical_identifier="/company_reference", included=False),
        ],
    )
    with pytest.raises(ValueError, match="must have at least one included dataset"):
        config2.validate_selection()


def test_dataset_inspection_without_selection():
    """Verify dataset can be inspected independently without being selected."""
    d = DatasetDescriptor(
        dataset_id="company_reference",
        source_id="firebase_rtdb",
        display_name="Reference Lookups",
        physical_identifier="/company_reference",
        record_estimate=500,
    )
    assert d.dataset_id == "company_reference"
    assert d.record_estimate == 500

    # User inspects d without including it in their active configuration
    config = SourceConfiguration(
        source_id="firebase_rtdb",
        source_type="firebase_rtdb",
        datasets=[
            DatasetSelection(dataset_id="companies", physical_identifier="/companies", included=True),
            DatasetSelection(dataset_id="company_reference", physical_identifier="/company_reference", included=False),
        ],
    )
    assert len(config.get_included_datasets()) == 1
    assert config.datasets[1].dataset_id == "company_reference"
    assert config.datasets[1].included is False


# =========================================================================
# 3. ADAPTERS POPULATE MULTIPLE DATASETS
# =========================================================================

def test_firebase_adapter_populates_datasets():
    """Verify FirebaseSourceAdapter returns a SourceDescriptor with multiple datasets."""
    adapter = FirebaseSourceAdapter()
    descriptor = adapter.get_descriptor()
    assert descriptor.source_id == "firebase_rtdb"
    assert descriptor.source_type == "firebase"
    assert len(descriptor.datasets) >= 3

    dataset_map = {d.dataset_id: d for d in descriptor.datasets}
    assert "companies" in dataset_map
    assert "company_relationships" in dataset_map
    assert "company_reference" in dataset_map

    # Check synthetic data detection
    assert dataset_map["company_relationships"].is_synthetic is True
    assert dataset_map["companies"].is_synthetic is False


def test_postgres_adapter_populates_datasets():
    """Verify PostgreSQLSourceAdapter returns a SourceDescriptor with multiple table datasets."""
    adapter = PostgreSQLSourceAdapter()
    descriptor = adapter.get_descriptor()
    assert descriptor.source_id == "postgres_main"
    assert descriptor.source_type == "postgres"
    assert len(descriptor.datasets) >= 4

    dataset_ids = [d.dataset_id for d in descriptor.datasets]
    assert "companies" in dataset_ids


# =========================================================================
# 4. REST API ENDPOINTS: /api/firebase/source-config
# =========================================================================

def test_api_save_and_get_source_config():
    """Verify POST and GET /api/firebase/source-config for multi-dataset selection."""
    payload = {
        "source_id": "firebase_rtdb",
        "datasets": [
            {
                "dataset_id": "companies",
                "physical_identifier": "/companies",
                "record_estimate": 10000,
                "is_synthetic": False,
                "included": True,
            },
            {
                "dataset_id": "company_relationships",
                "physical_identifier": "/company_relationships",
                "record_estimate": 8,
                "is_synthetic": True,
                "included": True,
            },
            {
                "dataset_id": "company_reference",
                "physical_identifier": "/company_reference",
                "record_estimate": 500,
                "is_synthetic": False,
                "included": False,
            },
        ],
    }

    # Save configuration
    post_res = client.post("/api/firebase/source-config", json=payload)
    assert post_res.status_code == 200
    data = post_res.json()
    assert data["source_id"] == "firebase_rtdb"
    assert data["selected_datasets_count"] == 2
    assert len(data["datasets"]) == 3

    # Retrieve configuration
    get_res = client.get("/api/firebase/source-config")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["source_id"] == "firebase_rtdb"
    assert get_data["selected_datasets_count"] == 2
    assert any(d["dataset_id"] == "company_relationships" and d["is_synthetic"] is True for d in get_data["datasets"])


def test_api_reject_zero_dataset_config():
    """Verify POST /api/firebase/source-config rejects zero included datasets."""
    # Empty datasets array
    res1 = client.post("/api/firebase/source-config", json={"source_id": "firebase_rtdb", "datasets": []})
    assert res1.status_code == 400
    assert "zero datasets" in res1.json()["detail"].lower()

    # All datasets excluded
    res2 = client.post("/api/firebase/source-config", json={
        "source_id": "firebase_rtdb",
        "datasets": [
            {"dataset_id": "companies", "physical_identifier": "/companies", "included": False},
        ],
    })
    assert res2.status_code == 400
    assert "at least one dataset must be selected" in res2.json()["detail"].lower()


def test_api_firebase_paths_enrichment():
    """Verify GET /api/firebase/paths returns enriched synthetic and description metadata."""
    res = client.get("/api/firebase/paths")
    assert res.status_code == 200
    data = res.json()
    assert "paths" in data
    paths = data["paths"]

    rel_path = next((p for p in paths if p["name"] == "company_relationships"), None)
    assert rel_path is not None
    assert rel_path["is_synthetic"] is True

    comp_path = next((p for p in paths if p["name"] == "companies"), None)
    assert comp_path is not None
    assert comp_path["is_synthetic"] is False


# =========================================================================
# 5. AI CONTEXT MULTI-DATASET SUPPORT
# =========================================================================

def test_ai_mapping_request_accepts_related_datasets():
    """Verify build_mapping_request and MappingProposalRequest accept related dataset profiles."""
    from app.source.models import ProfileResult

    primary_descriptor = DatasetDescriptor(
        dataset_id="company_relationships",
        source_id="firebase_rtdb",
        logical_name="Company Relationships",
        physical_identifier="/company_relationships",
        is_synthetic=True,
    )
    companies_descriptor = DatasetDescriptor(
        dataset_id="companies",
        source_id="firebase_rtdb",
        logical_name="Companies",
        physical_identifier="/companies",
        is_synthetic=False,
    )

    prof1 = ProfileResult(source_id="firebase_rtdb", dataset=primary_descriptor, records_sampled=8, fields=[])
    prof2 = ProfileResult(source_id="firebase_rtdb", dataset=companies_descriptor, records_sampled=100, fields=[])

    req = build_mapping_request(
        source_id="firebase_rtdb",
        dataset_id="company_relationships",
        profile=prof1,
        samples=[],
        related_profiles=[prof2],
    )
    assert req.dataset_id == "company_relationships"
    assert len(req.related_dataset_profiles) == 1
    assert req.related_dataset_profiles[0]["dataset_id"] == "companies"
