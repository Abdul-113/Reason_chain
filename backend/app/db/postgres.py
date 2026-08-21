"""
PostgreSQL Database Interface & Metadata Handler
Supports active PostgreSQL instance connection, schema extraction, and SQLite demo fallback.
"""

import os
import socket
import sqlite3
import psycopg2
from typing import Dict, Any, List
from app.core.config import settings

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SQLITE_DEMO_PATH = os.path.abspath(os.path.join(CURRENT_DIR, "..", "..", "reasonchain_demo.db"))

def is_postgres_port_open(host: str, port: int, timeout: float = 0.3) -> bool:
    """Fast non-blocking socket check to see if PostgreSQL port is open."""
    try:
        target_host = "127.0.0.1" if host == "localhost" else host
        with socket.create_connection((target_host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False

def test_connection_params(host: str, port: int, database: str, username: str, password: str) -> Dict[str, Any]:
    """Test connection to PostgreSQL database (or fallback demo DB)."""
    if settings.DATABASE_URL:
        try:
            conn = psycopg2.connect(settings.DATABASE_URL, connect_timeout=3)
            conn.close()
            return {"success": True, "message": "Successfully connected to PostgreSQL database via DATABASE_URL.", "engine": "postgresql"}
        except Exception as e:
            pass

    target_host = "127.0.0.1" if host == "localhost" else host
    if is_postgres_port_open(target_host, port):
        try:
            conn = psycopg2.connect(
                host=target_host,
                port=port,
                dbname=database,
                user=username,
                password=password,
                connect_timeout=1
            )
            conn.close()
            return {"success": True, "message": "Successfully connected to PostgreSQL database.", "engine": "postgresql"}
        except Exception as e:
            return {"success": False, "message": f"PostgreSQL connection failed: {str(e)}", "engine": "postgresql"}
    
    # Fallback to SQLite demo database if postgres port is closed
    if os.path.exists(SQLITE_DEMO_PATH):
        return {
            "success": True,
            "message": f"Connected to ReasonChain Demo Database (Engine: SQLite fallback). Postgres port {port} is inactive.",
            "engine": "sqlite"
        }
    return {"success": False, "message": f"PostgreSQL port {port} is unreachable and no demo database found.", "engine": "postgresql"}

def list_database_tables(host: str, port: int, database: str, username: str, password: str) -> List[Dict[str, Any]]:
    """Fetch table names and row counts from database."""
    target_host = "127.0.0.1" if host == "localhost" else host
    if is_postgres_port_open(target_host, port):
        try:
            conn = psycopg2.connect(
                host=target_host,
                port=port,
                dbname=database,
                user=username,
                password=password,
                connect_timeout=1
            )
            cur = conn.cursor()
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
            """)
            tables = [row[0] for row in cur.fetchall()]
            
            result = []
            for t in tables:
                cur.execute(f"SELECT COUNT(*) FROM {t};")
                count = cur.fetchone()[0]
                result.append({"table_name": t, "row_count": count})
            conn.close()
            return result
        except Exception:
            pass

    # SQLite fallback
    if os.path.exists(SQLITE_DEMO_PATH):
        conn = sqlite3.connect(SQLITE_DEMO_PATH)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
        tables = [row[0] for row in cur.fetchall()]
        result = []
        for t in tables:
            cur.execute(f"SELECT COUNT(*) FROM {t};")
            count = cur.fetchone()[0]
            result.append({"table_name": t, "row_count": count})
        conn.close()
        return result
    return []

def get_table_details(host: str, port: int, database: str, username: str, password: str, table_name: str) -> Dict[str, Any]:
    """Fetch columns and sample data rows for a specific table."""
    target_host = "127.0.0.1" if host == "localhost" else host
    if is_postgres_port_open(target_host, port):
        try:
            conn = psycopg2.connect(
                host=target_host,
                port=port,
                dbname=database,
                user=username,
                password=password,
                connect_timeout=1
            )
            cur = conn.cursor()
            cur.execute(f"""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = '{table_name}';
            """)
            columns = [{"name": row[0], "type": row[1]} for row in cur.fetchall()]
            cur.execute(f"SELECT * FROM {table_name} LIMIT 10;")
            rows = [list(row) for row in cur.fetchall()]
            conn.close()
            return {"table_name": table_name, "columns": columns, "sample_rows": rows}
        except Exception:
            pass

    if os.path.exists(SQLITE_DEMO_PATH):
        conn = sqlite3.connect(SQLITE_DEMO_PATH)
        cur = conn.cursor()
        cur.execute(f"PRAGMA table_info({table_name});")
        columns = [{"name": row[1], "type": row[2]} for row in cur.fetchall()]
        cur.execute(f"SELECT * FROM {table_name} LIMIT 10;")
        rows = [list(row) for row in cur.fetchall()]
        conn.close()
        return {"table_name": table_name, "columns": columns, "sample_rows": rows}
    return {"table_name": table_name, "columns": [], "sample_rows": []}
