"""
PostgreSQL & Relational Source Adapter
Concrete implementation of BaseSourceAdapter for PostgreSQL (with automatic SQLite fallback).
Encapsulates all SQL mechanics (information_schema, cursors, connection pooling)
and exposes only universal contracts, descriptors, profiles, and normalized SourceRecords.
"""

import time
import re
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
from app.ingestion.postgres_reader import _get_connection, _rows_to_dicts
from app.core.config import settings

logger = logging.getLogger("reasonchain.source.postgres")

RE_IDENTIFIER_NAME = re.compile(
    r"^(id|_id|uid|uuid|cin|code|reg_?no|company_?id|supplier_?id|person_?id|contract_?id)$",
    re.IGNORECASE
)
RE_REFERENCE_NAME = re.compile(
    r"(_id|Id|_code|Code|_cin|Cin|_key|Key)$",
    re.IGNORECASE
)
RE_TEMPORAL_NAME = re.compile(
    r"(date|time|created|updated|_at|timestamp|effective|expiry|dob)",
    re.IGNORECASE
)


class PostgreSQLSourceAdapter(BaseSourceAdapter):
    """
    Source adapter for PostgreSQL / Relational databases conforming to Universal Source Contract.
    """

    def __init__(self, source_id: str = "postgres_main", display_name: str = "PostgreSQL Enterprise Warehouse"):
        self.source_id = source_id
        self.display_name = display_name

    def connect(self) -> ConnectionTestResult:
        """Verify relational database connectivity."""
        start = time.perf_counter()
        conn = None
        try:
            conn, engine = _get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            elapsed_ms = (time.perf_counter() - start) * 1000.0

            return ConnectionTestResult(
                success=True,
                message=f"Connected to relational source via {engine} driver",
                connection_time_ms=elapsed_ms,
                capabilities=[
                    SourceCapability.DISCOVERY,
                    SourceCapability.PROFILING,
                    SourceCapability.BOUNDED_EXTRACTION,
                    SourceCapability.SCHEMA_INSPECTION,
                ],
                metadata={"engine": engine}
            )
        except Exception as e:
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            return ConnectionTestResult(
                success=False,
                message=f"PostgreSQL connection failed: {str(e)}",
                connection_time_ms=elapsed_ms,
                capabilities=[],
            )
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    def get_descriptor(self) -> SourceDescriptor:
        """Return universal descriptor for this relational source."""
        conn = None
        engine = "postgresql"
        try:
            conn, engine = _get_connection()
            status = SourceStatus.CONNECTED
        except Exception:
            status = SourceStatus.UNREACHABLE
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

        discovered = self.discover_datasets() if status == SourceStatus.CONNECTED else []
        return SourceDescriptor(
            source_id=self.source_id,
            source_type="postgres",
            display_name=self.display_name,
            description="Relational database containing corporate structures, ownership, and contracts",
            capabilities=[
                SourceCapability.DISCOVERY,
                SourceCapability.PROFILING,
                SourceCapability.BOUNDED_EXTRACTION,
                SourceCapability.SCHEMA_INSPECTION,
            ],
            status=status,
            connection_summary={
                "host": settings.POSTGRES_HOST,
                "port": settings.POSTGRES_PORT,
                "database": settings.POSTGRES_DB,
                "engine": engine,
            },
            datasets=discovered,
            metadata={"storage_engine": engine}
        )

    def discover_datasets(self) -> List[DatasetDescriptor]:
        """Discover all user tables as universal DatasetDescriptors."""
        conn = None
        datasets: List[DatasetDescriptor] = []
        try:
            conn, engine = _get_connection()
            cursor = conn.cursor()

            if engine == "postgresql":
                cursor.execute("""
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_type = 'BASE TABLE'
                    ORDER BY table_name;
                """)
                tables = [r[0] for r in cursor.fetchall()]
            else:
                cursor.execute("""
                    SELECT name FROM sqlite_master
                    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
                    ORDER BY name;
                """)
                tables = [r[0] for r in cursor.fetchall()]

            for t in tables:
                # Estimate row count
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM {t}")
                    count = cursor.fetchone()[0]
                except Exception:
                    count = None

                ds = DatasetDescriptor(
                    dataset_id=t,
                    source_id=self.source_id,
                    logical_name=t.replace("_", " ").title(),
                    physical_identifier=t,
                    dataset_type="table",
                    record_estimate=count,
                    description=f"Relational table '{t}'",
                )
                datasets.append(ds)
        except Exception as e:
            logger.error(f"Error discovering PostgreSQL datasets: {e}")
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
        return datasets

    def get_dataset(self, dataset_id: str) -> Optional[DatasetDescriptor]:
        """Get dataset descriptor for a specific table."""
        all_ds = self.discover_datasets()
        for ds in all_ds:
            if ds.dataset_id == dataset_id:
                return ds
        return None

    def profile_dataset(self, dataset_id: str, options: Optional[ProfileOptions] = None) -> ProfileResult:
        """Execute bounded profiling on a specific table."""
        opts = options or ProfileOptions()
        start = time.perf_counter()
        conn = None

        fields: List[FieldDescriptor] = []
        ref_candidates: List[ReferenceCandidate] = []
        temporal_candidates: List[TemporalCandidate] = []
        records_sampled = 0

        try:
            conn, engine = _get_connection()
            cursor = conn.cursor()

            # 1. Fetch sample rows
            cursor.execute(f"SELECT * FROM {dataset_id} LIMIT {opts.sample_limit}")
            rows = _rows_to_dicts(cursor, engine)
            records_sampled = len(rows)

            if rows:
                col_names = list(rows[0].keys())
                for col in col_names:
                    values = [r[col] for r in rows if r.get(col) is not None]
                    null_count = sum(1 for r in rows if r.get(col) is None)
                    presence = 1.0 - (null_count / float(records_sampled)) if records_sampled > 0 else 0.0

                    # Infer primitive type
                    inferred_type = "string"
                    if values:
                        sample_val = values[0]
                        if isinstance(sample_val, bool):
                            inferred_type = "boolean"
                        elif isinstance(sample_val, int):
                            inferred_type = "integer"
                        elif isinstance(sample_val, float):
                            inferred_type = "float"
                        elif isinstance(sample_val, (dict, list)):
                            inferred_type = "object"
                        elif isinstance(sample_val, (datetime,)):
                            inferred_type = "datetime"

                    # Identifier heuristic
                    is_id = bool(RE_IDENTIFIER_NAME.search(col))
                    id_likelihood = 0.95 if is_id and presence > 0.9 else (0.4 if is_id else 0.0)

                    # Reference heuristic
                    is_ref = bool(RE_REFERENCE_NAME.search(col)) and not is_id
                    ref_likelihood = 0.85 if is_ref else 0.0

                    # Temporal heuristic
                    is_temp = bool(RE_TEMPORAL_NAME.search(col)) or (inferred_type == "datetime")
                    temp_likelihood = 0.90 if is_temp else 0.0

                    safe_samples = [str(v)[:100] for v in values[:3]]
                    distinct_cnt = len(set(str(v) for v in values))

                    fd = FieldDescriptor(
                        field_path=col,
                        inferred_type=inferred_type,
                        nullable=null_count > 0,
                        is_nested=False,
                        sample_values=safe_samples,
                        identifier_likelihood=id_likelihood,
                        reference_likelihood=ref_likelihood,
                        temporal_likelihood=temp_likelihood,
                        presence_ratio=presence,
                        distinct_count_estimate=distinct_cnt,
                    )
                    fields.append(fd)

                    if opts.include_reference_candidates and is_ref:
                        ref_candidates.append(
                            ReferenceCandidate(
                                source_field=col,
                                target_dataset_candidate=col.replace("_id", "").replace("Id", "").lower(),
                                confidence=ref_likelihood,
                                candidate_type="foreign_key",
                                rationale=f"Naming pattern matches foreign key '{col}'",
                            )
                        )

                    if opts.include_temporal_candidates and is_temp:
                        temporal_candidates.append(
                            TemporalCandidate(
                                field_path=col,
                                detected_format="iso8601" if inferred_type == "datetime" else "standard_date",
                                confidence=temp_likelihood,
                                sample_value=safe_samples[0] if safe_samples else None,
                            )
                        )

        except Exception as e:
            logger.error(f"Error profiling table '{dataset_id}': {e}")
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

        duration = time.perf_counter() - start
        ds = self.get_dataset(dataset_id) or DatasetDescriptor(
            dataset_id=dataset_id,
            source_id=self.source_id,
            logical_name=dataset_id.replace("_", " ").title(),
            physical_identifier=dataset_id,
            dataset_type="table",
            record_estimate=records_sampled,
        )

        return ProfileResult(
            source_id=self.source_id,
            dataset=ds,
            fields=fields,
            records_sampled=records_sampled,
            structural_observations={
                "has_nested_objects": False,
                "has_arrays": False,
                "max_nesting_depth": 1,
                "column_count": len(fields),
            },
            reference_candidates=ref_candidates,
            temporal_candidates=temporal_candidates,
            profiling_metadata={
                "duration_seconds": duration,
                "adapter": "PostgreSQLSourceAdapter",
            }
        )

    def profile_source(self, options: Optional[ProfileOptions] = None) -> List[ProfileResult]:
        """Profile all discovered relational tables."""
        datasets = self.discover_datasets()
        results: List[ProfileResult] = []
        for ds in datasets:
            try:
                prof = self.profile_dataset(ds.dataset_id, options)
                results.append(prof)
            except Exception as e:
                logger.warning(f"Failed to profile table '{ds.dataset_id}': {e}")
        return results

    def extract_records(self, dataset_id: str, options: Optional[ExtractOptions] = None) -> SourceBatch:
        """
        Extract bounded records from a table and normalize into universal SourceRecords.
        """
        opts = options or ExtractOptions()
        limit = opts.limit
        offset = opts.offset or 0
        conn = None

        universal_records: List[SourceRecord] = []
        try:
            conn, engine = _get_connection()
            cursor = conn.cursor()

            query = f"SELECT * FROM {dataset_id} LIMIT {limit} OFFSET {offset}"
            cursor.execute(query)
            rows = _rows_to_dicts(cursor, engine)

            for idx, r in enumerate(rows):
                # Identify primary key candidate
                rec_id = str(
                    r.get("id")
                    or r.get("code")
                    or r.get("cin")
                    or r.get("key")
                    or f"{dataset_id}_{offset + idx}"
                ).strip()

                loc = SourceLocation(
                    source_id=self.source_id,
                    dataset_id=dataset_id,
                    record_key=rec_id,
                )

                prov = ProvenanceMetadata(
                    source_system=self.source_id,
                    source_type=SourceType.POSTGRES,
                    source_record_id=rec_id,
                    source_table=dataset_id,
                    source_path=f"{dataset_id}/{rec_id}",
                    observed_at=datetime.now(timezone.utc).isoformat(),
                    source_reliability=1.0,
                    extraction_confidence=1.0,
                )

                rec = SourceRecord(
                    source_id=self.source_id,
                    dataset_id=dataset_id,
                    record_id=rec_id,
                    attributes=dict(r),
                    source_location=loc,
                    observed_at=datetime.now(timezone.utc).isoformat(),
                    provenance_metadata=prov,
                )
                universal_records.append(rec)

        except Exception as e:
            logger.error(f"Error extracting records from '{dataset_id}': {e}")
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

        ds = self.get_dataset(dataset_id)
        total_estimate = ds.record_estimate if ds else len(universal_records)

        return SourceBatch(
            source_id=self.source_id,
            dataset_id=dataset_id,
            records=universal_records,
            total_count=len(universal_records),
            estimated_remaining=max(0, (total_estimate or 0) - (offset + len(universal_records))),
            has_more=len(universal_records) == limit,
            extracted_at=datetime.now(timezone.utc).isoformat(),
        )
