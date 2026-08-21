"""
Data Normalizer for Ingestion Pipeline
Cleans and normalizes extracted PostgreSQL rows before Neo4j ingestion.
Does NOT destroy original values — adds normalized versions.
"""

import re
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger("reasonchain.ingestion")


def _trim(value: Any) -> Any:
    """Trim whitespace from string values."""
    if isinstance(value, str):
        return value.strip()
    return value


def _normalize_empty(value: Any) -> Optional[Any]:
    """Convert empty strings and 'None' strings to None."""
    if value is None:
        return None
    if isinstance(value, str):
        v = value.strip()
        if v == "" or v.lower() == "none" or v.lower() == "null":
            return None
        return v
    return value


def _normalize_name(name: str) -> str:
    """
    Create a canonical comparison key for entity resolution.
    - lowercase
    - strip whitespace
    - collapse multiple spaces
    - remove trailing Ltd/LTD/Inc/LLC etc for comparison
    """
    if not name:
        return ""
    n = name.strip().lower()
    n = re.sub(r'\s+', ' ', n)
    # Remove common suffixes for comparison key only
    suffixes = [' ltd.', ' ltd', ' llc', ' inc.', ' inc', ' sa', ' plc', ' corp', ' corp.']
    for suffix in suffixes:
        if n.endswith(suffix):
            n = n[:-len(suffix)].strip()
            break
    return n


def _normalize_country_code(code: Any) -> Optional[str]:
    """Normalize country codes to uppercase."""
    if code is None:
        return None
    return str(code).strip().upper()


def _normalize_date(date_val: Any) -> Optional[str]:
    """Normalize date strings to YYYY-MM-DD format."""
    if date_val is None:
        return None
    s = str(date_val).strip()
    if not s or s.lower() == "none":
        return None
    # Already in YYYY-MM-DD format
    if re.match(r'^\d{4}-\d{2}-\d{2}$', s):
        return s
    return s


def _normalize_confidence(conf: Any) -> Optional[float]:
    """Normalize confidence values to float."""
    if conf is None:
        return None
    try:
        return round(float(conf), 2)
    except (ValueError, TypeError):
        return None


def _ensure_str_id(value: Any) -> str:
    """Ensure ID values are strings."""
    if value is None:
        return ""
    return str(value).strip()


def normalize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a single row — trim all string values, normalize empties."""
    normalized = {}
    for key, value in row.items():
        normalized[key] = _normalize_empty(_trim(value))
    return normalized


def normalize_companies(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Normalize company records."""
    result = []
    for row in rows:
        r = normalize_row(row)
        r['id'] = _ensure_str_id(r.get('id'))
        r['country'] = _normalize_country_code(r.get('country'))
        r['_normalized_name'] = _normalize_name(r.get('name', ''))
        result.append(r)
    logger.info(f"[INGESTION] Normalized {len(result)} companies")
    return result


def normalize_suppliers(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    result = []
    for row in rows:
        r = normalize_row(row)
        r['id'] = _ensure_str_id(r.get('id'))
        r['country'] = _normalize_country_code(r.get('country'))
        r['_normalized_name'] = _normalize_name(r.get('name', ''))
        result.append(r)
    logger.info(f"[INGESTION] Normalized {len(result)} suppliers")
    return result


def normalize_people(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    result = []
    for row in rows:
        r = normalize_row(row)
        r['id'] = _ensure_str_id(r.get('id'))
        r['country'] = _normalize_country_code(r.get('country'))
        r['_normalized_name'] = _normalize_name(r.get('full_name', ''))
        result.append(r)
    logger.info(f"[INGESTION] Normalized {len(result)} people")
    return result


def normalize_countries(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    result = []
    for row in rows:
        r = normalize_row(row)
        r['code'] = _normalize_country_code(r.get('code'))
        result.append(r)
    logger.info(f"[INGESTION] Normalized {len(result)} countries")
    return result


def normalize_relationships(rows: List[Dict[str, Any]], name: str) -> List[Dict[str, Any]]:
    """Generic relationship normalizer."""
    result = []
    for row in rows:
        r = normalize_row(row)
        r['confidence'] = _normalize_confidence(r.get('confidence'))
        # Normalize all date fields
        for date_field in ['valid_from', 'valid_to', 'start_date', 'end_date', 'listed_date', 'delisted_date']:
            if date_field in r:
                r[date_field] = _normalize_date(r.get(date_field))
        result.append(r)
    logger.info(f"[INGESTION] Normalized {len(result)} {name}")
    return result


def find_potential_duplicates(entities: List[Dict[str, Any]], name_field: str = '_normalized_name') -> List[Dict[str, Any]]:
    """
    Simple deterministic entity resolution.
    Groups entities by normalized name to find potential duplicates.
    Does NOT auto-merge — returns groups for inspection.
    """
    from collections import defaultdict
    groups = defaultdict(list)
    for entity in entities:
        key = entity.get(name_field, '')
        if key:
            groups[key].append(entity)

    duplicates = []
    for key, group in groups.items():
        if len(group) > 1:
            duplicates.append({
                "normalized_key": key,
                "count": len(group),
                "ids": [e.get('id', e.get('code', '')) for e in group],
                "original_names": [e.get('name', e.get('full_name', '')) for e in group],
            })

    if duplicates:
        logger.info(f"[INGESTION] Entity resolution found {len(duplicates)} potential duplicate groups")
    return duplicates
