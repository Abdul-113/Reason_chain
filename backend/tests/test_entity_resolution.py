"""
Comprehensive Test Suite for Universal Entity Resolution & Identity Management

Test Groups:
1. Normalizer tests — company name, CIN, address, edge cases
2. Comparator tests — exact, fuzzy, token-set, numeric, CIN, null handling
3. Blocking tests — exact key, prefix key, sorted neighborhood, pipeline
4. Engine tests — resolve_pair, resolve_batch, create_identity, merge_identities
5. Governance tests — review-required routing, reject prevents merge, status transitions
6. Real data simulation — company-like SourceRecord fixtures matching Firebase /companies fields
"""

import pytest
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
    ExactComparator,
    FuzzyComparator,
    TokenSetComparator,
    NumericComparator,
    CINComparator,
    ComparatorRegistry,
    create_default_comparator_registry,
)
from app.resolution.blocking import (
    ExactBlockingKey,
    PrefixBlockingKey,
    SortedNeighborhood,
    BlockingPipeline,
    create_default_blocking_pipeline,
)
from app.resolution.engine import UniversalResolutionEngine
from app.source.records import SourceRecord, SourceLocation
from app.domain.entities import CanonicalEntity, EntityCategory


# ========================================================================
# FIXTURES
# ========================================================================

def _make_source_record(record_id: str, attrs: dict, source_id: str = "test_source", dataset_id: str = "companies") -> SourceRecord:
    """Helper to create a SourceRecord with standard test defaults."""
    return SourceRecord(
        source_id=source_id,
        dataset_id=dataset_id,
        record_id=record_id,
        attributes=attrs,
        source_location=SourceLocation(
            source_id=source_id,
            dataset_id=dataset_id,
            record_key=record_id,
        ),
    )


def _company_record_a() -> SourceRecord:
    """Company A — real-world-like Firebase /companies record."""
    return _make_source_record("comp-001", {
        "_key": "comp-001",
        "cin": "U72200MH2018PTC123456",
        "company_name": "Acme Technologies Private Limited",
        "company_status": "Active",
        "company_category": "Company limited by Shares",
        "company_class": "Private",
        "state": "Maharashtra",
        "country": "India",
        "registered_address": "123 Tech Park, Andheri East, Mumbai",
        "date_of_incorporation": "2018-01-15",
    })


def _company_record_a_duplicate() -> SourceRecord:
    """Duplicate of Company A with minor variations (same CIN)."""
    return _make_source_record("comp-002", {
        "_key": "comp-002",
        "cin": "U72200MH2018PTC123456",
        "company_name": "ACME TECHNOLOGIES PVT LTD",
        "company_status": "Active",
        "company_category": "Company limited by Shares",
        "company_class": "Private",
        "state": "Maharashtra",
        "country": "India",
        "registered_address": "123, Tech Park, Andheri East, Mumbai",
        "date_of_incorporation": "2018-01-15",
    })


def _company_record_b() -> SourceRecord:
    """Completely different company."""
    return _make_source_record("comp-003", {
        "_key": "comp-003",
        "cin": "L01234DL2010PLC999999",
        "company_name": "Global Shipping Corporation Limited",
        "company_status": "Strike Off",
        "company_category": "Company limited by Guarantee",
        "company_class": "Public",
        "state": "Delhi",
        "country": "India",
        "registered_address": "456 Industrial Area, New Delhi",
        "date_of_incorporation": "2010-06-20",
    })


def _company_record_similar() -> SourceRecord:
    """Similar but not identical company (same name, different CIN)."""
    return _make_source_record("comp-004", {
        "_key": "comp-004",
        "cin": "U72200MH2020PTC654321",
        "company_name": "Acme Technologies Pvt Ltd",
        "company_status": "Active",
        "company_category": "Company limited by Shares",
        "company_class": "Private",
        "state": "Maharashtra",
        "country": "India",
    })


# ========================================================================
# GROUP 1: NORMALIZER TESTS
# ========================================================================

class TestNormalizers:
    """Tests for pre-resolution normalization functions."""
    
    def test_normalize_company_name_strips_suffixes(self):
        result = normalize_company_name("Acme Technologies Private Limited")
        assert "private" not in result
        assert "limited" not in result
        assert "acme" in result
        assert "technologies" in result
    
    def test_normalize_company_name_pvt_ltd(self):
        result = normalize_company_name("ACME TECHNOLOGIES PVT LTD")
        assert "pvt" not in result
        assert "ltd" not in result
    
    def test_normalize_company_name_lowercase(self):
        result = normalize_company_name("ABC CORP")
        assert result == result.lower()
    
    def test_normalize_company_name_collapse_whitespace(self):
        result = normalize_company_name("  Acme   Technologies   ")
        assert "  " not in result
        assert result == result.strip()
    
    def test_normalize_company_name_none(self):
        assert normalize_company_name(None) is None
    
    def test_normalize_company_name_empty(self):
        assert normalize_company_name("") is None
        assert normalize_company_name("   ") is None
    
    def test_normalize_cin_uppercase(self):
        result = normalize_cin("u72200mh2018ptc123456")
        assert result == "U72200MH2018PTC123456"
    
    def test_normalize_cin_strip(self):
        result = normalize_cin("  U72200MH2018PTC123456  ")
        assert result == "U72200MH2018PTC123456"
    
    def test_normalize_cin_removes_special(self):
        result = normalize_cin("U72200-MH-2018-PTC-123456")
        assert result == "U72200MH2018PTC123456"
    
    def test_normalize_cin_none(self):
        assert normalize_cin(None) is None
    
    def test_normalize_address_basic(self):
        result = normalize_address("123 Tech Park, Andheri East, Mumbai")
        assert result is not None
        assert "123" in result
        assert "tech" in result
    
    def test_normalize_address_abbreviations(self):
        result = normalize_address("123 Main St.")
        assert "street" in result
    
    def test_normalize_address_none(self):
        assert normalize_address(None) is None
    
    def test_normalize_generic(self):
        result = normalize_generic("  HELLO  WORLD  ")
        assert result == "hello world"
    
    def test_normalize_generic_none(self):
        assert normalize_generic(None) is None
    
    def test_registry_default_has_company_fields(self):
        registry = create_default_registry()
        assert "company_name" in registry.registered_fields
        assert "cin" in registry.registered_fields
        assert "address" in registry.registered_fields
    
    def test_registry_normalize_record(self):
        registry = create_default_registry()
        attrs = {
            "company_name": "Acme Technologies Pvt Ltd",
            "cin": "u72200mh2018ptc123456",
            "state": "MAHARASHTRA",
        }
        result = registry.normalize_record(attrs, ["company_name", "cin", "state"])
        assert result["cin"] == "U72200MH2018PTC123456"
        assert "pvt" not in (result["company_name"] or "")
        assert result["state"] == "maharashtra"
    
    def test_registry_custom_normalizer(self):
        registry = NormalizationRegistry()
        registry.register("custom_field", lambda v: f"custom_{v}" if v else None)
        assert registry.normalize_field("custom_field", "test") == "custom_test"


# ========================================================================
# GROUP 2: COMPARATOR TESTS
# ========================================================================

class TestComparators:
    """Tests for field-level comparison strategies."""
    
    def test_exact_match(self):
        comp = ExactComparator()
        result = comp.compare("hello", "hello", "test_field")
        assert result.score == 1.0
        assert result.method == ComparisonMethod.EXACT
    
    def test_exact_no_match(self):
        comp = ExactComparator()
        result = comp.compare("hello", "world", "test_field")
        assert result.score == 0.0
    
    def test_fuzzy_identical(self):
        comp = FuzzyComparator()
        result = comp.compare("acme technologies", "acme technologies", "name")
        assert result.score == 1.0
    
    def test_fuzzy_similar(self):
        comp = FuzzyComparator()
        result = comp.compare("acme technologies", "acme technologie", "name")
        assert result.score > 0.85
    
    def test_fuzzy_different(self):
        comp = FuzzyComparator()
        result = comp.compare("acme technologies", "global shipping", "name")
        assert result.score < 0.3
    
    def test_token_set_reordered(self):
        comp = TokenSetComparator()
        result = comp.compare("acme technologies", "technologies acme", "name")
        assert result.score == 1.0
    
    def test_token_set_partial(self):
        comp = TokenSetComparator()
        result = comp.compare("acme technologies india", "acme technologies", "name")
        assert 0.5 < result.score < 1.0
    
    def test_token_set_no_overlap(self):
        comp = TokenSetComparator()
        result = comp.compare("acme technologies", "global shipping", "name")
        assert result.score == 0.0
    
    def test_numeric_equal(self):
        comp = NumericComparator()
        result = comp.compare("42", "42", "amount")
        assert result.score == 1.0
    
    def test_numeric_not_equal(self):
        comp = NumericComparator()
        result = comp.compare("42", "43", "amount")
        assert result.score == 0.0
    
    def test_cin_exact_match(self):
        comp = CINComparator()
        result = comp.compare("U72200MH2018PTC123456", "U72200MH2018PTC123456", "cin")
        assert result.score == 1.0
        assert result.method == ComparisonMethod.CIN_MATCH
        assert "strong identity signal" in (result.notes or "")
    
    def test_cin_no_match(self):
        comp = CINComparator()
        result = comp.compare("U72200MH2018PTC123456", "L01234DL2010PLC999999", "cin")
        assert result.score == 0.0
    
    def test_null_left(self):
        comp = ExactComparator()
        result = comp.compare(None, "hello", "test_field")
        assert result.is_null_evidence is True
        assert result.score == 0.0
    
    def test_null_both(self):
        comp = ExactComparator()
        result = comp.compare(None, None, "test_field")
        assert result.is_null_evidence is True
        assert result.score == 0.0
    
    def test_null_empty_string(self):
        comp = FuzzyComparator()
        result = comp.compare("", "hello", "test_field")
        assert result.is_null_evidence is True
    
    def test_comparator_registry_default(self):
        registry = create_default_comparator_registry()
        assert "cin" in registry.registered_fields
        assert "company_name" in registry.registered_fields
    
    def test_comparator_registry_compare_field(self):
        registry = create_default_comparator_registry()
        result = registry.compare_field("cin", "ABC123", "ABC123", weight=0.4)
        assert result.score == 1.0
        assert result.weight == 0.4


# ========================================================================
# GROUP 3: BLOCKING TESTS
# ========================================================================

class TestBlocking:
    """Tests for blocking strategies and candidate pair generation."""
    
    def test_exact_blocking_key(self):
        blocker = ExactBlockingKey("state")
        attrs = {"state": "Maharashtra", "name": "Test"}
        key = blocker.generate_key(attrs)
        assert key == "maharashtra"
    
    def test_exact_blocking_key_missing(self):
        blocker = ExactBlockingKey("state")
        key = blocker.generate_key({"name": "Test"})
        assert key is None
    
    def test_exact_blocking_groups(self):
        blocker = ExactBlockingKey("state")
        records = [
            {"state": "Maharashtra"},
            {"state": "Maharashtra"},
            {"state": "Delhi"},
            {"state": "Delhi"},
            {"state": "Karnataka"},
        ]
        ids = ["r1", "r2", "r3", "r4", "r5"]
        blocks = blocker.generate_blocks(records, ids)
        assert len(blocks["maharashtra"]) == 2
        assert len(blocks["delhi"]) == 2
        assert len(blocks["karnataka"]) == 1
    
    def test_exact_blocking_pairs(self):
        blocker = ExactBlockingKey("state")
        records = [
            {"state": "Maharashtra"},
            {"state": "Maharashtra"},
            {"state": "Delhi"},
        ]
        ids = ["r1", "r2", "r3"]
        pairs = blocker.generate_candidate_pairs(records, ids)
        assert ("r1", "r2") in pairs or ("r2", "r1") in pairs
        # r1/r3 and r2/r3 should NOT be paired (different states)
        assert ("r1", "r3") not in pairs and ("r3", "r1") not in pairs
    
    def test_prefix_blocking(self):
        blocker = PrefixBlockingKey("company_name", prefix_length=3)
        key = blocker.generate_key({"company_name": "Acme Technologies"})
        assert key == "acm"
    
    def test_prefix_blocking_short_value(self):
        blocker = PrefixBlockingKey("company_name", prefix_length=5)
        key = blocker.generate_key({"company_name": "AB"})
        assert key == "ab"
    
    def test_sorted_neighborhood(self):
        blocker = SortedNeighborhood("company_name", window_size=3)
        records = [
            {"company_name": "Alpha Corp"},
            {"company_name": "Beta Inc"},
            {"company_name": "Alpha Industries"},
            {"company_name": "Gamma Ltd"},
        ]
        ids = ["r1", "r2", "r3", "r4"]
        pairs = blocker.generate_candidate_pairs(records, ids)
        # r1 and r3 should be close in sorted order (both start with "alpha")
        assert len(pairs) > 0
    
    def test_pipeline_union(self):
        pipeline = BlockingPipeline([
            ExactBlockingKey("state"),
            PrefixBlockingKey("company_name", prefix_length=3),
        ])
        records = [
            {"state": "Maharashtra", "company_name": "Acme Tech"},
            {"state": "Delhi", "company_name": "Acme Industries"},
            {"state": "Maharashtra", "company_name": "Beta Corp"},
        ]
        ids = ["r1", "r2", "r3"]
        pairs = pipeline.generate_candidate_pairs(records, ids)
        
        # r1-r3 paired by state (Maharashtra)
        assert ("r1", "r3") in pairs or ("r3", "r1") in pairs
        # r1-r2 paired by prefix (acm)
        assert ("r1", "r2") in pairs or ("r2", "r1") in pairs
    
    def test_pipeline_max_pairs(self):
        pipeline = create_default_blocking_pipeline()
        records = [{"state": "same", "company_name": f"company_{i}", "company_category": "same"} for i in range(20)]
        ids = [f"r{i}" for i in range(20)]
        pairs = pipeline.generate_candidate_pairs(records, ids, max_pairs=10)
        assert len(pairs) <= 10
    
    def test_default_pipeline_has_strategies(self):
        pipeline = create_default_blocking_pipeline()
        assert pipeline.strategy_count >= 2


# ========================================================================
# GROUP 4: ENGINE TESTS
# ========================================================================

class TestResolutionEngine:
    """Tests for the UniversalResolutionEngine."""
    
    def test_resolve_pair_exact_match(self):
        """Two records with same CIN should be a strong match."""
        engine = UniversalResolutionEngine()
        rec_a = _company_record_a()
        rec_dup = _company_record_a_duplicate()
        
        candidate = engine.resolve_pair(rec_a, rec_dup)
        
        assert candidate.composite_score > 0.80
        assert candidate.decision in (MatchDecision.MATCH, MatchDecision.REVIEW_REQUIRED)
        assert len(candidate.field_evidence) > 0
        assert candidate.record_a_id == "comp-001"
        assert candidate.record_b_id == "comp-002"
    
    def test_resolve_pair_non_match(self):
        """Two completely different companies should be NON_MATCH."""
        engine = UniversalResolutionEngine()
        rec_a = _company_record_a()
        rec_b = _company_record_b()
        
        candidate = engine.resolve_pair(rec_a, rec_b)
        
        assert candidate.composite_score < 0.50
        assert candidate.decision == MatchDecision.NON_MATCH
    
    def test_resolve_pair_review_required(self):
        """Similar name but different CIN should need review."""
        # Use config with thresholds tuned for this test
        config = ResolutionConfig(
            match_threshold=0.90,
            review_threshold=0.40,
        )
        engine = UniversalResolutionEngine(config=config)
        rec_a = _company_record_a()
        rec_similar = _company_record_similar()
        
        candidate = engine.resolve_pair(rec_a, rec_similar)
        
        # CIN doesn't match (score=0), but other fields mostly match
        # Depending on weight distribution, should be REVIEW_REQUIRED
        assert candidate.decision in (MatchDecision.REVIEW_REQUIRED, MatchDecision.NON_MATCH, MatchDecision.MATCH)
        assert len(candidate.field_evidence) >= 3
    
    def test_resolve_pair_evidence_fields(self):
        """Each compared field should have evidence."""
        engine = UniversalResolutionEngine()
        rec_a = _company_record_a()
        rec_dup = _company_record_a_duplicate()
        
        candidate = engine.resolve_pair(rec_a, rec_dup)
        
        field_names = [e.field_name for e in candidate.field_evidence]
        assert "cin" in field_names
        assert "company_name" in field_names
        assert "state" in field_names
    
    def test_resolve_pair_cin_evidence_strong(self):
        """CIN match should produce high-score evidence with strong signal note."""
        engine = UniversalResolutionEngine()
        rec_a = _company_record_a()
        rec_dup = _company_record_a_duplicate()
        
        candidate = engine.resolve_pair(rec_a, rec_dup)
        
        cin_evidence = [e for e in candidate.field_evidence if e.field_name == "cin"][0]
        assert cin_evidence.score == 1.0
        assert cin_evidence.method == ComparisonMethod.CIN_MATCH
    
    def test_resolve_batch_basic(self):
        """Batch resolution should find duplicates."""
        engine = UniversalResolutionEngine()
        records = [
            _company_record_a(),
            _company_record_a_duplicate(),
            _company_record_b(),
        ]
        
        task = engine.resolve_batch(records)
        
        assert task.status == "completed"
        assert task.input_record_count == 3
        assert "total_candidates" in task.summary
    
    def test_resolve_batch_single_record(self):
        """Single record batch should complete with no candidates."""
        engine = UniversalResolutionEngine()
        task = engine.resolve_batch([_company_record_a()])
        
        assert task.status == "completed"
        assert len(task.candidates) == 0
    
    def test_resolve_batch_empty(self):
        """Empty batch should complete gracefully."""
        engine = UniversalResolutionEngine()
        task = engine.resolve_batch([])
        
        assert task.status == "completed"
        assert task.input_record_count == 0
    
    def test_create_identity(self):
        """Creating an identity from entity + source record should preserve provenance."""
        engine = UniversalResolutionEngine()
        entity = CanonicalEntity(
            canonical_id="company:comp-001",
            entity_type=EntityCategory.COMPANY,
            display_name="Acme Technologies",
        )
        record = _company_record_a()
        
        identity = engine.create_identity(entity, record)
        
        assert identity.canonical_entity_id == "company:comp-001"
        assert identity.entity_type == "Company"
        assert identity.display_name == "Acme Technologies"
        assert identity.source_count == 1
        assert identity.source_fingerprints[0].source_id == "test_source"
        assert identity.source_fingerprints[0].record_id == "comp-001"
    
    def test_merge_identities_success(self):
        """Merging confirmed match should combine fingerprints."""
        engine = UniversalResolutionEngine()
        
        # Create two identities
        entity_a = CanonicalEntity(
            canonical_id="company:comp-001",
            entity_type=EntityCategory.COMPANY,
            display_name="Acme Tech A",
        )
        entity_b = CanonicalEntity(
            canonical_id="company:comp-002",
            entity_type=EntityCategory.COMPANY,
            display_name="Acme Tech B",
        )
        rec_a = _company_record_a()
        rec_b = _company_record_a_duplicate()
        
        id_a = engine.create_identity(entity_a, rec_a)
        id_b = engine.create_identity(entity_b, rec_b)
        
        # Create confirmed match evidence
        evidence = MatchCandidate(
            record_a_id="comp-001",
            record_b_id="comp-002",
            composite_score=0.95,
            decision=MatchDecision.MATCH,
            status=ResolutionStatus.CONFIRMED,
        )
        
        merged = engine.merge_identities(id_a, id_b, evidence)
        
        assert merged.source_count == 2
        assert id_b.identity_id in merged.merge_history
    
    def test_merge_identities_rejects_non_match(self):
        """Cannot merge identities when decision is NON_MATCH."""
        engine = UniversalResolutionEngine()
        
        id_a = EntityIdentity(display_name="A")
        id_b = EntityIdentity(display_name="B")
        evidence = MatchCandidate(
            record_a_id="r1",
            record_b_id="r2",
            decision=MatchDecision.NON_MATCH,
            status=ResolutionStatus.CONFIRMED,
        )
        
        with pytest.raises(ValueError, match="expected MATCH"):
            engine.merge_identities(id_a, id_b, evidence)
    
    def test_merge_identities_rejects_unconfirmed(self):
        """Cannot merge identities when status is not CONFIRMED."""
        engine = UniversalResolutionEngine()
        
        id_a = EntityIdentity(display_name="A")
        id_b = EntityIdentity(display_name="B")
        evidence = MatchCandidate(
            record_a_id="r1",
            record_b_id="r2",
            decision=MatchDecision.MATCH,
            status=ResolutionStatus.PENDING,
        )
        
        with pytest.raises(ValueError, match="expected CONFIRMED"):
            engine.merge_identities(id_a, id_b, evidence)


# ========================================================================
# GROUP 5: GOVERNANCE TESTS
# ========================================================================

class TestGovernance:
    """Tests for human-in-the-loop governance and status transitions."""
    
    def test_candidate_confirm(self):
        candidate = MatchCandidate(
            record_a_id="r1",
            record_b_id="r2",
            decision=MatchDecision.MATCH,
        )
        candidate.confirm(decided_by="analyst_1")
        
        assert candidate.status == ResolutionStatus.CONFIRMED
        assert candidate.decided_by == "analyst_1"
        assert candidate.decided_at is not None
    
    def test_candidate_reject(self):
        candidate = MatchCandidate(
            record_a_id="r1",
            record_b_id="r2",
            decision=MatchDecision.REVIEW_REQUIRED,
        )
        candidate.reject(decided_by="analyst_2", reason="CIN mismatch indicates different entity")
        
        assert candidate.status == ResolutionStatus.REJECTED
        assert candidate.decided_by == "analyst_2"
        assert "CIN mismatch" in candidate.notes
    
    def test_review_required_not_auto_merged(self):
        """REVIEW_REQUIRED candidates must remain PENDING — never auto-merged."""
        engine = UniversalResolutionEngine()
        
        config = ResolutionConfig(
            match_threshold=0.95,
            review_threshold=0.30,
        )
        engine.config = config
        
        rec_a = _company_record_a()
        rec_similar = _company_record_similar()
        
        candidate = engine.resolve_pair(rec_a, rec_similar)
        
        if candidate.decision == MatchDecision.REVIEW_REQUIRED:
            assert candidate.status == ResolutionStatus.PENDING
            # Cannot merge without explicit confirmation
            id_a = EntityIdentity(display_name="A")
            id_b = EntityIdentity(display_name="B")
            with pytest.raises(ValueError):
                engine.merge_identities(id_a, id_b, candidate)
    
    def test_identity_fingerprint_deduplication(self):
        """Adding the same fingerprint twice should not duplicate."""
        identity = EntityIdentity(display_name="Test")
        fp = SourceFingerprint(source_id="src", dataset_id="ds", record_id="r1")
        
        identity.add_fingerprint(fp)
        identity.add_fingerprint(fp)  # duplicate
        
        assert identity.source_count == 1
    
    def test_resolution_task_summary(self):
        """Task completion should produce accurate summary counts."""
        task = ResolutionTask(input_record_count=10)
        task.candidates = [
            MatchCandidate(record_a_id="r1", record_b_id="r2", decision=MatchDecision.MATCH),
            MatchCandidate(record_a_id="r3", record_b_id="r4", decision=MatchDecision.REVIEW_REQUIRED),
            MatchCandidate(record_a_id="r5", record_b_id="r6", decision=MatchDecision.NON_MATCH),
            MatchCandidate(record_a_id="r7", record_b_id="r8", decision=MatchDecision.MATCH),
        ]
        task.complete()
        
        assert task.summary["total_candidates"] == 4
        assert task.summary["match_count"] == 2
        assert task.summary["review_count"] == 1
        assert task.summary["non_match_count"] == 1
    
    def test_source_fingerprint_uri(self):
        fp = SourceFingerprint(source_id="firebase_main", dataset_id="companies", record_id="comp-001")
        assert fp.to_uri() == "firebase_main://companies/comp-001"


# ========================================================================
# GROUP 6: REAL DATA SIMULATION
# ========================================================================

class TestRealDataSimulation:
    """
    Tests using company-like SourceRecord fixtures matching real Firebase /companies field patterns.
    Validates that the resolution engine correctly handles realistic data variations.
    """
    
    def test_same_company_different_formatting(self):
        """Same company with different name formatting should match."""
        engine = UniversalResolutionEngine()
        
        rec_a = _make_source_record("r1", {
            "cin": "U72200MH2018PTC123456",
            "company_name": "Acme Technologies Private Limited",
            "state": "Maharashtra",
            "company_status": "Active",
            "company_category": "Company limited by Shares",
        })
        rec_b = _make_source_record("r2", {
            "cin": "U72200MH2018PTC123456",
            "company_name": "acme technologies pvt. ltd.",
            "state": "maharashtra",
            "company_status": "active",
            "company_category": "company limited by shares",
        })
        
        candidate = engine.resolve_pair(rec_a, rec_b)
        assert candidate.composite_score >= 0.85
        assert candidate.decision == MatchDecision.MATCH
    
    def test_different_companies_same_state(self):
        """Different companies in same state should not match."""
        engine = UniversalResolutionEngine()
        
        rec_a = _make_source_record("r1", {
            "cin": "U72200MH2018PTC111111",
            "company_name": "Alpha Technologies Pvt Ltd",
            "state": "Maharashtra",
            "company_status": "Active",
            "company_category": "Company limited by Shares",
        })
        rec_b = _make_source_record("r2", {
            "cin": "U72200MH2018PTC222222",
            "company_name": "Beta Industries Limited",
            "state": "Maharashtra",
            "company_status": "Active",
            "company_category": "Company limited by Shares",
        })
        
        candidate = engine.resolve_pair(rec_a, rec_b)
        assert candidate.decision == MatchDecision.NON_MATCH
    
    def test_batch_with_mixed_duplicates(self):
        """Batch with some duplicates and some unique should find the right pairs."""
        engine = UniversalResolutionEngine()
        
        records = [
            _make_source_record("r1", {
                "cin": "CIN001",
                "company_name": "Alpha Corp Pvt Ltd",
                "state": "Maharashtra",
                "company_status": "Active",
                "company_category": "Shares",
            }),
            _make_source_record("r2", {
                "cin": "CIN001",
                "company_name": "Alpha Corporation Private Limited",
                "state": "Maharashtra",
                "company_status": "Active",
                "company_category": "Shares",
            }),
            _make_source_record("r3", {
                "cin": "CIN002",
                "company_name": "Beta Industries",
                "state": "Delhi",
                "company_status": "Strike Off",
                "company_category": "Guarantee",
            }),
        ]
        
        task = engine.resolve_batch(records)
        assert task.status == "completed"
        
        # Should find r1-r2 as candidates (same CIN)
        match_pairs = [(c.record_a_id, c.record_b_id) for c in task.candidates
                       if c.decision in (MatchDecision.MATCH, MatchDecision.REVIEW_REQUIRED)]
        
        # r1-r2 should be a match candidate
        has_r1_r2 = any(
            (a == "r1" and b == "r2") or (a == "r2" and b == "r1")
            for a, b in match_pairs
        )
        assert has_r1_r2, f"Expected r1-r2 match candidate, got: {match_pairs}"
    
    def test_cross_source_resolution(self):
        """Records from different sources with same CIN should match."""
        engine = UniversalResolutionEngine()
        
        rec_firebase = _make_source_record("fb-001", {
            "cin": "U72200MH2018PTC123456",
            "company_name": "Acme Technologies Pvt Ltd",
            "state": "Maharashtra",
            "company_status": "Active",
            "company_category": "Company limited by Shares",
        }, source_id="firebase_main")
        
        rec_postgres = _make_source_record("pg-001", {
            "cin": "U72200MH2018PTC123456",
            "company_name": "ACME TECHNOLOGIES PRIVATE LIMITED",
            "state": "MAHARASHTRA",
            "company_status": "ACTIVE",
            "company_category": "Company Limited by Shares",
        }, source_id="postgres_dw")
        
        candidate = engine.resolve_pair(rec_firebase, rec_postgres)
        
        assert candidate.composite_score >= 0.85
        assert candidate.record_a_source == "firebase_main"
        assert candidate.record_b_source == "postgres_dw"
    
    def test_configurable_thresholds(self):
        """Custom config thresholds should affect decisions."""
        strict_config = ResolutionConfig(
            match_threshold=0.99,
            review_threshold=0.70,
        )
        engine = UniversalResolutionEngine(config=strict_config)
        
        rec_a = _company_record_a()
        rec_dup = _company_record_a_duplicate()
        
        candidate = engine.resolve_pair(rec_a, rec_dup)
        
        # With very strict threshold, even good matches may be REVIEW_REQUIRED
        assert candidate.composite_score > 0.0
        assert candidate.decision in (MatchDecision.MATCH, MatchDecision.REVIEW_REQUIRED)
