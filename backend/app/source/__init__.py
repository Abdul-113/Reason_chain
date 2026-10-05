"""
ReasonChain Universal Source Contract & Semantic Mapping Layer
Source-agnostic foundation for connecting, profiling, extracting, and mapping
heterogeneous enterprise data sources into the Canonical ReasonChain domain model.
"""

from app.source.models import (
    SourceCapability,
    SourceStatus,
    SourceDescriptor,
    DatasetDescriptor,
    DatasetSelection,
    SourceConfiguration,
    FieldDescriptor,
    ReferenceCandidate,
    TemporalCandidate,
    ProfileResult,
)
from app.source.records import (
    SourceLocation,
    SourceRecord,
    SourceBatch,
)
from app.source.contract import (
    BaseSourceAdapter,
    ConnectionTestResult,
    ExtractOptions,
    ProfileOptions,
)
from app.source.mapping import (
    MappingOrigin,
    ValidationStatus,
    ApprovalStatus,
    TransformType,
    TransformationRule,
    FieldMappingRule,
    EntityMappingRule,
    RelationshipMappingRule,
    MappingSpecification,
    SemanticMappingAssistant,
)
from app.source.engine import UniversalMappingEngine
from app.source.adapters import (
    FirebaseSourceAdapter,
    PostgreSQLSourceAdapter,
)

__all__ = [
    # Metadata Models
    "SourceCapability",
    "SourceStatus",
    "SourceDescriptor",
    "DatasetDescriptor",
    "DatasetSelection",
    "SourceConfiguration",
    "FieldDescriptor",
    "ReferenceCandidate",
    "TemporalCandidate",
    "ProfileResult",
    # Intermediate Representation
    "SourceLocation",
    "SourceRecord",
    "SourceBatch",
    # Contract
    "BaseSourceAdapter",
    "ConnectionTestResult",
    "ExtractOptions",
    "ProfileOptions",
    # Mapping Models
    "MappingOrigin",
    "ValidationStatus",
    "ApprovalStatus",
    "TransformType",
    "TransformationRule",
    "FieldMappingRule",
    "EntityMappingRule",
    "RelationshipMappingRule",
    "MappingSpecification",
    "SemanticMappingAssistant",
    # Engine
    "UniversalMappingEngine",
    # Adapters
    "FirebaseSourceAdapter",
    "PostgreSQLSourceAdapter",
]
