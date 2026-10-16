"""
PostgreSQL & Relational Source API Routes
Provides endpoints for PostgreSQL connection health, accurate table row counts,
safe paginated table inspection, relationship claim exploration, import batch tracking,
and controlled replacement import from Firebase relationship export.
"""

import json
import logging
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, Query, Path
from pydantic import BaseModel, Field

from app.core.config import settings
from app.ingestion.postgres_reader import _get_connection
from app.ingestion.firebase_relationship_importer import (
    execute_import_transaction,
    DEFAULT_EXPORT_PATH,
)

logger = logging.getLogger("reasonchain.postgres.api")

router = APIRouter(prefix="/api/postgres", tags=["PostgreSQL Database Explorer"])

# Whitelist of allowed tables to prevent SQL injection
ALLOWED_TABLES = {
    "import_runs",
    "import_batches",
    "company_links",
    "companies",
    "external_companies",
    "people",
    "suppliers",
    "contracts",
    "sanctions",
    "relationship_claims",
    "company_directors",
    "supplier_relationships",
    "ownership",
    "countries",
    "raw_records",
    "source_metadata",
}


class ReplaceImportRequest(BaseModel):
    file_path: Optional[str] = Field(default=None, description="Path to company_relationships-export.json")
    force_replace: bool = Field(default=True, description="Replace existing demo records safely with backup")


@router.get("/status")
def get_postgres_status() -> Dict[str, Any]:
    """
    Get comprehensive PostgreSQL database status, connection health,
    active dataset summary, import batch, and synthetic data warnings.
    Never exposes passwords or sensitive credentials.
    """
    try:
        conn, engine = _get_connection()
        cur = conn.cursor()
        try:
            cur.execute("SET search_path TO reasonchain_import, public;")
        except Exception:
            pass

        # 1. Fetch tables and row counts
        tables_summary = []
        for tbl in sorted(ALLOWED_TABLES):
            try:
                cur.execute(f"SELECT COUNT(*) FROM {tbl};")
                cnt = cur.fetchone()[0]
                tables_summary.append({"table_name": tbl, "row_count": cnt})
            except Exception:
                pass

        # 2. Fetch latest import batch (check reasonchain_import.import_runs first, then import_batches)
        latest_batch = None
        try:
            cur.execute("""
                SELECT run_id AS batch_id, 'Neon PostgreSQL' AS source_system, source_path,
                       'reasonchain_import' AS schema_version, NULL AS content_hash,
                       finished_at AS imported_at, section_counts AS record_counts,
                       TRUE AS is_synthetic, authoritative AS is_authoritative, status
                FROM import_runs
                ORDER BY started_at DESC LIMIT 1;
            """)
            row = cur.fetchone()
            if row:
                cols = [desc[0] for desc in cur.description]
                batch_dict = dict(zip(cols, row))
                if isinstance(batch_dict.get("record_counts"), str):
                    try:
                        batch_dict["record_counts"] = json.loads(batch_dict["record_counts"])
                    except Exception:
                        pass
                latest_batch = batch_dict
        except Exception:
            pass

        if not latest_batch:
            try:
                cur.execute("""
                    SELECT batch_id, source_system, source_path, schema_version, content_hash,
                           imported_at, record_counts, is_synthetic, is_authoritative, status
                    FROM import_batches
                    ORDER BY imported_at DESC LIMIT 1;
                """)
                row = cur.fetchone()
                if row:
                    cols = [desc[0] for desc in cur.description]
                    batch_dict = dict(zip(cols, row))
                    if isinstance(batch_dict.get("record_counts"), str):
                        try:
                            batch_dict["record_counts"] = json.loads(batch_dict["record_counts"])
                        except Exception:
                            pass
                    latest_batch = batch_dict
            except Exception:
                pass

        # 3. Entity and relationship counts
        total_companies = 0
        total_external_companies = 0
        total_people = 0
        total_suppliers = 0
        total_relationships = 0
        unresolved_links = 0
        resolved_links = 0

        try:
            cur.execute("SELECT COUNT(*) FROM company_links;")
            total_companies = cur.fetchone()[0]
        except Exception:
            try:
                cur.execute("SELECT COUNT(*) FROM companies;")
                total_companies = cur.fetchone()[0]
            except Exception:
                pass

        try:
            cur.execute("SELECT COUNT(*) FROM external_companies;")
            total_external_companies = cur.fetchone()[0]
        except Exception:
            pass

        try:
            cur.execute("SELECT COUNT(*) FROM people;")
            total_people = cur.fetchone()[0]
        except Exception:
            pass

        try:
            cur.execute("SELECT COUNT(*) FROM suppliers;")
            total_suppliers = cur.fetchone()[0]
        except Exception:
            pass

        try:
            cur.execute("SELECT COUNT(*) FROM relationship_claims;")
            total_relationships = cur.fetchone()[0]
        except Exception:
            pass

        try:
            # Check for resolution_status or cin presence
            cur.execute("SELECT COUNT(*) FROM company_links WHERE cin IS NOT NULL AND cin != '';")
            resolved_links = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM company_links WHERE cin IS NULL OR cin = '';")
            unresolved_links = cur.fetchone()[0]
        except Exception:
            pass

        conn.close()

        total_entities = total_companies + total_external_companies + total_people + total_suppliers

        return {
            "success": True,
            "connected": True,
            "engine": engine,
            "database_name": "neondb (reasonchain_import)" if "neon.tech" in settings.DATABASE_URL else (settings.POSTGRES_DB if engine == "postgresql" else "reasonchain_demo.db"),
            "host_display": "Neon Serverless PostgreSQL (AWS us-east-2)" if "neon.tech" in settings.DATABASE_URL else (f"{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}" if engine == "postgresql" else "Local SQLite Fallback (Zero-Config)"),
            "total_tables": len(tables_summary),
            "tables": tables_summary,
            "total_entities": total_entities,
            "entity_breakdown": {
                "companies": total_companies,
                "external_companies": total_external_companies,
                "people": total_people,
                "suppliers": total_suppliers,
            },
            "total_relationship_claims": total_relationships,
            "company_links_resolved": resolved_links,
            "company_links_unresolved": unresolved_links,
            "latest_import_batch": latest_batch,
            "is_synthetic": True,
            "warning": "Synthetic demonstration data — relationships are not verified real-world facts.",
        }

    except Exception as e:
        logger.error(f"Error checking database status: {e}")
        return {
            "success": False,
            "connected": False,
            "error": str(e),
            "database_name": settings.POSTGRES_DB,
            "host_display": f"{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}",
            "tables": [],
            "total_entities": 0,
            "total_relationship_claims": 0,
            "is_synthetic": True,
            "warning": "Synthetic demonstration data — relationships are not verified real-world facts.",
        }


@router.get("/tables")
def list_tables() -> Dict[str, Any]:
    """List all available tables and exact row counts."""
    conn, engine = _get_connection()
    cur = conn.cursor()
    tables = []

    for tbl in sorted(ALLOWED_TABLES):
        try:
            cur.execute(f"SELECT COUNT(*) FROM {tbl};")
            cnt = cur.fetchone()[0]
            tables.append({
                "table_name": tbl,
                "row_count": cnt,
                "is_synthetic": tbl not in ["companies", "countries"],
            })
        except Exception:
            pass

    conn.close()
    return {
        "success": True,
        "tables": tables,
        "total_tables": len(tables),
        "engine": engine,
    }


@router.get("/table/{table_name}")
def get_table_data(
    table_name: str = Path(..., description="Name of the table to inspect"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Rows per page"),
    search: Optional[str] = Query(default=None, description="Optional search term"),
) -> Dict[str, Any]:
    """
    Safely inspect rows of a table with server-side pagination and column schemas.
    """
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(status_code=400, detail=f"Table '{table_name}' is not in the allowed table registry.")

    conn, engine = _get_connection()
    cur = conn.cursor()

    try:
        # Get column schema
        if engine == "postgresql":
            cur.execute("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = %s ORDER BY ordinal_position;
            """, (table_name,))
            columns = [{"name": r[0], "type": r[1]} for r in cur.fetchall()]
        else:
            cur.execute(f"PRAGMA table_info({table_name});")
            columns = [{"name": r[1], "type": r[2]} for r in cur.fetchall()]

        # Count total rows
        count_sql = f"SELECT COUNT(*) FROM {table_name}"
        params: List[Any] = []

        # If search query provided, search in text/char columns
        if search:
            text_cols = [c["name"] for c in columns if any(t in c["type"].lower() for t in ["char", "text", "str"])]
            if text_cols:
                clauses = [f"{c} LIKE ?" if engine != "postgresql" else f"{c} ILIKE %s" for c in text_cols]
                search_clause = " OR ".join(clauses)
                count_sql += f" WHERE ({search_clause})"
                params.extend([f"%{search}%"] * len(text_cols))

        cur.execute(count_sql, params)
        total_rows = cur.fetchone()[0]

        # Fetch paginated rows
        offset = (page - 1) * page_size
        fetch_sql = f"SELECT * FROM {table_name}"
        fetch_params: List[Any] = list(params)

        if search and text_cols:
            fetch_sql += f" WHERE ({search_clause})"

        fetch_sql += f" LIMIT {page_size} OFFSET {offset}"
        cur.execute(fetch_sql, fetch_params)

        col_names = [c["name"] for c in columns]
        raw_rows = cur.fetchall()
        rows = []

        for r in raw_rows:
            d = dict(zip(col_names, r))
            # Format JSON string fields for readability
            for k, v in d.items():
                if isinstance(v, str) and (v.startswith("{") or v.startswith("[")):
                    try:
                        d[k] = json.loads(v)
                    except Exception:
                        pass
            rows.append(d)

        total_pages = (total_rows + page_size - 1) // page_size if total_rows > 0 else 1

        return {
            "table_name": table_name,
            "engine": engine,
            "columns": columns,
            "total_rows": total_rows,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "rows": rows,
        }

    finally:
        conn.close()


@router.get("/relationships")
def get_relationship_claims(
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    relationship_type: Optional[str] = Query(default=None, description="Filter by type (DIRECTOR_OF, SUPPLIES, OWNS, etc.)"),
    search: Optional[str] = Query(default=None, description="Search by entity or key"),
) -> Dict[str, Any]:
    """
    Get all 20 imported relationship claims with resolved subjects, objects,
    confidence values, dates, and raw JSON payloads.
    """
    conn, engine = _get_connection()
    cur = conn.cursor()

    try:
        where_clauses = []
        params: List[Any] = []

        if relationship_type:
            where_clauses.append("relationship_type = ?" if engine != "postgresql" else "relationship_type = %s")
            params.append(relationship_type)

        if search:
            term = f"%{search}%"
            clause = "(relationship_id LIKE ? OR from_entity_id LIKE ? OR to_entity_id LIKE ? OR role LIKE ?)" if engine != "postgresql" else "(relationship_id ILIKE %s OR from_entity_id ILIKE %s OR to_entity_id ILIKE %s OR role ILIKE %s)"
            where_clauses.append(clause)
            params.extend([term, term, term, term])

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        cur.execute(f"SELECT COUNT(*) FROM relationship_claims {where_sql};", params)
        total = cur.fetchone()[0]

        offset = (page - 1) * page_size
        query = f"""
            SELECT * FROM relationship_claims
            {where_sql}
            ORDER BY relationship_id ASC
            LIMIT {page_size} OFFSET {offset};
        """
        cur.execute(query, params)

        cols = [desc[0] for desc in cur.description]
        claims = []
        for r in cur.fetchall():
            item = dict(zip(cols, r))
            if isinstance(item.get("raw_payload"), str):
                try:
                    item["raw_payload"] = json.loads(item["raw_payload"])
                except Exception:
                    pass
            claims.append(item)

        total_pages = (total + page_size - 1) // page_size if total > 0 else 1

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "claims": claims,
            "is_synthetic": True,
            "warning": "Synthetic demonstration data — relationships are not verified real-world facts.",
        }

    finally:
        conn.close()


@router.get("/batches")
def list_import_batches() -> Dict[str, Any]:
    """List import batches and audit history."""
    conn, engine = _get_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM import_batches ORDER BY imported_at DESC;")
        cols = [desc[0] for desc in cur.description]
        batches = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            if isinstance(d.get("record_counts"), str):
                try:
                    d["record_counts"] = json.loads(d["record_counts"])
                except Exception:
                    pass
            batches.append(d)
        return {"batches": batches, "total_batches": len(batches)}
    finally:
        conn.close()


@router.post("/replace-import")
def run_replace_import(req: ReplaceImportRequest = ReplaceImportRequest()) -> Dict[str, Any]:
    """
    Trigger the safe, controlled replacement import from the Firebase relationship JSON export.
    Backs up existing target dataset, removes previous demo records in foreign-key order,
    resolves company links against Firebase /companies, and imports all entities and relationships.
    """
    file_path = req.file_path or DEFAULT_EXPORT_PATH
    try:
        result = execute_import_transaction(file_path=file_path, force_replace=req.force_replace)
        return result
    except Exception as e:
        logger.error(f"Replacement import failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Replacement import failed: {str(e)}")
