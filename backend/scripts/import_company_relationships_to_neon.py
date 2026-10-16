#!/usr/bin/env python3
"""
Import the ReasonChain Firebase /company_relationships JSON export into Neon PostgreSQL.

- Creates an isolated schema: reasonchain_import
- Preserves original child keys and full JSON payloads
- Normalizes each Firebase section into inspectable tables
- Is idempotent (UPSERT by source key)
- Does not drop or truncate existing database objects
- Marks relationship/person/supplier/contract/etc. records as synthetic where indicated
- Treats company_links as references to the real Firebase company master, not synthetic companies
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any

import psycopg
from psycopg.types.json import Jsonb
from dotenv import load_dotenv

SCHEMA_SQL = """
CREATE SCHEMA IF NOT EXISTS reasonchain_import;

CREATE TABLE IF NOT EXISTS reasonchain_import.import_runs (
    run_id UUID PRIMARY KEY,
    source_path TEXT NOT NULL,
    source_file TEXT NOT NULL,
    dataset_origin TEXT,
    authoritative BOOLEAN,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'RUNNING',
    section_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS reasonchain_import.source_metadata (
    metadata_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (metadata_id = 1),
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reasonchain_import.raw_records (
    source_section TEXT NOT NULL,
    source_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    is_synthetic BOOLEAN NOT NULL DEFAULT TRUE,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source_section, source_key)
);

CREATE TABLE IF NOT EXISTS reasonchain_import.company_links (
    source_key TEXT PRIMARY KEY,
    cin TEXT,
    company_name TEXT NOT NULL,
    source_path TEXT,
    mock_relationships_present BOOLEAN,
    is_synthetic BOOLEAN NOT NULL DEFAULT FALSE,
    source_payload JSONB NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reasonchain_import.people (
    source_key TEXT PRIMARY KEY,
    name TEXT,
    role TEXT,
    nationality TEXT,
    mock_record BOOLEAN NOT NULL DEFAULT TRUE,
    source_payload JSONB NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reasonchain_import.suppliers (
    source_key TEXT PRIMARY KEY,
    supplier_name TEXT,
    country TEXT,
    supplier_category TEXT,
    mock_record BOOLEAN NOT NULL DEFAULT TRUE,
    source_payload JSONB NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reasonchain_import.contracts (
    source_key TEXT PRIMARY KEY,
    company_ref TEXT,
    supplier_id TEXT,
    contract_reference TEXT,
    contract_type TEXT,
    start_date DATE,
    end_date DATE,
    status TEXT,
    mock_record BOOLEAN NOT NULL DEFAULT TRUE,
    source_payload JSONB NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reasonchain_import.external_companies (
    source_key TEXT PRIMARY KEY,
    company_name TEXT,
    registration_country TEXT,
    status TEXT,
    mock_record BOOLEAN NOT NULL DEFAULT TRUE,
    source_payload JSONB NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reasonchain_import.sanctions (
    source_key TEXT PRIMARY KEY,
    list_name TEXT,
    jurisdiction TEXT,
    status TEXT,
    mock_record BOOLEAN NOT NULL DEFAULT TRUE,
    source_payload JSONB NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reasonchain_import.relationship_claims (
    source_key TEXT PRIMARY KEY,
    relationship_type TEXT NOT NULL,
    subject_entity_id TEXT,
    subject_entity_type TEXT,
    subject_source_key TEXT,
    subject_cin TEXT,
    object_entity_id TEXT,
    object_entity_type TEXT,
    object_source_key TEXT,
    object_cin TEXT,
    role TEXT,
    active BOOLEAN,
    confidence NUMERIC(5,4),
    ownership_percentage NUMERIC(7,3),
    reason TEXT,
    affiliation_reason TEXT,
    valid_from DATE,
    valid_to DATE,
    contract_id TEXT,
    source_system TEXT,
    is_synthetic BOOLEAN NOT NULL DEFAULT TRUE,
    source_payload JSONB NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rc_company_links_cin
    ON reasonchain_import.company_links (cin);
CREATE INDEX IF NOT EXISTS idx_rc_company_links_name
    ON reasonchain_import.company_links (lower(company_name));
CREATE INDEX IF NOT EXISTS idx_rc_relationship_type
    ON reasonchain_import.relationship_claims (relationship_type);
CREATE INDEX IF NOT EXISTS idx_rc_relationship_subject_key
    ON reasonchain_import.relationship_claims (subject_source_key);
CREATE INDEX IF NOT EXISTS idx_rc_relationship_object_key
    ON reasonchain_import.relationship_claims (object_source_key);
CREATE INDEX IF NOT EXISTS idx_rc_relationship_subject_cin
    ON reasonchain_import.relationship_claims (subject_cin);
CREATE INDEX IF NOT EXISTS idx_rc_relationship_object_cin
    ON reasonchain_import.relationship_claims (object_cin);
"""

SECTION_TABLES = [
    "company_links", "people", "suppliers", "contracts",
    "external_companies", "sanctions", "relationships"
]

def as_date(value: Any):
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None

def as_bool(value: Any, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes", "active"}
    return bool(value)

def as_float(value: Any):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

def get_is_synthetic(section: str, payload: dict[str, Any]) -> bool:
    # These relationship/supporting entities are synthetic in the supplied export.
    # company_links point to actual Firebase company records and are not synthetic themselves.
    if section == "company_links":
        return False
    return as_bool(payload.get("mock_record"), default=True)

def validate_export(data: Any):
    if not isinstance(data, dict):
        raise ValueError("JSON root must be an object.")
    required = {"company_links", "contracts", "external_companies", "metadata",
                "people", "relationships", "sanctions", "suppliers"}
    missing = required - set(data.keys())
    if missing:
        raise ValueError(f"Missing top-level section(s): {', '.join(sorted(missing))}")
    for section in required - {"metadata"}:
        if not isinstance(data[section], dict):
            raise ValueError(f"Section '{section}' must be a JSON object keyed by Firebase child IDs.")
    if not isinstance(data["metadata"], dict):
        raise ValueError("'metadata' must be a JSON object.")
    return {section: len(data[section]) for section in SECTION_TABLES}

def import_data(connection_url: str, file_path: Path):
    with file_path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    counts = validate_export(data)
    metadata = data["metadata"]
    run_id = uuid.uuid4()
    now = datetime.now().astimezone()

    with psycopg.connect(connection_url) as conn:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
            cur.execute(
                """INSERT INTO reasonchain_import.import_runs
                   (run_id, source_path, source_file, dataset_origin, authoritative, status, section_counts)
                   VALUES (%s, %s, %s, %s, %s, 'RUNNING', %s)
                   ON CONFLICT (run_id) DO NOTHING""",
                (run_id, "/company_relationships", file_path.name,
                 metadata.get("data_origin"), as_bool(metadata.get("authoritative"), False),
                 Jsonb(counts))
            )
            cur.execute(
                """INSERT INTO reasonchain_import.source_metadata (metadata_id, payload, updated_at)
                   VALUES (1, %s, now())
                   ON CONFLICT (metadata_id) DO UPDATE
                   SET payload = EXCLUDED.payload, updated_at = now()""",
                (Jsonb(metadata),)
            )

            for section in SECTION_TABLES:
                records = data.get(section, {})
                for source_key, payload in records.items():
                    if not isinstance(payload, dict):
                        payload = {"value": payload}
                    synthetic = get_is_synthetic(section, payload)
                    cur.execute(
                        """INSERT INTO reasonchain_import.raw_records
                           (source_section, source_key, payload, is_synthetic, imported_at)
                           VALUES (%s, %s, %s, %s, now())
                           ON CONFLICT (source_section, source_key) DO UPDATE
                           SET payload = EXCLUDED.payload,
                               is_synthetic = EXCLUDED.is_synthetic,
                               imported_at = now()""",
                        (section, str(source_key), Jsonb(payload), synthetic)
                    )

                    if section == "company_links":
                        cur.execute(
                            """INSERT INTO reasonchain_import.company_links
                               (source_key, cin, company_name, source_path,
                                mock_relationships_present, is_synthetic, source_payload, imported_at)
                               VALUES (%s, %s, %s, %s, %s, FALSE, %s, now())
                               ON CONFLICT (source_key) DO UPDATE SET
                                cin = EXCLUDED.cin,
                                company_name = EXCLUDED.company_name,
                                source_path = EXCLUDED.source_path,
                                mock_relationships_present = EXCLUDED.mock_relationships_present,
                                source_payload = EXCLUDED.source_payload,
                                imported_at = now()""",
                            (str(source_key), payload.get("cin"), payload.get("company_name", str(source_key)),
                             payload.get("source_path"), payload.get("mock_relationships_present"),
                             Jsonb(payload))
                        )

                    elif section == "people":
                        cur.execute(
                            """INSERT INTO reasonchain_import.people
                               (source_key, name, role, nationality, mock_record, source_payload, imported_at)
                               VALUES (%s, %s, %s, %s, %s, %s, now())
                               ON CONFLICT (source_key) DO UPDATE SET
                                name = EXCLUDED.name, role = EXCLUDED.role,
                                nationality = EXCLUDED.nationality, mock_record = EXCLUDED.mock_record,
                                source_payload = EXCLUDED.source_payload, imported_at = now()""",
                            (str(source_key), payload.get("name"), payload.get("role"),
                             payload.get("nationality"), as_bool(payload.get("mock_record"), True),
                             Jsonb(payload))
                        )

                    elif section == "suppliers":
                        cur.execute(
                            """INSERT INTO reasonchain_import.suppliers
                               (source_key, supplier_name, country, supplier_category,
                                mock_record, source_payload, imported_at)
                               VALUES (%s, %s, %s, %s, %s, %s, now())
                               ON CONFLICT (source_key) DO UPDATE SET
                                supplier_name = EXCLUDED.supplier_name, country = EXCLUDED.country,
                                supplier_category = EXCLUDED.supplier_category,
                                mock_record = EXCLUDED.mock_record, source_payload = EXCLUDED.source_payload,
                                imported_at = now()""",
                            (str(source_key), payload.get("supplier_name"), payload.get("country"),
                             payload.get("supplier_category"), as_bool(payload.get("mock_record"), True),
                             Jsonb(payload))
                        )

                    elif section == "contracts":
                        cur.execute(
                            """INSERT INTO reasonchain_import.contracts
                               (source_key, company_ref, supplier_id, contract_reference, contract_type,
                                start_date, end_date, status, mock_record, source_payload, imported_at)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                               ON CONFLICT (source_key) DO UPDATE SET
                                company_ref = EXCLUDED.company_ref, supplier_id = EXCLUDED.supplier_id,
                                contract_reference = EXCLUDED.contract_reference, contract_type = EXCLUDED.contract_type,
                                start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
                                status = EXCLUDED.status, mock_record = EXCLUDED.mock_record,
                                source_payload = EXCLUDED.source_payload, imported_at = now()""",
                            (str(source_key), payload.get("company_ref"), payload.get("supplier_id"),
                             payload.get("contract_reference"), payload.get("contract_type"),
                             as_date(payload.get("start_date")), as_date(payload.get("end_date")),
                             payload.get("status"), as_bool(payload.get("mock_record"), True),
                             Jsonb(payload))
                        )

                    elif section == "external_companies":
                        cur.execute(
                            """INSERT INTO reasonchain_import.external_companies
                               (source_key, company_name, registration_country, status, mock_record,
                                source_payload, imported_at)
                               VALUES (%s, %s, %s, %s, %s, %s, now())
                               ON CONFLICT (source_key) DO UPDATE SET
                                company_name = EXCLUDED.company_name,
                                registration_country = EXCLUDED.registration_country,
                                status = EXCLUDED.status, mock_record = EXCLUDED.mock_record,
                                source_payload = EXCLUDED.source_payload, imported_at = now()""",
                            (str(source_key), payload.get("company_name"), payload.get("registration_country"),
                             payload.get("status"), as_bool(payload.get("mock_record"), True), Jsonb(payload))
                        )

                    elif section == "sanctions":
                        cur.execute(
                            """INSERT INTO reasonchain_import.sanctions
                               (source_key, list_name, jurisdiction, status, mock_record,
                                source_payload, imported_at)
                               VALUES (%s, %s, %s, %s, %s, %s, now())
                               ON CONFLICT (source_key) DO UPDATE SET
                                list_name = EXCLUDED.list_name, jurisdiction = EXCLUDED.jurisdiction,
                                status = EXCLUDED.status, mock_record = EXCLUDED.mock_record,
                                source_payload = EXCLUDED.source_payload, imported_at = now()""",
                            (str(source_key), payload.get("list_name"), payload.get("jurisdiction"),
                             payload.get("status"), as_bool(payload.get("mock_record"), True), Jsonb(payload))
                        )

                    elif section == "relationships":
                        cur.execute(
                            """INSERT INTO reasonchain_import.relationship_claims
                               (source_key, relationship_type,
                                subject_entity_id, subject_entity_type, subject_source_key, subject_cin,
                                object_entity_id, object_entity_type, object_source_key, object_cin,
                                role, active, confidence, ownership_percentage, reason, affiliation_reason,
                                valid_from, valid_to, contract_id, source_system, is_synthetic,
                                source_payload, imported_at)
                               VALUES
                                (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now())
                               ON CONFLICT (source_key) DO UPDATE SET
                                relationship_type = EXCLUDED.relationship_type,
                                subject_entity_id = EXCLUDED.subject_entity_id,
                                subject_entity_type = EXCLUDED.subject_entity_type,
                                subject_source_key = EXCLUDED.subject_source_key,
                                subject_cin = EXCLUDED.subject_cin,
                                object_entity_id = EXCLUDED.object_entity_id,
                                object_entity_type = EXCLUDED.object_entity_type,
                                object_source_key = EXCLUDED.object_source_key,
                                object_cin = EXCLUDED.object_cin,
                                role = EXCLUDED.role, active = EXCLUDED.active,
                                confidence = EXCLUDED.confidence,
                                ownership_percentage = EXCLUDED.ownership_percentage,
                                reason = EXCLUDED.reason, affiliation_reason = EXCLUDED.affiliation_reason,
                                valid_from = EXCLUDED.valid_from, valid_to = EXCLUDED.valid_to,
                                contract_id = EXCLUDED.contract_id, source_system = EXCLUDED.source_system,
                                is_synthetic = EXCLUDED.is_synthetic,
                                source_payload = EXCLUDED.source_payload, imported_at = now()""",
                            (str(source_key), payload.get("relationship_type", "UNKNOWN"),
                             payload.get("from_entity_id"), payload.get("from_entity_type"),
                             payload.get("from_source_key"), payload.get("from_cin"),
                             payload.get("to_entity_id"), payload.get("to_entity_type"),
                             payload.get("to_source_key"), payload.get("to_cin"),
                             payload.get("role"), payload.get("active"), as_float(payload.get("confidence")),
                             as_float(payload.get("ownership_percentage")), payload.get("reason"),
                             payload.get("affiliation_reason"), as_date(payload.get("valid_from")),
                             as_date(payload.get("valid_to")), payload.get("contract_id"),
                             payload.get("to_source") or payload.get("from_source"),
                             as_bool(payload.get("mock_record"), True), Jsonb(payload))
                        )

            cur.execute(
                """UPDATE reasonchain_import.import_runs
                   SET status = 'SUCCEEDED', finished_at = now()
                   WHERE run_id = %s""",
                (run_id,)
            )
        # psycopg commits the transaction at context-manager exit.

    return run_id, counts, metadata

def main():
    parser = argparse.ArgumentParser(description="Import ReasonChain company_relationships export into Neon.")
    parser.add_argument("--file", required=True, help="Path to the exported Firebase company_relationships JSON file.")
    args = parser.parse_args()

    # Load backend/.env when running from the repository root, then allow a root .env override.
    backend_env = Path(__file__).resolve().parents[1] / ".env"
    if backend_env.exists():
        load_dotenv(backend_env)
    load_dotenv()
    database_url = os.getenv("NEON_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: Set NEON_DATABASE_URL (recommended) or DATABASE_URL in your .env file.", file=sys.stderr)
        return 2

    file_path = Path(args.file).expanduser().resolve()
    if not file_path.is_file():
        print(f"ERROR: JSON file not found: {file_path}", file=sys.stderr)
        return 2

    try:
        run_id, counts, metadata = import_data(database_url, file_path)
    except Exception as exc:
        print(f"IMPORT FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
        print("No success is claimed. Review the error before retrying.", file=sys.stderr)
        return 1

    print("\nIMPORT COMPLETED")
    print(f"Import run ID: {run_id}")
    print(f"Database schema: reasonchain_import")
    print("Imported source-section record counts:")
    for name, count in counts.items():
        print(f"  {name}: {count}")
    print(f"Dataset origin: {metadata.get('data_origin', 'unknown')}")
    print(f"Authoritative: {metadata.get('authoritative', 'unknown')}")
    print("WARNING: records marked synthetic in the source remain synthetic.")
    print("Company links reference Firebase company master records; the importer does not rewrite Firebase.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
