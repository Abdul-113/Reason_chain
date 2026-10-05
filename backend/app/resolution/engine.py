"""
Universal Entity Resolution — Resolution Engine
Source-agnostic orchestrator implementing the full resolution pipeline:

    Normalize → Block → Compare → Score → Decide

CRITICAL ARCHITECTURAL BOUNDARIES:
- ZERO source-specific branching (no 'if firebase' or 'if postgres')
- Operates purely on SourceRecord.attributes and ResolutionConfig
- Never auto-merges ambiguous candidates (REVIEW_REQUIRED → human decision)
- All decisions carry explainable field-level evidence
- Provenance is never discarded during merges
"""

import logging
from typing import Dict, List, Optional, Set, Tuple
from datetime import datetime, timezone

from app.source.records import SourceRecord
from app.domain.entities import CanonicalEntity
from app.resolution.models import (
    MatchDecision,
    ResolutionOrigin,
    ResolutionStatus,
    SourceFingerprint,
    FieldEvidence,
    MatchCandidate,
    EntityIdentity,
    ResolutionConfig,
    ResolutionTask,
)
from app.resolution.normalizers import NormalizationRegistry, create_default_registry
from app.resolution.comparators import ComparatorRegistry, create_default_comparator_registry
from app.resolution.blocking import BlockingPipeline, create_default_blocking_pipeline

logger = logging.getLogger("reasonchain.resolution.engine")


class UniversalResolutionEngine:
    """
    Source-agnostic entity resolution engine.
    
    Pipeline:
    1. Normalize → apply registered normalizers to each record's attributes
    2. Block → generate candidate pairs using blocking strategies
    3. Compare → run comparator chains on each candidate pair
    4. Score → compute composite match confidence from field evidences
    5. Decide → apply thresholds: MATCH / REVIEW_REQUIRED / NON_MATCH
    6. Output → ResolutionTask with all candidates, decisions, and evidence
    """
    
    def __init__(
        self,
        config: Optional[ResolutionConfig] = None,
        normalizer_registry: Optional[NormalizationRegistry] = None,
        comparator_registry: Optional[ComparatorRegistry] = None,
        blocking_pipeline: Optional[BlockingPipeline] = None,
    ) -> None:
        self.config = config or ResolutionConfig()
        self.normalizer_registry = normalizer_registry or create_default_registry()
        self.comparator_registry = comparator_registry or create_default_comparator_registry()
        self.blocking_pipeline = blocking_pipeline or create_default_blocking_pipeline(
            blocking_fields=self.config.blocking_fields,
            prefix_length=self.config.blocking_prefix_length,
        )
    
    # ================================================================
    # STEP 1: NORMALIZE
    # ================================================================
    
    def normalize_attributes(self, attributes: Dict) -> Dict[str, Optional[str]]:
        """
        Apply registered normalizers to record attributes.
        Returns a new dict with normalized values for all weighted fields.
        """
        fields_to_normalize = list(self.config.field_weights.keys())
        return self.normalizer_registry.normalize_record(attributes, fields_to_normalize)
    
    # ================================================================
    # STEP 2-5: COMPARE, SCORE, DECIDE (Single Pair)
    # ================================================================
    
    def resolve_pair(
        self,
        record_a: SourceRecord,
        record_b: SourceRecord,
    ) -> MatchCandidate:
        """
        Compare two SourceRecords and produce a MatchCandidate with evidence.
        
        Steps:
        1. Normalize attributes of both records
        2. Compare each weighted field using registered comparators
        3. Compute composite score from weighted evidence
        4. Apply thresholds to determine decision
        """
        # Normalize
        norm_a = self.normalize_attributes(record_a.attributes)
        norm_b = self.normalize_attributes(record_b.attributes)
        
        # Compare each weighted field
        field_evidence: List[FieldEvidence] = []
        
        for field_name, weight in self.config.field_weights.items():
            left = norm_a.get(field_name)
            right = norm_b.get(field_name)
            
            evidence = self.comparator_registry.compare_field(
                field_name=field_name,
                left=left,
                right=right,
                weight=weight,
            )
            field_evidence.append(evidence)
        
        # Compute composite score
        composite_score = self._compute_composite_score(field_evidence)
        
        # Apply decision thresholds
        decision = self._apply_thresholds(composite_score)
        
        # Determine origin
        origin = ResolutionOrigin.DETERMINISTIC if decision == MatchDecision.NON_MATCH else ResolutionOrigin.HEURISTIC
        
        # Set status based on decision
        if decision == MatchDecision.MATCH:
            status = ResolutionStatus.PENDING  # Matches still need confirmation in governance
        elif decision == MatchDecision.REVIEW_REQUIRED:
            status = ResolutionStatus.PENDING
        else:
            status = ResolutionStatus.CONFIRMED  # Non-matches are auto-confirmed
        
        candidate = MatchCandidate(
            record_a_id=record_a.record_id,
            record_b_id=record_b.record_id,
            record_a_source=record_a.source_id,
            record_b_source=record_b.source_id,
            field_evidence=field_evidence,
            composite_score=round(composite_score, 4),
            decision=decision,
            origin=origin,
            status=status,
        )
        
        logger.debug(
            f"Resolved pair ({record_a.record_id}, {record_b.record_id}): "
            f"score={composite_score:.4f}, decision={decision.value}"
        )
        
        return candidate
    
    def _compute_composite_score(self, evidence: List[FieldEvidence]) -> float:
        """
        Weighted field evidence aggregation:
            composite_score = Σ(field_weight × field_score) / Σ(field_weight)
        
        Null evidence is excluded from scoring (doesn't penalize or reward).
        """
        weighted_sum = 0.0
        weight_total = 0.0
        
        for e in evidence:
            if e.is_null_evidence:
                # Null evidence is non-informative — skip
                continue
            weighted_sum += e.weight * e.score
            weight_total += e.weight
        
        if weight_total == 0.0:
            return 0.0
        
        return weighted_sum / weight_total
    
    def _apply_thresholds(self, composite_score: float) -> MatchDecision:
        """Apply configurable thresholds to determine match decision."""
        if composite_score >= self.config.match_threshold:
            return MatchDecision.MATCH
        elif composite_score >= self.config.review_threshold:
            return MatchDecision.REVIEW_REQUIRED
        else:
            return MatchDecision.NON_MATCH
    
    # ================================================================
    # FULL BATCH RESOLUTION
    # ================================================================
    
    def resolve_batch(
        self,
        records: List[SourceRecord],
    ) -> ResolutionTask:
        """
        Run the full resolution pipeline on a batch of records.
        
        Pipeline:
        1. Normalize all records
        2. Generate candidate pairs via blocking
        3. Compare each candidate pair
        4. Score and decide
        5. Create identities for confirmed matches
        """
        task = ResolutionTask(
            input_record_count=len(records),
            config_used=self.config,
        )
        
        if len(records) < 2:
            task.complete()
            return task
        
        logger.info(f"Starting resolution for {len(records)} records")
        
        # Build lookup: record_id → SourceRecord
        record_map: Dict[str, SourceRecord] = {}
        for r in records:
            record_map[r.record_id] = r
        
        record_ids = [r.record_id for r in records]
        attribute_list = [r.attributes for r in records]
        
        # Step 1 & 2: Blocking (generates candidate pairs)
        candidate_pairs = self.blocking_pipeline.generate_candidate_pairs(
            records=attribute_list,
            record_ids=record_ids,
        )
        
        logger.info(f"Blocking generated {len(candidate_pairs)} candidate pairs from {len(records)} records")
        
        # Step 3-5: Compare, score, decide each pair
        for id_a, id_b in candidate_pairs:
            rec_a = record_map.get(id_a)
            rec_b = record_map.get(id_b)
            
            if rec_a is None or rec_b is None:
                continue
            
            candidate = self.resolve_pair(rec_a, rec_b)
            
            # Only keep matches and review-required (non-matches are usually noise)
            if candidate.decision != MatchDecision.NON_MATCH:
                task.candidates.append(candidate)
        
        # Create identities for confirmed matches
        for candidate in task.candidates:
            if candidate.decision == MatchDecision.MATCH:
                rec_a = record_map.get(candidate.record_a_id)
                rec_b = record_map.get(candidate.record_b_id)
                if rec_a and rec_b:
                    identity = self._create_identity_from_pair(rec_a, rec_b, candidate)
                    task.identities_created.append(identity)
        
        task.complete()
        
        logger.info(
            f"Resolution complete: {task.summary.get('total_candidates', 0)} candidates, "
            f"{task.summary.get('match_count', 0)} matches, "
            f"{task.summary.get('review_count', 0)} review-required"
        )
        
        return task
    
    # ================================================================
    # IDENTITY MANAGEMENT
    # ================================================================
    
    def create_identity(
        self,
        entity: CanonicalEntity,
        source_record: SourceRecord,
    ) -> EntityIdentity:
        """
        Create a new EntityIdentity from a canonical entity and its source record.
        """
        fingerprint = SourceFingerprint(
            source_id=source_record.source_id,
            dataset_id=source_record.dataset_id,
            record_id=source_record.record_id,
            observed_at=source_record.observed_at,
        )
        
        identity = EntityIdentity(
            canonical_entity_id=entity.canonical_id,
            entity_type=str(entity.entity_type),
            display_name=entity.display_name,
            source_fingerprints=[fingerprint],
        )
        
        logger.debug(f"Created identity {identity.identity_id} for entity {entity.canonical_id}")
        return identity
    
    def merge_identities(
        self,
        primary: EntityIdentity,
        secondary: EntityIdentity,
        evidence: MatchCandidate,
    ) -> EntityIdentity:
        """
        Merge secondary identity into primary.
        
        CRITICAL REQUIREMENTS:
        - evidence.decision MUST be MATCH
        - evidence.status MUST be CONFIRMED
        - Secondary's fingerprints are appended to primary (never discarded)
        - Secondary's identity_id is recorded in primary's merge_history
        - Secondary is NOT deleted (marked as SUPERSEDED externally)
        
        Raises ValueError if preconditions are not met.
        """
        if evidence.decision != MatchDecision.MATCH:
            raise ValueError(
                f"Cannot merge identities: evidence decision is {evidence.decision.value}, "
                f"expected MATCH"
            )
        
        if evidence.status != ResolutionStatus.CONFIRMED:
            raise ValueError(
                f"Cannot merge identities: evidence status is {evidence.status.value}, "
                f"expected CONFIRMED"
            )
        
        # Append secondary's fingerprints to primary
        for fp in secondary.source_fingerprints:
            primary.add_fingerprint(fp)
        
        # Record merge history
        primary.record_merge(secondary.identity_id)
        
        # Update metadata
        primary.metadata["last_merge_evidence"] = evidence.candidate_id
        primary.metadata["last_merge_score"] = evidence.composite_score
        
        logger.info(
            f"Merged identity {secondary.identity_id} into {primary.identity_id} "
            f"(score={evidence.composite_score:.4f})"
        )
        
        return primary
    
    def _create_identity_from_pair(
        self,
        record_a: SourceRecord,
        record_b: SourceRecord,
        candidate: MatchCandidate,
    ) -> EntityIdentity:
        """
        Create an EntityIdentity from a matched pair.
        Uses the first record's attributes for display_name.
        """
        fp_a = SourceFingerprint(
            source_id=record_a.source_id,
            dataset_id=record_a.dataset_id,
            record_id=record_a.record_id,
            observed_at=record_a.observed_at,
        )
        fp_b = SourceFingerprint(
            source_id=record_b.source_id,
            dataset_id=record_b.dataset_id,
            record_id=record_b.record_id,
            observed_at=record_b.observed_at,
        )
        
        # Use company_name from record_a as display_name if available
        display_name = (
            record_a.attributes.get("company_name") or
            record_a.attributes.get("name") or
            record_a.record_id
        )
        
        identity = EntityIdentity(
            entity_type=record_a.attributes.get("entity_type", "Company"),
            display_name=str(display_name),
            source_fingerprints=[fp_a, fp_b],
            metadata={
                "resolution_candidate_id": candidate.candidate_id,
                "resolution_score": candidate.composite_score,
                "resolution_decision": candidate.decision.value,
            },
        )
        
        return identity
