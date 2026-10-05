"""
Firebase Realtime Database API Endpoints
Provides connection testing, metadata discovery, data sampling, profiling, and entity mapping
for Firebase Realtime Database.
"""

import json
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query, Path
from app.core.config import settings
from app.db.firebase import FirebaseConnection
from app.models.schemas import (
    FirebaseConfigRequest,
    FirebaseConnectionResponse,
    FirebasePathsResponse,
    FirebaseSampleResponse,
    FirebaseStatusResponse,
    FirebaseProfileRequest,
    FirebaseDataProfileResponse,
    FirebaseMappingRequest,
    FirebaseMappingResponse,
    FirebaseMappedEntitySummary,
    FirebaseMappedRelationshipSummary,
    SourceConfigRequest,
    SourceConfigResponse,
    DatasetSelectionItem,
)
from app.source.models import SourceConfiguration, DatasetSelection
from app.db.firebase_profiler import FirebaseDataProfiler
from app.ingestion.firebase_mapper import build_firebase_canonical_payload

logger = logging.getLogger("reasonchain.firebase.routes")
router = APIRouter()


@router.post("/test-connection", response_model=FirebaseConnectionResponse)
def test_firebase_connection(config: Optional[FirebaseConfigRequest] = None):
    """
    Test connection to Firebase Realtime Database.
    Allows optional path/url override, falling back to server-side settings.
    """
    custom_url = config.database_url if config and config.database_url else None
    custom_path = config.service_account_path if config and config.service_account_path else None

    result = FirebaseConnection.test_connection(
        service_account_path=custom_path,
        database_url=custom_url
    )
    return result


@router.post("/test-server-connection", response_model=FirebaseConnectionResponse)
def test_server_connection():
    """
    Test Firebase Realtime Database connection using server-side configuration ONLY.
    Safe for frontend onboarding flow without exposing or receiving credentials.
    """
    result = FirebaseConnection.test_connection()
    return result


@router.get("/paths", response_model=FirebasePathsResponse)
@router.get("/collections", response_model=FirebasePathsResponse)
def get_firebase_paths():
    """
    List available top-level paths (e.g. /companies) and their record counts from Firebase RTDB.
    """
    try:
        paths = FirebaseConnection.list_paths()
        total_records = sum(p["record_count"] for p in paths)
        return {
            "paths": paths,
            "total_paths": len(paths),
            "total_records": total_records
        }
    except Exception as e:
        logger.error("Error listing Firebase paths: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to query Firebase collections: {str(e)}"
        )


@router.get("/sample/{collection_name}", response_model=FirebaseSampleResponse)
def get_firebase_sample(
    collection_name: str = Path(..., description="Name of the Firebase node/collection, e.g. companies"),
    limit: int = Query(default=10, ge=1, le=100, description="Number of sample records to fetch")
):
    """
    Fetch sample records and schema from a specific Firebase Realtime Database path.
    """
    try:
        sample_data = FirebaseConnection.get_sample_records(
            path=collection_name,
            limit=limit
        )
        return sample_data
    except Exception as e:
        logger.error("Error fetching sample records from Firebase path %s: %s", collection_name, e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch sample records from Firebase: {str(e)}"
        )


@router.get("/status", response_model=FirebaseStatusResponse)
def get_firebase_status():
    """
    Return the configuration status of the Firebase connector.
    """
    resolved_path = FirebaseConnection._resolve_service_account_path()
    project_id = None

    if resolved_path:
        try:
            with open(resolved_path, "r", encoding="utf-8") as f:
                sa_data = json.load(f)
                project_id = sa_data.get("project_id")
        except Exception:
            pass

    is_configured = bool(settings.FIREBASE_DATABASE_URL and resolved_path)

    return {
        "status": "ready" if is_configured else "unconfigured",
        "is_configured": is_configured,
        "database_url": settings.FIREBASE_DATABASE_URL if settings.FIREBASE_DATABASE_URL else None,
        "project_id": project_id,
        "service_account_found": bool(resolved_path)
    }


_active_firebase_source_config: Optional[SourceConfiguration] = None


def get_active_firebase_source_config() -> SourceConfiguration:
    global _active_firebase_source_config
    if _active_firebase_source_config is None:
        paths = FirebaseConnection.list_paths()
        selections = []
        for p in paths:
            raw_name = p.get("name", "")
            is_synth = (raw_name == "company_relationships" or bool(p.get("is_synthetic", False)))
            selections.append(
                DatasetSelection(
                    dataset_id=raw_name,
                    logical_name=raw_name.replace("_", " ").title(),
                    physical_identifier=f"/{raw_name.strip('/')}",
                    dataset_type="document_branch",
                    record_estimate=p.get("record_count", 0),
                    is_synthetic=is_synth,
                    included=(raw_name != "company_reference"),
                    description=p.get("description"),
                    metadata={"path": p.get("path")},
                )
            )
        _active_firebase_source_config = SourceConfiguration(
            source_id="firebase_rtdb",
            source_type="firebase",
            display_name="Firebase Realtime Database",
            datasets=selections,
            connection_summary={"database_url": settings.FIREBASE_DATABASE_URL},
            metadata={"storage_engine": "firebase_rtdb"}
        )
    return _active_firebase_source_config


@router.get("/source-config", response_model=SourceConfigResponse)
def get_firebase_source_config():
    """
    Retrieve active Firebase source configuration containing multiple datasets and their selection states.
    Enforces One Source -> Multiple Datasets principle.
    """
    cfg = get_active_firebase_source_config()
    items = [
        DatasetSelectionItem(
            dataset_id=d.dataset_id,
            logical_name=d.logical_name,
            physical_identifier=d.physical_identifier,
            record_estimate=d.record_estimate,
            is_synthetic=d.is_synthetic,
            included=d.included,
            description=d.description,
            metadata=d.metadata,
        )
        for d in cfg.datasets
    ]
    included_count = len(cfg.get_included_datasets())
    return SourceConfigResponse(
        success=True,
        source_id=cfg.source_id,
        source_type=cfg.source_type,
        display_name=cfg.display_name,
        total_datasets_discovered=len(items),
        selected_datasets_count=included_count,
        datasets=items,
        message=f"Configured 1 source with {included_count} selected datasets ({len(items)} total discovered).",
    )


@router.post("/source-config", response_model=SourceConfigResponse)
def save_firebase_source_config(req: SourceConfigRequest):
    """
    Persist source configuration with multiple dataset selections under ONE source.
    Validates that at least one dataset is selected for inclusion.
    """
    global _active_firebase_source_config
    if not req.datasets:
        raise HTTPException(status_code=400, detail="Cannot save source configuration with zero datasets.")

    included = [d for d in req.datasets if d.included]
    if not included:
        raise HTTPException(status_code=400, detail="Validation failed: At least one dataset must be selected.")

    selections = [
        DatasetSelection(
            dataset_id=d.dataset_id,
            logical_name=d.logical_name or d.dataset_id.replace("_", " ").title(),
            physical_identifier=d.physical_identifier,
            record_estimate=d.record_estimate,
            is_synthetic=d.is_synthetic,
            included=d.included,
            description=d.description,
            metadata=d.metadata,
        )
        for d in req.datasets
    ]

    cfg = SourceConfiguration(
        source_id=req.source_id or "firebase_rtdb",
        source_type=req.source_type or "firebase",
        display_name=req.display_name or "Firebase Realtime Database",
        datasets=selections,
        connection_summary={"database_url": settings.FIREBASE_DATABASE_URL},
        metadata=req.metadata,
    )
    _active_firebase_source_config = cfg

    items = [
        DatasetSelectionItem(
            dataset_id=d.dataset_id,
            logical_name=d.logical_name,
            physical_identifier=d.physical_identifier,
            record_estimate=d.record_estimate,
            is_synthetic=d.is_synthetic,
            included=d.included,
            description=d.description,
            metadata=d.metadata,
        )
        for d in cfg.datasets
    ]

    return SourceConfigResponse(
        success=True,
        source_id=cfg.source_id,
        source_type=cfg.source_type,
        display_name=cfg.display_name,
        total_datasets_discovered=len(items),
        selected_datasets_count=len(included),
        datasets=items,
        message=f"Successfully persisted 1 source configuration with {len(included)} selected datasets.",
    )


@router.post("/profile", response_model=FirebaseDataProfileResponse)
def profile_firebase_data(request: Optional[FirebaseProfileRequest] = None):
    """
    Profile selected or all discovered Firebase Realtime Database branches.
    Performs safe, bounded-read inspection to detect field types, missingness, candidate identifiers,
    candidate references, cross-branch matches, and candidate temporal fields.
    Does NOT perform semantic mapping or write to Neo4j.
    """
    try:
        req = request or FirebaseProfileRequest()
        result = FirebaseDataProfiler.profile_database(req)
        return result
    except Exception as e:
        logger.error("Error generating Firebase data profile: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to profile Firebase database: {str(e)}"
        )


@router.post("/map", response_model=FirebaseMappingResponse)
def map_firebase_data(request: Optional[FirebaseMappingRequest] = None):
    """
    Execute Firebase Entity Mapper on a specified collection path.
    Transforms raw Firebase documents into CanonicalEntity and CanonicalRelationship
    instances with full provenance tracking.
    Does NOT write to Neo4j.
    """
    try:
        req = request or FirebaseMappingRequest()
        payload = build_firebase_canonical_payload(
            path=req.path,
            limit=req.limit,
            include_relationships=req.include_relationships,
            include_nested_entities=req.include_nested_entities,
        )

        # Serialize entities for API response
        entity_summaries = []
        for e in payload.entities:
            source_path = None
            mapping_conf = e.confidence.mapping_confidence if e.confidence else 1.0
            if e.source_references:
                source_path = e.source_references[0].source_path
            entity_summaries.append(FirebaseMappedEntitySummary(
                canonical_id=e.canonical_id,
                entity_type=str(e.entity_type),
                display_name=e.display_name,
                properties=e.properties,
                source_system="firebase",
                source_path=source_path,
                mapping_confidence=mapping_conf,
            ))

        # Serialize relationships for API response
        rel_summaries = []
        for r in payload.relationships:
            rel_summaries.append(FirebaseMappedRelationshipSummary(
                relationship_id=r.relationship_id,
                relationship_type=str(r.relationship_type),
                source_entity_id=r.source_entity_id,
                target_entity_id=r.target_entity_id,
                source_entity_type=r.source_entity_type,
                target_entity_type=r.target_entity_type,
                properties=r.properties,
            ))

        return FirebaseMappingResponse(
            success=True,
            path=req.path,
            total_records_processed=payload.metadata.get("records_processed", 0),
            total_entities=len(payload.entities),
            total_relationships=len(payload.relationships),
            entity_type_counts=payload.metadata.get("entity_type_counts", {}),
            relationship_type_counts=payload.metadata.get("relationship_type_counts", {}),
            provenance_summary={
                "source": "firebase",
                "source_path": req.path,
                "mapping_started_at": payload.metadata.get("mapping_started_at"),
                "mapping_completed_at": payload.metadata.get("mapping_completed_at"),
            },
            entities=entity_summaries,
            relationships=rel_summaries,
            mapping_duration_ms=payload.metadata.get("mapping_duration_ms", 0),
        )
    except Exception as e:
        logger.error("Error mapping Firebase data: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to map Firebase data: {str(e)}"
        )


@router.get("/map/preview/{collection_name}", response_model=FirebaseMappingResponse)
def preview_firebase_mapping(
    collection_name: str = Path(..., description="Firebase collection to preview mapping for"),
    limit: int = Query(default=5, ge=1, le=20, description="Number of sample records to map for preview"),
):
    """
    Quick preview of entity mapping results for a small sample.
    Useful for frontend validation before committing a larger mapping run.
    """
    try:
        path = f"/{collection_name.strip('/')}"
        payload = build_firebase_canonical_payload(
            path=path,
            limit=limit,
            include_relationships=True,
            include_nested_entities=True,
        )

        entity_summaries = []
        for e in payload.entities:
            source_path = None
            mapping_conf = e.confidence.mapping_confidence if e.confidence else 1.0
            if e.source_references:
                source_path = e.source_references[0].source_path
            entity_summaries.append(FirebaseMappedEntitySummary(
                canonical_id=e.canonical_id,
                entity_type=str(e.entity_type),
                display_name=e.display_name,
                properties=e.properties,
                source_system="firebase",
                source_path=source_path,
                mapping_confidence=mapping_conf,
            ))

        rel_summaries = []
        for r in payload.relationships:
            rel_summaries.append(FirebaseMappedRelationshipSummary(
                relationship_id=r.relationship_id,
                relationship_type=str(r.relationship_type),
                source_entity_id=r.source_entity_id,
                target_entity_id=r.target_entity_id,
                source_entity_type=r.source_entity_type,
                target_entity_type=r.target_entity_type,
                properties=r.properties,
            ))

        return FirebaseMappingResponse(
            success=True,
            path=path,
            total_records_processed=payload.metadata.get("records_processed", 0),
            total_entities=len(payload.entities),
            total_relationships=len(payload.relationships),
            entity_type_counts=payload.metadata.get("entity_type_counts", {}),
            relationship_type_counts=payload.metadata.get("relationship_type_counts", {}),
            provenance_summary={
                "source": "firebase",
                "source_path": path,
                "mapping_started_at": payload.metadata.get("mapping_started_at"),
                "mapping_completed_at": payload.metadata.get("mapping_completed_at"),
            },
            entities=entity_summaries,
            relationships=rel_summaries,
            mapping_duration_ms=payload.metadata.get("mapping_duration_ms", 0),
        )
    except Exception as e:
        logger.error("Error previewing Firebase mapping: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to preview Firebase mapping: {str(e)}"
        )

