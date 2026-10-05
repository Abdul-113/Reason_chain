"""
Universal Entity Resolution — Pre-Resolution Normalizers
Pure normalization functions applied to record attributes BEFORE identity comparison.

CRITICAL DISTINCTION:
- Normalization ≠ Resolution
- Normalization cleans/standardizes values (lowercasing, stripping, abbreviation expansion)
- Resolution determines if two records refer to the same real-world entity

All normalizers are pure functions with no source-specific logic.
"""

import re
from typing import Any, Callable, Dict, List, Optional


# ========================================================================
# NORMALIZER FUNCTIONS
# ========================================================================

# Common legal suffixes to strip from company names
_LEGAL_SUFFIXES = [
    r'\bprivate\s+limited\b',
    r'\bpvt\.?\s*ltd\.?\b',
    r'\bpvt\b',
    r'\blimited\b',
    r'\bltd\.?\b',
    r'\bincorporated\b',
    r'\binc\.?\b',
    r'\bcorporation\b',
    r'\bcorp\.?\b',
    r'\bllc\.?\b',
    r'\bllp\.?\b',
    r'\b& co\.?\b',
    r'\band company\b',
    r'\b\(opc\)\b',       # One Person Company
    r'\bopc\b',
]

# Compiled pattern for legal suffix removal
_LEGAL_SUFFIX_PATTERN = re.compile(
    '|'.join(_LEGAL_SUFFIXES),
    re.IGNORECASE
)

# Whitespace collapse pattern
_WHITESPACE_PATTERN = re.compile(r'\s+')


def normalize_company_name(name: Any) -> Optional[str]:
    """
    Normalize a company name for identity comparison.
    
    Steps:
    1. Convert to string, lowercase
    2. Strip leading/trailing whitespace
    3. Remove common legal suffixes (Ltd, Pvt, Inc, etc.)
    4. Remove punctuation except alphanumerics and spaces
    5. Collapse multiple whitespace to single space
    6. Strip again
    
    Returns None if input is None or empty after normalization.
    """
    if name is None:
        return None
    
    s = str(name).lower().strip()
    if not s:
        return None
    
    # Remove legal suffixes
    s = _LEGAL_SUFFIX_PATTERN.sub('', s)
    
    # Remove punctuation (keep alphanumerics, spaces, and hyphens)
    s = re.sub(r'[^\w\s\-]', '', s)
    
    # Collapse whitespace
    s = _WHITESPACE_PATTERN.sub(' ', s).strip()
    
    return s if s else None


def normalize_cin(cin: Any) -> Optional[str]:
    """
    Normalize a Company Identification Number (CIN).
    
    Steps:
    1. Convert to string
    2. Strip whitespace
    3. Uppercase
    4. Remove non-alphanumeric characters
    
    Returns None if input is None or empty after normalization.
    """
    if cin is None:
        return None
    
    s = str(cin).strip().upper()
    if not s:
        return None
    
    # Remove non-alphanumeric characters
    s = re.sub(r'[^A-Z0-9]', '', s)
    
    return s if s else None


def normalize_address(addr: Any) -> Optional[str]:
    """
    Normalize an address string for comparison.
    
    Steps:
    1. Convert to string, lowercase
    2. Strip whitespace
    3. Expand common abbreviations (St → Street, Ave → Avenue, etc.)
    4. Remove punctuation except alphanumerics and spaces
    5. Collapse whitespace
    
    Returns None if input is None or empty after normalization.
    """
    if addr is None:
        return None
    
    s = str(addr).lower().strip()
    if not s:
        return None
    
    # Common abbreviation expansions
    abbreviations = {
        r'\bst\.?\b': 'street',
        r'\bave\.?\b': 'avenue',
        r'\bblvd\.?\b': 'boulevard',
        r'\bdr\.?\b': 'drive',
        r'\brd\.?\b': 'road',
        r'\bln\.?\b': 'lane',
        r'\bct\.?\b': 'court',
        r'\bpl\.?\b': 'place',
        r'\bno\.?\b': 'number',
    }
    
    for pattern, replacement in abbreviations.items():
        s = re.sub(pattern, replacement, s)
    
    # Remove punctuation
    s = re.sub(r'[^\w\s]', '', s)
    
    # Collapse whitespace
    s = _WHITESPACE_PATTERN.sub(' ', s).strip()
    
    return s if s else None


def normalize_generic(value: Any) -> Optional[str]:
    """
    Generic normalizer: lowercase, strip, collapse whitespace.
    Used for fields without a specialized normalizer.
    """
    if value is None:
        return None
    
    s = str(value).lower().strip()
    s = _WHITESPACE_PATTERN.sub(' ', s)
    
    return s if s else None


# ========================================================================
# NORMALIZATION REGISTRY
# ========================================================================

class NormalizationRegistry:
    """
    Registry of named normalizer functions.
    Maps field names to normalizer callables. Extensible for any entity type.
    """
    
    def __init__(self) -> None:
        self._normalizers: Dict[str, Callable[[Any], Optional[str]]] = {}
    
    def register(self, field_name: str, normalizer: Callable[[Any], Optional[str]]) -> None:
        """Register a normalizer for a specific field name."""
        self._normalizers[field_name] = normalizer
    
    def get(self, field_name: str) -> Callable[[Any], Optional[str]]:
        """Get the normalizer for a field, falling back to generic normalizer."""
        return self._normalizers.get(field_name, normalize_generic)
    
    def normalize_field(self, field_name: str, value: Any) -> Optional[str]:
        """Apply the registered normalizer for a field."""
        normalizer = self.get(field_name)
        return normalizer(value)
    
    def normalize_record(self, attributes: Dict[str, Any], fields: Optional[List[str]] = None) -> Dict[str, Optional[str]]:
        """
        Normalize all (or specified) attributes of a record.
        Returns a new dict with normalized values.
        """
        target_fields = fields or list(attributes.keys())
        result: Dict[str, Optional[str]] = {}
        
        for field in target_fields:
            if field in attributes:
                result[field] = self.normalize_field(field, attributes[field])
            else:
                result[field] = None
        
        return result
    
    @property
    def registered_fields(self) -> List[str]:
        """List of fields with registered normalizers."""
        return list(self._normalizers.keys())


def create_default_registry() -> NormalizationRegistry:
    """
    Create a default normalization registry with standard company-field normalizers.
    Extensible by registering additional normalizers after creation.
    """
    registry = NormalizationRegistry()
    registry.register("company_name", normalize_company_name)
    registry.register("cin", normalize_cin)
    registry.register("address", normalize_address)
    registry.register("registered_address", normalize_address)
    registry.register("company_status", normalize_generic)
    registry.register("company_category", normalize_generic)
    registry.register("company_class", normalize_generic)
    registry.register("state", normalize_generic)
    registry.register("country", normalize_generic)
    return registry
