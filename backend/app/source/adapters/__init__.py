"""
Source Adapters Package
Houses source-specific connector adapters implementing BaseSourceAdapter.
"""

from app.source.adapters.firebase_adapter import FirebaseSourceAdapter
from app.source.adapters.postgres_adapter import PostgreSQLSourceAdapter

__all__ = [
    "FirebaseSourceAdapter",
    "PostgreSQLSourceAdapter",
]
