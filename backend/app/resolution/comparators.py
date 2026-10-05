"""
Universal Entity Resolution — Field-Level Comparators
Deterministic comparison strategies for individual fields.
Each comparator produces a FieldEvidence object with score, method, and values.

CRITICAL: All comparators are deterministic — no LLM calls.
Uses Python stdlib (difflib.SequenceMatcher) for fuzzy matching to avoid external dependencies.
"""

from abc import ABC, abstractmethod
from difflib import SequenceMatcher
from typing import Any, Callable, Dict, List, Optional, Protocol

from app.resolution.models import ComparisonMethod, FieldEvidence


# ========================================================================
# BASE COMPARATOR
# ========================================================================

class FieldComparator(ABC):
    """
    Abstract base for field-level comparison strategies.
    All comparators produce FieldEvidence objects.
    """
    
    @property
    @abstractmethod
    def method(self) -> ComparisonMethod:
        """The comparison method identifier."""
        ...
    
    @abstractmethod
    def compare(self, left: Optional[str], right: Optional[str], field_name: str, weight: float = 1.0) -> FieldEvidence:
        """
        Compare two normalized field values and produce evidence.
        
        Args:
            left: Normalized value from record A (may be None)
            right: Normalized value from record B (may be None)
            field_name: Name of the field being compared
            weight: Importance weight for this field
        
        Returns:
            FieldEvidence with score, method, and values
        """
        ...
    
    def _handle_nulls(self, left: Optional[str], right: Optional[str], field_name: str, weight: float) -> Optional[FieldEvidence]:
        """
        Shared null/empty handling. Returns FieldEvidence if either value is None/empty.
        Returns None if both values are present (caller should proceed with comparison).
        """
        left_empty = left is None or str(left).strip() == ""
        right_empty = right is None or str(right).strip() == ""
        
        if left_empty and right_empty:
            # Both null — not informative, score 0 with null flag
            return FieldEvidence(
                field_name=field_name,
                method=ComparisonMethod.NULL_COMPARISON,
                score=0.0,
                left_value=None,
                right_value=None,
                weight=weight,
                is_null_evidence=True,
                notes="Both values are null/empty — non-informative"
            )
        
        if left_empty or right_empty:
            # One null, one present — score 0
            return FieldEvidence(
                field_name=field_name,
                method=ComparisonMethod.NULL_COMPARISON,
                score=0.0,
                left_value=str(left) if not left_empty else None,
                right_value=str(right) if not right_empty else None,
                weight=weight,
                is_null_evidence=True,
                notes="One value is null/empty"
            )
        
        return None  # Both present — proceed with comparison


# ========================================================================
# CONCRETE COMPARATORS
# ========================================================================

class ExactComparator(FieldComparator):
    """Exact string match after normalization → 1.0 or 0.0."""
    
    @property
    def method(self) -> ComparisonMethod:
        return ComparisonMethod.EXACT
    
    def compare(self, left: Optional[str], right: Optional[str], field_name: str, weight: float = 1.0) -> FieldEvidence:
        null_evidence = self._handle_nulls(left, right, field_name, weight)
        if null_evidence is not None:
            return null_evidence
        
        score = 1.0 if left == right else 0.0
        return FieldEvidence(
            field_name=field_name,
            method=self.method,
            score=score,
            left_value=str(left),
            right_value=str(right),
            weight=weight,
        )


class FuzzyComparator(FieldComparator):
    """
    Fuzzy string similarity using difflib.SequenceMatcher (Ratcliff/Obershelp).
    Produces a score in [0.0, 1.0].
    """
    
    @property
    def method(self) -> ComparisonMethod:
        return ComparisonMethod.FUZZY
    
    def compare(self, left: Optional[str], right: Optional[str], field_name: str, weight: float = 1.0) -> FieldEvidence:
        null_evidence = self._handle_nulls(left, right, field_name, weight)
        if null_evidence is not None:
            return null_evidence
        
        score = SequenceMatcher(None, str(left), str(right)).ratio()
        return FieldEvidence(
            field_name=field_name,
            method=self.method,
            score=round(score, 4),
            left_value=str(left),
            right_value=str(right),
            weight=weight,
        )


class TokenSetComparator(FieldComparator):
    """
    Jaccard coefficient over word tokens.
    Good for names where word order may differ (e.g., "ABC Industries" vs "Industries ABC").
    """
    
    @property
    def method(self) -> ComparisonMethod:
        return ComparisonMethod.TOKEN_SET
    
    def compare(self, left: Optional[str], right: Optional[str], field_name: str, weight: float = 1.0) -> FieldEvidence:
        null_evidence = self._handle_nulls(left, right, field_name, weight)
        if null_evidence is not None:
            return null_evidence
        
        tokens_a = set(str(left).lower().split())
        tokens_b = set(str(right).lower().split())
        
        if not tokens_a and not tokens_b:
            score = 0.0
        else:
            intersection = tokens_a & tokens_b
            union = tokens_a | tokens_b
            score = len(intersection) / len(union) if union else 0.0
        
        return FieldEvidence(
            field_name=field_name,
            method=self.method,
            score=round(score, 4),
            left_value=str(left),
            right_value=str(right),
            weight=weight,
        )


class NumericComparator(FieldComparator):
    """Exact numeric equality. Attempts to parse values as numbers."""
    
    @property
    def method(self) -> ComparisonMethod:
        return ComparisonMethod.NUMERIC
    
    def compare(self, left: Optional[str], right: Optional[str], field_name: str, weight: float = 1.0) -> FieldEvidence:
        null_evidence = self._handle_nulls(left, right, field_name, weight)
        if null_evidence is not None:
            return null_evidence
        
        try:
            left_num = float(str(left))
            right_num = float(str(right))
            score = 1.0 if left_num == right_num else 0.0
        except (ValueError, TypeError):
            # Cannot parse as numbers — fall back to string exact match
            score = 1.0 if str(left) == str(right) else 0.0
        
        return FieldEvidence(
            field_name=field_name,
            method=self.method,
            score=score,
            left_value=str(left),
            right_value=str(right),
            weight=weight,
        )


class CINComparator(FieldComparator):
    """
    CIN/registration-number-aware comparator.
    Exact match on normalized CIN (uppercase, alphanumeric only).
    CIN matches are very strong identity signals.
    """
    
    @property
    def method(self) -> ComparisonMethod:
        return ComparisonMethod.CIN_MATCH
    
    def compare(self, left: Optional[str], right: Optional[str], field_name: str, weight: float = 1.0) -> FieldEvidence:
        null_evidence = self._handle_nulls(left, right, field_name, weight)
        if null_evidence is not None:
            return null_evidence
        
        # CIN values should already be normalized (uppercase, alphanumeric)
        score = 1.0 if str(left) == str(right) else 0.0
        
        notes = None
        if score == 1.0:
            notes = "CIN exact match — strong identity signal"
        
        return FieldEvidence(
            field_name=field_name,
            method=self.method,
            score=score,
            left_value=str(left),
            right_value=str(right),
            weight=weight,
            notes=notes,
        )


# ========================================================================
# COMPARATOR REGISTRY
# ========================================================================

# Singleton instances
_COMPARATOR_INSTANCES: Dict[str, FieldComparator] = {
    "exact": ExactComparator(),
    "fuzzy": FuzzyComparator(),
    "token_set": TokenSetComparator(),
    "numeric": NumericComparator(),
    "cin_match": CINComparator(),
}


class ComparatorRegistry:
    """
    Maps field names to comparator instances.
    Provides a centralized way to configure which comparator to use for each field.
    """
    
    def __init__(self) -> None:
        self._field_comparators: Dict[str, FieldComparator] = {}
    
    def register(self, field_name: str, comparator_name: str) -> None:
        """Register a comparator for a field by name."""
        if comparator_name not in _COMPARATOR_INSTANCES:
            raise ValueError(f"Unknown comparator: {comparator_name}. Available: {list(_COMPARATOR_INSTANCES.keys())}")
        self._field_comparators[field_name] = _COMPARATOR_INSTANCES[comparator_name]
    
    def get(self, field_name: str) -> FieldComparator:
        """Get the comparator for a field, defaulting to ExactComparator."""
        return self._field_comparators.get(field_name, _COMPARATOR_INSTANCES["exact"])
    
    def compare_field(
        self,
        field_name: str,
        left: Optional[str],
        right: Optional[str],
        weight: float = 1.0
    ) -> FieldEvidence:
        """Compare a single field using its registered comparator."""
        comparator = self.get(field_name)
        return comparator.compare(left, right, field_name, weight)
    
    @property
    def registered_fields(self) -> List[str]:
        return list(self._field_comparators.keys())


def create_default_comparator_registry() -> ComparatorRegistry:
    """
    Create a default comparator registry with standard company-field comparators.
    """
    registry = ComparatorRegistry()
    registry.register("cin", "cin_match")
    registry.register("company_name", "fuzzy")
    registry.register("state", "exact")
    registry.register("company_status", "exact")
    registry.register("company_category", "exact")
    registry.register("company_class", "exact")
    registry.register("country", "exact")
    return registry
