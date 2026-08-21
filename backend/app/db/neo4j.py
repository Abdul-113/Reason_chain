"""
Neo4j Graph Database Connection Manager
Handles driver lifecycle, sessions, transactions, and health checks.
"""

import logging
from typing import Optional, Dict, Any, List
from neo4j import GraphDatabase, Driver, Session
from neo4j.exceptions import ServiceUnavailable, AuthError
from app.core.config import settings

logger = logging.getLogger("reasonchain.neo4j")


class Neo4jConnection:
    """Singleton-style Neo4j driver manager."""

    _driver: Optional[Driver] = None

    @classmethod
    def get_driver(cls) -> Driver:
        """Get or create the Neo4j driver."""
        if cls._driver is None:
            cls._driver = GraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD),
                connection_timeout=5,
                max_transaction_retry_time=5,
            )
        return cls._driver

    @classmethod
    def close(cls):
        """Close the Neo4j driver."""
        if cls._driver is not None:
            cls._driver.close()
            cls._driver = None
            logger.info("Neo4j driver closed.")

    @classmethod
    def test_connection(cls) -> Dict[str, Any]:
        """Test Neo4j connectivity."""
        try:
            driver = cls.get_driver()
            driver.verify_connectivity()
            with driver.session(database=settings.NEO4J_DATABASE) as session:
                result = session.run("RETURN 1 AS ping")
                result.single()
            return {"success": True, "message": "Connected to Neo4j successfully.", "uri": settings.NEO4J_URI}
        except AuthError as e:
            return {"success": False, "message": f"Neo4j authentication failed: {e}"}
        except ServiceUnavailable as e:
            return {"success": False, "message": f"Neo4j service unavailable: {e}"}
        except Exception as e:
            return {"success": False, "message": f"Neo4j connection failed: {e}"}

    @classmethod
    def get_session(cls) -> Session:
        """Get a new Neo4j session."""
        driver = cls.get_driver()
        return driver.session(database=settings.NEO4J_DATABASE)

    @classmethod
    def execute_query(cls, query: str, parameters: Optional[Dict] = None) -> List[Dict[str, Any]]:
        """Execute a Cypher query and return results as list of dicts."""
        with cls.get_session() as session:
            result = session.run(query, parameters or {})
            return [record.data() for record in result]

    @classmethod
    def execute_write(cls, query: str, parameters: Optional[Dict] = None):
        """Execute a write Cypher query within a transaction."""
        with cls.get_session() as session:
            session.execute_write(lambda tx: tx.run(query, parameters or {}))

    @classmethod
    def execute_write_batch(cls, query: str, batch: List[Dict]):
        """Execute a batch write using UNWIND for efficiency."""
        with cls.get_session() as session:
            session.execute_write(lambda tx: tx.run(query, rows=batch))

    @classmethod
    def create_constraints(cls):
        """Create uniqueness constraints for all node types. Idempotent."""
        constraints = [
            "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Company) REQUIRE c.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (s:Supplier) REQUIRE s.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (ct:Contract) REQUIRE ct.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (sn:Sanction) REQUIRE sn.id IS UNIQUE",
            "CREATE CONSTRAINT IF NOT EXISTS FOR (co:Country) REQUIRE co.code IS UNIQUE",
        ]
        with cls.get_session() as session:
            for c in constraints:
                session.run(c)
        logger.info("Neo4j uniqueness constraints ensured.")
