"""
Universal Entity Resolution — Core Identity Models
Source-agnostic data models for entity identity resolution, match candidates,
field-level evidence, and resolution governance.

Design Philosophy: "Evidence → Confidence → Review" over "Guess → Merge → Hide"

CRITICAL CONSTRAINTS:
- No source-specific logic (no Firebase/PostgreSQL branching)
- Never auto-merge ambiguous candidates (REVIEW_REQUIRED → human decision)
- Every decision carries explainable field-level evidence
- All provenance is preserved through SourceFingerprint chains
"""

from enum import Enum
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid


# ========================================================================
# ENUMS
# ========================================================================

class MatchDecision(str, Enum):
    """Tiered match determination — never binary."""
    MATCH = "match"
    NON_MATCH = "non_match"
    REVIEW_REQUIRED = "review_required"


class ResolutionOrigin(str, Enum):
    """Origin of a resolution decision."""
    DETERMINISTIC = "deterministic"      # Rule-based exact/threshold logic
    HEURISTIC = "heuristic"              # Weighted scoring heuristics
    AI_PROPOSED = "ai_proposed"          # LLM/neural suggestion (requires review)
    HUMAN_VERIFIED = "human_verified"    # Confirmed by human analyst


class ResolutionStatus(str, Enum):
    """Lifecycle status of a resolution decision."""
    PENDING = "pending"                  # Awaiting review or confirmation
    CONFIRMED = "confirmed"             # Confirmed (match accepted or rejected)
    REJECTED = "rejected"               # Decision rejected during review
    SUPERSEDED = "superseded"           # Replaced by a newer resolution decision


class ComparisonMethod(str, Enum):
    """Field-level comparison method used to produce evidence."""
    EXACT = "exact"
    FUZZY = "fuzzy"
    TOKEN_SET = "token_set"
    NUMERIC = "numeric"
    CIN_MATCH = "cin_match"
    NULL_COMPARISON = "null_comparison"


# ========================================================================
# EVIDENCE & FINGERPRINTS
# ========================================================================

class SourceFingerprint(BaseModel):
    """
    Minimal provenance reference linking an identity back to its physical source record.
    Preserves the exact coordinate without embedding the full record.
    """
    source_id: str = Field(..., description="Source system identifier (e.g. 'firebase_main', 'pg_dw')")
    dataset_id: str = Field(..., description="Dataset/table/branch identifier")
    record_id: str = Field(..., description="Primary key or record key in source")
    observed_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Timestamp when this fingerprint was captured"
    )

    def to_uri(self) -> str:
        """Format as a human-readable provenance URI."""
        return f"{self.source_id}://{self.dataset_id}/{self.record_id}"


class FieldEvidence(BaseModel):
    """
    Single field-level comparison result.
    Records exactly what was compared, how, and the resulting score.
    """
    field_name: str = Field(..., description="The field or attribute that was compared")
    method: ComparisonMethod = Field(..., description="Comparison method used")
    score: float = Field(..., ge=0.0, le=1.0, description="Similarity score (0.0=completely different, 1.0=identical)")
    left_value: Optional[str] = Field(default=None, description="Normalized value from record A (redacted if sensitive)")
    right_value: Optional[str] = Field(default=None, description="Normalized value from record B (redacted if sensitive)")
    weight: float = Field(default=1.0, ge=0.0, description="Importance weight of this field in composite scoring")
    is_null_evidence: bool = Field(default=False, description="True if one or both values were null/missing")
    notes: Optional[str] = Field(default=None, description="Optional explanation or diagnostic note")


# ========================================================================
# MATCH CANDIDATE
# ========================================================================

class MatchCandidate(BaseModel):
    """
    A candidate pair evaluated for identity resolution.
    Carries composite confidence, all field-level evidence, and a tiered decision.
    """
    candidate_id: str = Field(
        default_factory=lambda: f"mc-{uuid.uuid4().hex[:12]}",
        description="Unique candidate pair identifier"
    )
    record_a_id: str = Field(..., description="Record ID of first entity in the pair")
    record_b_id: str = Field(..., description="Record ID of second entity in the pair")
    record_a_source: str = Field(default="", description="Source ID of record A")
    record_b_source: str = Field(default="", description="Source ID of record B")
    field_evidence: List[FieldEvidence] = Field(
        default_factory=list,
        description="All field-level comparison results for this pair"
    )
    composite_score: float = Field(
        default=0.0, ge=0.0, le=1.0,
        description="Weighted composite similarity score"
    )
    decision: MatchDecision = Field(
        default=MatchDecision.NON_MATCH,
        description="Tiered resolution decision"
    )
    origin: ResolutionOrigin = Field(
        default=ResolutionOrigin.HEURISTIC,
        description="How this decision was derived"
    )
    status: ResolutionStatus = Field(
        default=ResolutionStatus.PENDING,
        description="Governance lifecycle status"
    )
    decided_by: Optional[str] = Field(
        default=None,
        description="Identifier of decision maker (system, analyst ID, or AI model)"
    )
    decided_at: Optional[str] = Field(
        default=None,
        description="Timestamp when decision was finalized"
    )
    notes: Optional[str] = Field(default=None, description="Human or system notes on the decision")

    def confirm(self, decided_by: str = "system") -> None:
        """Confirm this candidate's decision (match or non-match)."""
        self.status = ResolutionStatus.CONFIRMED
        self.decided_by = decided_by
        self.decided_at = datetime.now(timezone.utc).isoformat()

    def reject(self, decided_by: str = "system", reason: Optional[str] = None) -> None:
        """Reject this candidate's proposed decision."""
        self.status = ResolutionStatus.REJECTED
        self.decided_by = decided_by
        self.decided_at = datetime.now(timezone.utc).isoformat()
        if reason:
            self.notes = reason


# ========================================================================
# ENTITY IDENTITY
# ========================================================================

class EntityIdentity(BaseModel):
    """
    Canonical identity record — a stable identity linking N source references.
    Represents the resolved "real-world entity" that multiple records may refer to.
    """
    identity_id: str = Field(
        default_factory=lambda: f"eid-{uuid.uuid4().hex[:12]}",
        description="Stable identity identifier"
    )
    canonical_entity_id: Optional[str] = Field(
        default=None,
        description="Link to CanonicalEntity.canonical_id in the domain model (set after mapping)"
    )
    entity_type: Optional[str] = Field(
        default=None,
        description="Resolved entity type (e.g. 'Company', 'Person')"
    )
    display_name: Optional[str] = Field(
        default=None,
        description="Best-known human-readable name for this identity"
    )
    source_fingerprints: List[SourceFingerprint] = Field(
        default_factory=list,
        description="All source records resolved to this identity"
    )
    merge_history: List[str] = Field(
        default_factory=list,
        description="IDs of identities that were merged into this one"
    )
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Identity creation timestamp"
    )
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Last update timestamp"
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional resolution metadata"
    )

    def add_fingerprint(self, fingerprint: SourceFingerprint) -> None:
        """Add a new source fingerprint, preserving all provenance."""
        # Avoid exact duplicates
        for existing in self.source_fingerprints:
            if (existing.source_id == fingerprint.source_id and
                existing.dataset_id == fingerprint.dataset_id and
                existing.record_id == fingerprint.record_id):
                return
        self.source_fingerprints.append(fingerprint)
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def record_merge(self, merged_identity_id: str) -> None:
        """Record that another identity was merged into this one."""
        if merged_identity_id not in self.merge_history:
            self.merge_history.append(merged_identity_id)
            self.updated_at = datetime.now(timezone.utc).isoformat()

    @property
    def source_count(self) -> int:
        """Number of distinct source records linked to this identity."""
        return len(self.source_fingerprints)


# ========================================================================
# RESOLUTION TASK & CONFIG
# ========================================================================

class ResolutionConfig(BaseModel):
    """
    Tunable configuration for the resolution engine.
    Controls thresholds, enabled comparators, blocking keys, and field weights.
    """
    match_threshold: float = Field(
        default=0.85, ge=0.0, le=1.0,
        description="Composite score >= this → MATCH"
    )
    review_threshold: float = Field(
        default=0.50, ge=0.0, le=1.0,
        description="Composite score >= this and < match_threshold → REVIEW_REQUIRED"
    )
    field_weights: Dict[str, float] = Field(
        default_factory=lambda: {
            "cin": 0.40,
            "company_name": 0.30,
            "state": 0.10,
            "company_status": 0.10,
            "company_category": 0.10,
        },
        description="Importance weights for each field in composite scoring"
    )
    blocking_fields: List[str] = Field(
        default_factory=lambda: ["state", "company_category"],
        description="Fields used for blocking (candidate pair reduction)"
    )
    blocking_prefix_length: int = Field(
        default=3,
        description="Character prefix length for prefix-based blocking"
    )
    max_candidates_per_record: int = Field(
        default=50,
        description="Maximum candidate pairs generated per record"
    )
    enabled_comparators: Dict[str, str] = Field(
        default_factory=lambda: {
            "cin": "cin_match",
            "company_name": "fuzzy",
            "state": "exact",
            "company_status": "exact",
            "company_category": "exact",
        },
        description="Maps field names to comparator method names"
    )
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ResolutionTask(BaseModel):
    """
    A unit of resolution work containing input records, generated candidates,
    and summary statistics.
    """
    task_id: str = Field(
        default_factory=lambda: f"rt-{uuid.uuid4().hex[:12]}",
        description="Unique task identifier"
    )
    source_id: Optional[str] = Field(default=None, description="Source system this task ran against")
    dataset_id: Optional[str] = Field(default=None, description="Dataset this task ran against")
    input_record_count: int = Field(default=0, description="Number of input records")
    candidates: List[MatchCandidate] = Field(
        default_factory=list,
        description="All candidate pairs generated and evaluated"
    )
    identities_created: List[EntityIdentity] = Field(
        default_factory=list,
        description="New identities created during this task"
    )
    config_used: ResolutionConfig = Field(
        default_factory=ResolutionConfig,
        description="Configuration snapshot used for this task"
    )
    started_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Task start timestamp"
    )
    completed_at: Optional[str] = Field(default=None, description="Task completion timestamp")
    status: str = Field(default="running", description="Task status: running, completed, failed")
    summary: Dict[str, Any] = Field(
        default_factory=dict,
        description="Summary statistics (match_count, review_count, non_match_count)"
    )

    def complete(self) -> None:
        """Mark task as completed and compute summary."""
        self.completed_at = datetime.now(timezone.utc).isoformat()
        self.status = "completed"
        self.summary = {
            "total_candidates": len(self.candidates),
            "match_count": sum(1 for c in self.candidates if c.decision == MatchDecision.MATCH),
            "review_count": sum(1 for c in self.candidates if c.decision == MatchDecision.REVIEW_REQUIRED),
            "non_match_count": sum(1 for c in self.candidates if c.decision == MatchDecision.NON_MATCH),
            "identities_created": len(self.identities_created),
        }
