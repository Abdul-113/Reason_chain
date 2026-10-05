"""
ReasonChain Universal Entity Resolution & Identity Management Package
Source-agnostic foundation for determining whether multiple source records
refer to the same real-world entity, with evidence-backed decisions
and human-in-the-loop governance.
"""

from app.resolution.models import (
    MatchDecision,
    ResolutionOrigin,
    ResolutionStatus,
    ComparisonMethod,
    SourceFingerprint,
    FieldEvidence,
    MatchCandidate,
    EntityIdentity,
    ResolutionConfig,
    ResolutionTask,
)
from app.resolution.normalizers import (
    normalize_company_name,
    normalize_cin,
    normalize_address,
    normalize_generic,
    NormalizationRegistry,
    create_default_registry,
)
from app.resolution.comparators import (
    FieldComparator,
    ExactComparator,
    FuzzyComparator,
    TokenSetComparator,
    NumericComparator,
    CINComparator,
    ComparatorRegistry,
    create_default_comparator_registry,
)
from app.resolution.blocking import (
    BlockingStrategy,
    ExactBlockingKey,
    PrefixBlockingKey,
    SortedNeighborhood,
    BlockingPipeline,
    create_default_blocking_pipeline,
)
from app.resolution.engine import UniversalResolutionEngine

__all__ = [
    # Models
    "MatchDecision",
    "ResolutionOrigin",
    "ResolutionStatus",
    "ComparisonMethod",
    "SourceFingerprint",
    "FieldEvidence",
    "MatchCandidate",
    "EntityIdentity",
    "ResolutionConfig",
    "ResolutionTask",
    # Normalizers
    "normalize_company_name",
    "normalize_cin",
    "normalize_address",
    "normalize_generic",
    "NormalizationRegistry",
    "create_default_registry",
    # Comparators
    "FieldComparator",
    "ExactComparator",
    "FuzzyComparator",
    "TokenSetComparator",
    "NumericComparator",
    "CINComparator",
    "ComparatorRegistry",
    "create_default_comparator_registry",
    # Blocking
    "BlockingStrategy",
    "ExactBlockingKey",
    "PrefixBlockingKey",
    "SortedNeighborhood",
    "BlockingPipeline",
    "create_default_blocking_pipeline",
    # Engine
    "UniversalResolutionEngine",
]
