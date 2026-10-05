"""
Firebase Realtime Database Source Adapter
Concrete implementation of BaseSourceAdapter for Firebase Realtime Database.
Encapsulates all Firebase-specific mechanics (Admin SDK, path queries, shallow listing)
and exposes only universal contracts, descriptors, profiles, and normalized SourceRecords.
"""

import time
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from app.source.contract import (
    BaseSourceAdapter,
    ConnectionTestResult,
    ExtractOptions,
    ProfileOptions,
)
from app.source.models import (
    SourceCapability,
    SourceStatus,
    SourceDescriptor,
    DatasetDescriptor,
    FieldDescriptor,
    ReferenceCandidate,
    TemporalCandidate,
    ProfileResult,
)
from app.source.records import (
    SourceLocation,
    SourceRecord,
    SourceBatch,
)
from app.domain.provenance import SourceType, ProvenanceMetadata
from app.db.firebase import FirebaseConnection
from app.db.firebase_profiler import FirebaseDataProfiler
from app.models.schemas import FirebaseProfileRequest

logger = logging.getLogger("reasonchain.source.firebase")


class FirebaseSourceAdapter(BaseSourceAdapter):
    """
    Source adapter for Firebase Realtime Database conforming to Universal Source Contract.
    """

    def __init__(self, source_id: str = "firebase_rtdb", display_name: str = "Firebase Realtime Database"):
        self.source_id = source_id
        self.display_name = display_name

    def connect(self) -> ConnectionTestResult:
        """Verify Firebase connectivity via server-side credentials without exposing secrets."""
        start = time.perf_counter()
        try:
            res = FirebaseConnection.test_connection()
            elapsed_ms = (time.perf_counter() - start) * 1000.0

            if res.get("success", False):
                return ConnectionTestResult(
                    success=True,
                    message=res.get("message", "Connected to Firebase Realtime Database"),
                    connection_time_ms=elapsed_ms,
                    capabilities=[
                        SourceCapability.DISCOVERY,
                        SourceCapability.PROFILING,
                        SourceCapability.BOUNDED_EXTRACTION,
                        SourceCapability.SCHEMA_INSPECTION,
                    ],
                    metadata={
                        "database_url": res.get("database_url"),
                        "total_collections": res.get("total_collections", 0),
                    }
                )
            else:
                return ConnectionTestResult(
                    success=False,
                    message=res.get("message", "Failed to connect to Firebase"),
                    connection_time_ms=elapsed_ms,
                    capabilities=[],
                )
        except Exception as e:
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            return ConnectionTestResult(
                success=False,
                message=f"Firebase connection error: {str(e)}",
                connection_time_ms=elapsed_ms,
                capabilities=[],
            )

    def get_descriptor(self) -> SourceDescriptor:
        """Return universal descriptor for this Firebase source."""
        status_info = FirebaseConnection.get_status()
        is_cfg = status_info.get("is_configured", False)
        discovered = self.discover_datasets() if is_cfg else []

        return SourceDescriptor(
            source_id=self.source_id,
            source_type="firebase",
            display_name=self.display_name,
            description="Firebase Realtime Database containing enterprise corporate records and relationships",
            capabilities=[
                SourceCapability.DISCOVERY,
                SourceCapability.PROFILING,
                SourceCapability.BOUNDED_EXTRACTION,
                SourceCapability.SCHEMA_INSPECTION,
            ],
            status=SourceStatus.CONFIGURED if is_cfg else SourceStatus.UNCONFIGURED,
            connection_summary={
                "database_url": status_info.get("database_url"),
                "project_id": status_info.get("project_id"),
                "service_account_configured": status_info.get("service_account_found", False),
            },
            datasets=discovered,
            metadata={"storage_engine": "firebase_rtdb"}
        )

    def discover_datasets(self) -> List[DatasetDescriptor]:
        """Discover all top-level branches as universal DatasetDescriptors."""
        paths = FirebaseConnection.list_paths()
        datasets: List[DatasetDescriptor] = []

        for p in paths:
            raw_name = p.get("name", "")
            clean_name = raw_name.strip().lstrip("/")
            count = p.get("record_count", 0)
            is_synthetic = (clean_name == "company_relationships" or bool(p.get("is_synthetic", False)))
            desc = (
                f"Firebase JSON collection at /{clean_name} (Synthetic/test relationship data, ~{count} records)"
                if is_synthetic
                else f"Firebase JSON collection at /{clean_name} (~{count} records)"
            )

            ds = DatasetDescriptor(
                dataset_id=clean_name,
                source_id=self.source_id,
                logical_name=clean_name.replace("_", " ").title(),
                physical_identifier=f"/{clean_name}",
                dataset_type="document_branch",
                record_estimate=count,
                is_synthetic=is_synthetic,
                description=desc,
                metadata={"raw_path": p.get("path"), "is_synthetic": is_synthetic},
            )
            datasets.append(ds)

        return datasets

    def get_dataset(self, dataset_id: str) -> Optional[DatasetDescriptor]:
        """Get dataset descriptor for a specific Firebase path."""
        clean_id = dataset_id.strip().lstrip("/")
        all_ds = self.discover_datasets()
        for ds in all_ds:
            if ds.dataset_id == clean_id:
                return ds
        return None

    def profile_dataset(self, dataset_id: str, options: Optional[ProfileOptions] = None) -> ProfileResult:
        """Execute bounded profiling on a specific Firebase branch and return universal ProfileResult."""
        opts = options or ProfileOptions()
        clean_id = dataset_id.strip().lstrip("/")

        req = FirebaseProfileRequest(
            paths=[clean_id],
            sample_limit=opts.sample_limit,
            max_depth=opts.max_depth,
        )

        fb_profile = FirebaseDataProfiler.profile_database(req)
        branch = next(
            (b for b in fb_profile.branches if b.path.strip("/").lower() == clean_id.lower()),
            fb_profile.branches[0] if fb_profile.branches else None
        )

        ds = self.get_dataset(clean_id) or DatasetDescriptor(
            dataset_id=clean_id,
            source_id=self.source_id,
            logical_name=clean_id.replace("_", " ").title(),
            physical_identifier=f"/{clean_id}",
            dataset_type="document_branch",
            record_estimate=branch.approx_child_count if branch else 0,
        )

        universal_fields: List[FieldDescriptor] = []
        ref_candidates: List[ReferenceCandidate] = []
        temporal_candidates: List[TemporalCandidate] = []

        if branch:
            for fp in branch.fields:
                inferred = fp.observed_types[0] if fp.observed_types else "string"
                uf = FieldDescriptor(
                    field_path=fp.field_path,
                    inferred_type=inferred,
                    nullable=(fp.null_count > 0 or fp.missing_count > 0),
                    is_nested=fp.is_nested,
                    sample_values=fp.sample_values,
                    identifier_likelihood=1.0 if fp.candidate_identifier else 0.0,
                    reference_likelihood=1.0 if fp.candidate_reference else 0.0,
                    temporal_likelihood=1.0 if fp.candidate_temporal else 0.0,
                    presence_ratio=fp.presence_ratio,
                    distinct_count_estimate=fp.unique_value_count,
                )
                universal_fields.append(uf)

                if opts.include_reference_candidates and fp.candidate_reference:
                    ref_candidates.append(
                        ReferenceCandidate(
                            source_field=fp.field_path,
                            target_dataset_candidate=None,
                            confidence=0.8,
                            candidate_type="foreign_key",
                            rationale=fp.reference_reason or f"Inferred reference on '{fp.field_path}'",
                        )
                    )

                if opts.include_temporal_candidates and fp.candidate_temporal:
                    temporal_candidates.append(
                        TemporalCandidate(
                            field_path=fp.field_path,
                            detected_format=fp.temporal_format or "iso8601",
                            confidence=0.85,
                            sample_value=str(fp.sample_values[0]) if fp.sample_values else None,
                        )
                    )

        return ProfileResult(
            source_id=self.source_id,
            dataset=ds,
            fields=universal_fields,
            records_sampled=branch.sample_size if branch else 0,
            structural_observations={
                "has_nested_children": branch.has_nested_children if branch else False,
                "has_arrays": branch.has_arrays if branch else False,
                "total_fields_observed": len(branch.fields) if branch else 0,
            },
            reference_candidates=ref_candidates,
            temporal_candidates=temporal_candidates,
            profiled_at=fb_profile.profiled_at,
            profiling_metadata={
                "adapter": "FirebaseSourceAdapter",
            }
        )

    def profile_source(self, options: Optional[ProfileOptions] = None) -> List[ProfileResult]:
        """Profile all discovered Firebase branches."""
        datasets = self.discover_datasets()
        results: List[ProfileResult] = []
        for ds in datasets:
            try:
                prof = self.profile_dataset(ds.dataset_id, options)
                results.append(prof)
            except Exception as e:
                logger.warning(f"Failed to profile dataset '{ds.dataset_id}': {e}")
        return results

    def extract_records(self, dataset_id: str, options: Optional[ExtractOptions] = None) -> SourceBatch:
        """
        Extract bounded records from Firebase and return normalized SourceRecords.
        Translates raw dicts into universal intermediate format.
        """
        opts = options or ExtractOptions()
        clean_id = dataset_id.strip().lstrip("/")
        limit = opts.limit

        sample_res = FirebaseConnection.get_sample_records(clean_id, limit=limit)
        raw_records = sample_res.get("sample_records", [])
        ds = self.get_dataset(clean_id)
        total_estimate = ds.record_estimate if ds else len(raw_records)

        universal_records: List[SourceRecord] = []
        for idx, item in enumerate(raw_records):
            if not isinstance(item, dict):
                continue

            # Resolve record key: _key > cin > id > key > index
            record_key = str(
                item.get("_key")
                or item.get("cin")
                or item.get("id")
                or item.get("key")
                or f"rec_{idx}"
            ).strip()

            loc = SourceLocation(
                source_id=self.source_id,
                dataset_id=clean_id,
                record_key=record_key,
            )

            prov = ProvenanceMetadata(
                source_system=self.source_id,
                source_type=SourceType.FIREBASE,
                source_record_id=record_key,
                source_table=clean_id,
                source_path=f"/{clean_id}/{record_key}",
                observed_at=datetime.now(timezone.utc).isoformat(),
                source_reliability=1.0,
                extraction_confidence=1.0,
            )

            rec = SourceRecord(
                source_id=self.source_id,
                dataset_id=clean_id,
                record_id=record_key,
                attributes=dict(item),
                source_location=loc,
                observed_at=datetime.now(timezone.utc).isoformat(),
                provenance_metadata=prov,
            )
            universal_records.append(rec)

        return SourceBatch(
            source_id=self.source_id,
            dataset_id=clean_id,
            records=universal_records,
            total_count=len(universal_records),
            estimated_remaining=max(0, (total_estimate or 0) - len(universal_records)),
            has_more=len(universal_records) < (total_estimate or 0),
            extracted_at=datetime.now(timezone.utc).isoformat(),
        )
