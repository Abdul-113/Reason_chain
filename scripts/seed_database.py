"""
ReasonChain Database Seeder
Reads database/schema.sql and database/seed.sql and populates:
1. PostgreSQL database (if reachable via POSTGRES_* credentials)
2. SQLite fallback database at backend/reasonchain_demo.db (for zero-config local demo)
"""

import os
import sys
import sqlite3
import psycopg2

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE_DIR, "backend"))

from app.core.config import settings

SCHEMA_PATH = os.path.join(BASE_DIR, "database", "schema.sql")
SEED_PATH = os.path.join(BASE_DIR, "database", "seed.sql")
SQLITE_DB_PATH = os.path.join(BASE_DIR, "backend", "reasonchain_demo.db")

def read_sql_file(file_path: str) -> str:
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()

def seed_sqlite():
    """Seed local SQLite demo database."""
    print(f"Seeding SQLite fallback database at: {SQLITE_DB_PATH}...")
    os.makedirs(os.path.dirname(SQLITE_DB_PATH), exist_ok=True)
    if os.path.exists(SQLITE_DB_PATH):
        os.remove(SQLITE_DB_PATH)

    schema_sql = read_sql_file(SCHEMA_PATH)
    seed_sql = read_sql_file(SEED_PATH)

    conn = sqlite3.connect(SQLITE_DB_PATH)
    cur = conn.cursor()

    # SQLite compatible DDL modifications
    sqlite_schema = schema_sql.replace("NUMERIC(3,2)", "REAL") \
                              .replace("NUMERIC(5,2)", "REAL") \
                              .replace("NUMERIC(12,2)", "REAL") \
                              .replace("NUMERIC(14,2)", "REAL") \
                              .replace("CASCADE", "")

    cur.executescript(sqlite_schema)
    cur.executescript(seed_sql)
    conn.commit()

    # Verify table counts
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
    tables = cur.fetchall()
    print(f"[SUCCESS] SQLite database created with {len(tables)} tables:")
    for t in sorted(tables):
        cur.execute(f"SELECT COUNT(*) FROM {t[0]};")
        cnt = cur.fetchone()[0]
        print(f"   - {t[0]}: {cnt} records")

    conn.close()

def seed_postgres():
    """Seed PostgreSQL database if service is running."""
    host = settings.POSTGRES_HOST
    port = settings.POSTGRES_PORT
    user = settings.POSTGRES_USER
    password = settings.POSTGRES_PASSWORD
    dbname = settings.POSTGRES_DB

    print(f"Attempting to seed PostgreSQL '{dbname}' on {host}:{port}...")

    try:
        root_conn = psycopg2.connect(host=host, port=port, user=user, password=password, dbname="postgres", connect_timeout=1)
        root_conn.autocommit = True
        root_cur = root_conn.cursor()
        root_cur.execute(f"SELECT 1 FROM pg_database WHERE datname = '{dbname}'")
        exists = root_cur.fetchone()
        if not exists:
            root_cur.execute(f"CREATE DATABASE {dbname}")
            print(f"Created PostgreSQL database '{dbname}'")
        root_conn.close()
    except Exception as e:
        print(f"Notice: Could not connect to PostgreSQL server: {e}")
        return False

    try:
        conn = psycopg2.connect(host=host, port=port, user=user, password=password, dbname=dbname, connect_timeout=2)
        cur = conn.cursor()
        
        schema_sql = read_sql_file(SCHEMA_PATH)
        seed_sql = read_sql_file(SEED_PATH)

        cur.execute(schema_sql)
        cur.execute(seed_sql)
        conn.commit()

        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
        """)
        tables = cur.fetchall()
        print(f"[SUCCESS] PostgreSQL database '{dbname}' created with {len(tables)} tables:")
        for t in sorted(tables):
            cur.execute(f"SELECT COUNT(*) FROM {t[0]};")
            cnt = cur.fetchone()[0]
            print(f"   - {t[0]}: {cnt} records")

        conn.close()
        return True
    except Exception as e:
        print(f"PostgreSQL seeding failed: {e}")
        return False

if __name__ == "__main__":
    seed_sqlite()
    seed_postgres()
