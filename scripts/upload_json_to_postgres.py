"""
ReasonChain — Upload JSON to PostgreSQL / Local Database Utility

Allows uploading any JSON file into:
1. An existing relational table (e.g. 'companies', 'suppliers', 'contracts', etc.)
   - Automatically maps JSON fields to table columns.
   - Handles arrays of records, dictionary-keyed records (like Firebase exports), or nested objects.
2. A raw JSONB table in PostgreSQL (or JSON text in SQLite)
   - Creates a table with a JSONB column for querying with PostgreSQL JSON operators (->, ->>).

Usage:
    python scripts/upload_json_to_postgres.py --file path/to/data.json --table companies
    python scripts/upload_json_to_postgres.py --file path/to/data.json --table raw_records --mode jsonb
    python scripts/upload_json_to_postgres.py --help
"""

import os
import sys
import json
import argparse
import logging
from typing import List, Dict, Any, Tuple

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE_DIR, "backend"))

from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("upload_json")


def get_db_connection() -> Tuple[Any, str]:
    """
    Connect to PostgreSQL using project settings, or fall back to SQLite demo database.
    Returns (connection, engine_type).
    """
    # 1. Try DATABASE_URL if provided
    if settings.DATABASE_URL:
        try:
            import psycopg2
            conn = psycopg2.connect(settings.DATABASE_URL, connect_timeout=5)
            logger.info("Connected to PostgreSQL via DATABASE_URL.")
            return conn, "postgresql"
        except Exception as e:
            logger.warning(f"DATABASE_URL connection failed: {e}. Trying host/port settings...")

    # 2. Try host/port credentials
    target_host = "127.0.0.1" if settings.POSTGRES_HOST == "localhost" else settings.POSTGRES_HOST
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
        logger.info(f"Connected to PostgreSQL database '{settings.POSTGRES_DB}' on {target_host}:{settings.POSTGRES_PORT}.")
        return conn, "postgresql"
    except Exception as e:
        logger.warning(f"Could not connect to PostgreSQL on {target_host}:{settings.POSTGRES_PORT} ({e}).")

    # 3. Fallback to SQLite
    sqlite_path = os.path.join(BASE_DIR, "backend", "reasonchain_demo.db")
    if os.path.exists(sqlite_path):
        import sqlite3
        conn = sqlite3.connect(sqlite_path)
        logger.info(f"Connected to fallback SQLite database at: {sqlite_path}")
        return conn, "sqlite"

    raise ConnectionError("Neither PostgreSQL nor SQLite demo database is accessible. Please check your database settings in .env.")


def parse_json_data(file_path: str, root_key: str = None) -> List[Dict[str, Any]]:
    """
    Read and normalize JSON into a list of record dictionaries.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"JSON file not found: {file_path}")

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if root_key and isinstance(data, dict) and root_key in data:
        data = data[root_key]

    if isinstance(data, list):
        records = []
        for idx, item in enumerate(data):
            if isinstance(item, dict):
                records.append(item)
            else:
                records.append({"id": idx, "value": item})
        return records

    elif isinstance(data, dict):
        records = []
        for key, value in data.items():
            if isinstance(value, dict):
                rec = dict(value)
                if "id" not in rec and "key" not in rec:
                    rec["id"] = key
                records.append(rec)
            elif isinstance(value, list) and not root_key:
                logger.info(f"Detected list under key '{key}'. Using key '{key}' as dataset.")
                return parse_json_data(file_path, root_key=key)
            else:
                records.append({"key": key, "value": value})
        return records
    else:
        raise ValueError(f"Unsupported JSON format: expected list or object, got {type(data)}")


def get_table_columns(conn, engine: str, table_name: str) -> List[str]:
    """Retrieve existing column names for a table."""
    cur = conn.cursor()
    if engine == "postgresql":
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = %s;
        """, (table_name,))
        cols = [row[0] for row in cur.fetchall()]
    else:
        cur.execute(f"PRAGMA table_info({table_name});")
        cols = [row[1] for row in cur.fetchall()]
    cur.close()
    return cols


def insert_relational(conn, engine: str, table_name: str, records: List[Dict[str, Any]], upsert: bool = True):
    """Insert JSON records into an existing relational table matching column names."""
    if not records:
        logger.warning("No records found to insert.")
        return 0

    columns = get_table_columns(conn, engine, table_name)
    if not columns:
        raise ValueError(f"Table '{table_name}' does not exist in the database. Use --mode jsonb to auto-create a table, or create the schema first.")

    logger.info(f"Target table '{table_name}' columns: {columns}")
    
    cur = conn.cursor()
    inserted_count = 0

    # Common field aliases
    aliases = {
        "id": ["id", "cin", "code", "company_id", "supplier_id", "person_id"],
        "name": ["name", "company_name", "full_name", "title"],
        "registration_number": ["registration_number", "cin", "reg_no"],
        "industry": ["industry", "industrial_classification", "category"],
        "country": ["country", "country_code", "indian_foreign_company"],
        "status": ["status", "company_status"],
    }

    for rec in records:
        matched_cols = []
        matched_vals = []
        for col in columns:
            val = None
            if col in rec:
                val = rec[col]
            else:
                for k, v in rec.items():
                    if k.lower() == col.lower():
                        val = v
                        break
                if val is None and col in aliases:
                    for alt in aliases[col]:
                        if alt in rec:
                            val = rec[alt]
                            break

            if val is not None:
                # Country normalization
                if col == "country" and str(val).lower() in ["india", "in"]:
                    val = "IN"

                matched_cols.append(col)
                if isinstance(val, (dict, list)):
                    matched_vals.append(json.dumps(val))
                else:
                    matched_vals.append(val)

        if not matched_cols:
            continue

        placeholders = ["%s"] * len(matched_cols) if engine == "postgresql" else ["?"] * len(matched_cols)
        cols_str = ", ".join(matched_cols)
        placeholders_str = ", ".join(placeholders)

        if engine == "postgresql":
            pk = "id" if "id" in matched_cols else matched_cols[0]
            if upsert and pk in matched_cols:
                updates = [f"{c} = EXCLUDED.{c}" for c in matched_cols if c != pk]
                if updates:
                    update_str = ", ".join(updates)
                    sql = f"INSERT INTO {table_name} ({cols_str}) VALUES ({placeholders_str}) ON CONFLICT ({pk}) DO UPDATE SET {update_str};"
                else:
                    sql = f"INSERT INTO {table_name} ({cols_str}) VALUES ({placeholders_str}) ON CONFLICT ({pk}) DO NOTHING;"
            else:
                sql = f"INSERT INTO {table_name} ({cols_str}) VALUES ({placeholders_str});"
            cur.execute(sql, matched_vals)
        else:
            sql = f"INSERT OR REPLACE INTO {table_name} ({cols_str}) VALUES ({placeholders_str});"
            cur.execute(sql, matched_vals)

        inserted_count += 1

    conn.commit()
    cur.close()
    return inserted_count


def insert_jsonb(conn, engine: str, table_name: str, records: List[Dict[str, Any]], source_file: str):
    """Insert JSON records into a raw JSONB table (or JSON text table in SQLite)."""
    cur = conn.cursor()
    
    if engine == "postgresql":
        create_sql = f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                id SERIAL PRIMARY KEY,
                source_file TEXT,
                data JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_{table_name}_data ON {table_name} USING GIN (data);
        """
        cur.execute(create_sql)
        insert_sql = f"INSERT INTO {table_name} (source_file, data) VALUES (%s, %s);"
        for rec in records:
            cur.execute(insert_sql, (os.path.basename(source_file), json.dumps(rec)))
    else:
        create_sql = f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_file TEXT,
                data TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """
        cur.executescript(create_sql)
        insert_sql = f"INSERT INTO {table_name} (source_file, data) VALUES (?, ?);"
        for rec in records:
            cur.execute(insert_sql, (os.path.basename(source_file), json.dumps(rec)))

    conn.commit()
    cur.close()
    return len(records)


def main():
    parser = argparse.ArgumentParser(description="Upload JSON file to PostgreSQL or ReasonChain Demo Database.")
    parser.add_argument("--file", "-f", required=True, help="Path to the JSON file to upload")
    parser.add_argument("--table", "-t", required=True, help="Target database table name (e.g. companies, suppliers, raw_json)")
    parser.add_argument("--mode", "-m", choices=["relational", "jsonb"], default="relational",
                        help="Upload mode: 'relational' (map to schema columns) or 'jsonb' (store as raw JSONB documents). Default: relational")
    parser.add_argument("--root-key", "-k", default=None, help="Optional top-level JSON key to extract")
    parser.add_argument("--no-upsert", action="store_true", help="Disable upsert/replace")

    args = parser.parse_args()

    file_path = os.path.abspath(args.file)
    logger.info(f"Loading JSON from: {file_path}")

    try:
        records = parse_json_data(file_path, root_key=args.root_key)
        logger.info(f"Parsed {len(records)} records from JSON.")
    except Exception as e:
        logger.error(f"Error parsing JSON file: {e}")
        sys.exit(1)

    try:
        conn, engine = get_db_connection()
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        sys.exit(1)

    try:
        if args.mode == "jsonb":
            count = insert_jsonb(conn, engine, args.table, records, file_path)
            logger.info(f"[SUCCESS] Uploaded {count} records into table '{args.table}' as JSONB on {engine.upper()}.")
        else:
            count = insert_relational(conn, engine, args.table, records, upsert=not args.no_upsert)
            logger.info(f"[SUCCESS] Uploaded {count} records into relational table '{args.table}' on {engine.upper()}.")

        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM {args.table};")
        total = cur.fetchone()[0]
        cur.close()
        logger.info(f"Total records now in table '{args.table}': {total}")

    except Exception as e:
        logger.error(f"Error uploading records: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
