"""
PostgreSQL Data Reader for Ingestion Pipeline
Extracts all tables from the source database as lists of dictionaries.
Supports PostgreSQL (primary) and SQLite (fallback).
"""

import logging
from typing import List, Dict, Any
from app.db.postgres import (
    is_postgres_port_open,
    SQLITE_DEMO_PATH,
)
from app.core.config import settings

logger = logging.getLogger("reasonchain.ingestion")


def _get_connection():
    """Get a database connection — Supabase/PostgreSQL (primary) or SQLite fallback."""
    import os
    if settings.DATABASE_URL:
        # Try psycopg v3 first, then psycopg2
        try:
            import psycopg
            conn = psycopg.connect(settings.DATABASE_URL, connect_timeout=10, autocommit=True)
            try:
                with conn.cursor() as cur:
                    cur.execute("SET search_path TO reasonchain_import, public;")
            except Exception:
                pass
            return conn, "postgresql"
        except Exception as e_v3:
            try:
                import psycopg2
                conn = psycopg2.connect(settings.DATABASE_URL, connect_timeout=5)
                conn.autocommit = True
                try:
                    cur = conn.cursor()
                    cur.execute("SET search_path TO reasonchain_import, public;")
                except Exception:
                    pass
                return conn, "postgresql"
            except Exception as e:
                logger.warning(f"[INGESTION] DATABASE_URL connection failed: {e_v3} / {e}. Trying host/port configuration.")

    target_host = "127.0.0.1" if settings.POSTGRES_HOST == "localhost" else settings.POSTGRES_HOST
    if is_postgres_port_open(target_host, settings.POSTGRES_PORT):
        try:
            import psycopg2
            conn = psycopg2.connect(
                host=target_host,
                port=settings.POSTGRES_PORT,
                dbname=settings.POSTGRES_DB,
                user=settings.POSTGRES_USER,
                password=settings.POSTGRES_PASSWORD,
                connect_timeout=3,
            )
            return conn, "postgresql"
        except Exception as e:
            logger.warning(f"[INGESTION] PostgreSQL connection attempt failed ({e}). Falling back to SQLite database.")

    if os.path.exists(SQLITE_DEMO_PATH):
        import sqlite3
        conn = sqlite3.connect(SQLITE_DEMO_PATH)
        conn.row_factory = sqlite3.Row
        return conn, "sqlite"
    else:
        raise ConnectionError("Neither PostgreSQL nor SQLite demo database is available.")



def _rows_to_dicts(cursor, engine: str) -> List[Dict[str, Any]]:
    """Convert cursor results to list of dicts."""
    if engine == "postgresql":
        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    else:
        return [dict(row) for row in cursor.fetchall()]


def extract_countries() -> List[Dict[str, Any]]:
    conn, engine = _get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM countries")
    rows = _rows_to_dicts(cur, engine)
    conn.close()
    logger.info(f"[INGESTION] Extracted {len(rows)} countries")
    return rows


def extract_companies() -> List[Dict[str, Any]]:
    conn, engine = _get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM companies")
    rows = _rows_to_dicts(cur, engine)
    conn.close()
    logger.info(f"[INGESTION] Extracted {len(rows)} companies")
    return rows


def extract_suppliers() -> List[Dict[str, Any]]:
    conn, engine = _get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM suppliers")
    rows = _rows_to_dicts(cur, engine)
    conn.close()
    logger.info(f"[INGESTION] Extracted {len(rows)} suppliers")
    return rows


def extract_people() -> List[Dict[str, Any]]:
    conn, engine = _get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM people")
    rows = _rows_to_dicts(cur, engine)
    conn.close()
    logger.info(f"[INGESTION] Extracted {len(rows)} people")
    return rows


def extract_company_directors() -> List[Dict[str, Any]]:
    conn, engine = _get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM company_directors")
    rows = _rows_to_dicts(cur, engine)
    conn.close()
    logger.info(f"[INGESTION] Extracted {len(rows)} company_directors")
    return rows


def extract_supplier_relationships() -> List[Dict[str, Any]]:
    conn, engine = _get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM supplier_relationships")
    rows = _rows_to_dicts(cur, engine)
    conn.close()
    logger.info(f"[INGESTION] Extracted {len(rows)} supplier_relationships")
    return rows


def extract_ownership() -> List[Dict[str, Any]]:
    conn, engine = _get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM ownership")
    rows = _rows_to_dicts(cur, engine)
    conn.close()
    logger.info(f"[INGESTION] Extracted {len(rows)} ownership records")
    return rows


def extract_contracts() -> List[Dict[str, Any]]:
    conn, engine = _get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM contracts")
    rows = _rows_to_dicts(cur, engine)
    conn.close()
    logger.info(f"[INGESTION] Extracted {len(rows)} contracts")
    return rows


def extract_sanctions() -> List[Dict[str, Any]]:
    conn, engine = _get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM sanctions")
    rows = _rows_to_dicts(cur, engine)
    conn.close()
    logger.info(f"[INGESTION] Extracted {len(rows)} sanctions")
    return rows
