"""
Data Ingestion Service
Manages connection verification, table discovery, and schema preview for PostgreSQL databases.
"""
from typing import List, Dict, Any
from app.db import postgres
from app.core.config import settings

class IngestionService:
    @staticmethod
    def test_postgres_connection(
        host: str = settings.POSTGRES_HOST,
        port: int = settings.POSTGRES_PORT,
        database: str = settings.POSTGRES_DB,
        username: str = settings.POSTGRES_USER,
        password: str = settings.POSTGRES_PASSWORD
    ) -> Dict[str, Any]:
        """Tests database connection parameters."""
        return postgres.test_connection_params(host, port, database, username, password)

    @staticmethod
    def list_available_tables(
        host: str = settings.POSTGRES_HOST,
        port: int = settings.POSTGRES_PORT,
        database: str = settings.POSTGRES_DB,
        username: str = settings.POSTGRES_USER,
        password: str = settings.POSTGRES_PASSWORD
    ) -> List[Dict[str, Any]]:
        """Lists tables and record counts from target database."""
        return postgres.list_database_tables(host, port, database, username, password)

    @staticmethod
    def get_table_schema_and_samples(
        table_name: str,
        host: str = settings.POSTGRES_HOST,
        port: int = settings.POSTGRES_PORT,
        database: str = settings.POSTGRES_DB,
        username: str = settings.POSTGRES_USER,
        password: str = settings.POSTGRES_PASSWORD
    ) -> Dict[str, Any]:
        """Gets table columns and preview rows."""
        return postgres.get_table_details(host, port, database, username, password, table_name)
