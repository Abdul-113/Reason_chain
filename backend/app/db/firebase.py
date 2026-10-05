"""
Firebase Realtime Database Connection Manager
Handles server-side Firebase Admin SDK lifecycle, RTDB references, health checks, and data queries.
"""

import os
import logging
from typing import Optional, Dict, Any, List
import firebase_admin
from firebase_admin import credentials, db
from app.core.config import settings

logger = logging.getLogger("reasonchain.firebase")


class FirebaseConnection:
    """Singleton-style Firebase Admin SDK & Realtime Database manager."""

    _app: Optional[firebase_admin.App] = None
    _app_name: str = "[DEFAULT]"

    @classmethod
    def _resolve_service_account_path(cls, custom_path: Optional[str] = None) -> Optional[str]:
        """Resolve absolute path to the service account JSON credential file."""
        path_to_try = custom_path or settings.FIREBASE_SERVICE_ACCOUNT_JSON_PATH
        if not path_to_try:
            return None

        # Check direct path
        if os.path.isabs(path_to_try) and os.path.exists(path_to_try):
            return path_to_try

        # Check relative to current working directory
        if os.path.exists(path_to_try):
            return os.path.abspath(path_to_try)

        # Check relative to backend directory
        backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        joined_path = os.path.join(backend_dir, path_to_try)
        if os.path.exists(joined_path):
            return os.path.abspath(joined_path)

        # Check basename in backend directory
        basename_path = os.path.join(backend_dir, os.path.basename(path_to_try))
        if os.path.exists(basename_path):
            return os.path.abspath(basename_path)

        return None

    @classmethod
    def get_app(cls, service_account_path: Optional[str] = None, database_url: Optional[str] = None) -> firebase_admin.App:
        """Get or initialize the Firebase Admin SDK application."""
        # If already initialized and no custom overrides requested, return existing app
        if cls._app is not None and not service_account_path and not database_url:
            return cls._app

        target_url = database_url or settings.FIREBASE_DATABASE_URL
        if not target_url:
            raise ValueError("FIREBASE_DATABASE_URL is not configured in settings or environment.")

        resolved_path = cls._resolve_service_account_path(service_account_path)
        if not resolved_path:
            raise FileNotFoundError(
                f"Firebase service account JSON file not found at: {service_account_path or settings.FIREBASE_SERVICE_ACCOUNT_JSON_PATH}"
            )

        # Check if default app is already initialized in firebase_admin
        try:
            cls._app = firebase_admin.get_app()
        except ValueError:
            # Initialize with service account credentials
            cred = credentials.Certificate(resolved_path)
            cls._app = firebase_admin.initialize_app(cred, {
                "databaseURL": target_url
            })
            logger.info("Firebase Admin SDK initialized successfully with databaseURL: %s", target_url)

        return cls._app

    @classmethod
    def close(cls):
        """Close/delete the Firebase Admin app instance."""
        if cls._app is not None:
            try:
                firebase_admin.delete_app(cls._app)
            except Exception as e:
                logger.warning("Error closing Firebase app: %s", e)
            cls._app = None
            logger.info("Firebase Admin app closed.")

    @classmethod
    def test_connection(cls, service_account_path: Optional[str] = None, database_url: Optional[str] = None) -> Dict[str, Any]:
        """Test Firebase Realtime Database connectivity."""
        try:
            cls.get_app(service_account_path=service_account_path, database_url=database_url)
            # Perform a fast shallow read at root to verify access permissions
            root_ref = db.reference("/")
            shallow_data = root_ref.get(shallow=True)

            collections = list(shallow_data.keys()) if isinstance(shallow_data, dict) else []
            return {
                "success": True,
                "message": "Successfully connected to Firebase Realtime Database.",
                "database_url": database_url or settings.FIREBASE_DATABASE_URL,
                "collections": collections,
                "total_collections": len(collections),
            }
        except Exception as e:
            logger.error("Firebase connection test failed: %s", e)
            return {
                "success": False,
                "message": f"Firebase connection failed: {str(e)}",
                "database_url": database_url or settings.FIREBASE_DATABASE_URL,
                "collections": [],
                "total_collections": 0,
            }

    @classmethod
    def get_reference(cls, path: str = "/"):
        """Get a database Reference for the given path."""
        cls.get_app()
        return db.reference(path)

    @classmethod
    def list_paths(cls) -> List[Dict[str, Any]]:
        """List top-level paths/collections and their child counts."""
        cls.get_app()
        root_ref = db.reference("/")
        shallow_data = root_ref.get(shallow=True)

        if not isinstance(shallow_data, dict):
            return []

        results = []
        for path_name in shallow_data.keys():
            is_synthetic = (path_name == "company_relationships")
            if path_name == "companies":
                desc = "REAL company data"
            elif path_name == "company_relationships":
                desc = "Synthetic/test relationship data"
            elif path_name == "company_reference":
                desc = "Company reference dataset"
            else:
                desc = f"Firebase collection /{path_name}"

            try:
                child_ref = db.reference(f"/{path_name}")
                child_shallow = child_ref.get(shallow=True)
                count = len(child_shallow) if isinstance(child_shallow, dict) else 1
                results.append({
                    "path": f"/{path_name}",
                    "name": path_name,
                    "record_count": count,
                    "is_synthetic": is_synthetic,
                    "description": desc,
                })
            except Exception as err:
                logger.warning("Error fetching count for path %s: %s", path_name, err)
                results.append({
                    "path": f"/{path_name}",
                    "name": path_name,
                    "record_count": 0,
                    "is_synthetic": is_synthetic,
                    "description": desc,
                })

        return results

    @classmethod
    def get_sample_records(cls, path: str, limit: int = 10) -> Dict[str, Any]:
        """Fetch sample records and schema from a given Realtime Database path."""
        cls.get_app()
        clean_path = f"/{path.strip('/')}"
        ref = db.reference(clean_path)

        # Query limited records
        data = ref.order_by_key().limit_to_first(limit).get()

        records: List[Dict[str, Any]] = []
        fields_set = set()

        if isinstance(data, dict):
            for key, val in data.items():
                if isinstance(val, dict):
                    rec = {"_key": key, **val}
                    fields_set.update(val.keys())
                else:
                    rec = {"_key": key, "value": val}
                    fields_set.add("value")
                records.append(rec)
        elif isinstance(data, list):
            for idx, val in enumerate(data):
                if val is not None:
                    if isinstance(val, dict):
                        rec = {"_index": idx, **val}
                        fields_set.update(val.keys())
                    else:
                        rec = {"_index": idx, "value": val}
                        fields_set.add("value")
                    records.append(rec)

        fields = sorted(list(fields_set))
        return {
            "path": clean_path,
            "sample_count": len(records),
            "fields": fields,
            "sample_records": records
        }

    @classmethod
    def read_all_records(cls, path: str) -> Dict[str, Any]:
        """Read all records under a path."""
        cls.get_app()
        clean_path = f"/{path.strip('/')}"
        ref = db.reference(clean_path)
        data = ref.get()
        return data if isinstance(data, dict) else {}

    @classmethod
    def get_status(cls) -> Dict[str, Any]:
        """Return the configuration status of the Firebase connector."""
        import json
        resolved_path = cls._resolve_service_account_path()
        project_id = None

        if resolved_path:
            try:
                with open(resolved_path, "r", encoding="utf-8") as f:
                    sa_data = json.load(f)
                    project_id = sa_data.get("project_id")
            except Exception:
                pass

        is_configured = bool(settings.FIREBASE_DATABASE_URL and resolved_path)
        return {
            "status": "ready" if is_configured else "unconfigured",
            "is_configured": is_configured,
            "database_url": settings.FIREBASE_DATABASE_URL if settings.FIREBASE_DATABASE_URL else None,
            "project_id": project_id,
            "service_account_found": bool(resolved_path)
        }

