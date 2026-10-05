# ReasonChain — Universal Entity Resolution & Identity Management

## Overview

ReasonChain is designed to ingest and unify heterogeneous enterprise data sources (PostgreSQL, Firebase Realtime Database, CRM systems, ERPs, sanctions lists) into a single, cohesive, high-confidence Knowledge Graph. Because real-world data from different origins frequently contains typos, abbreviations, varying legal forms, partial identifiers, and duplicate entries, ReasonChain incorporates a **source-agnostic Universal Entity Resolution & Identity Management Engine**.

The engine operates on canonical representations and raw source records alike, generating evidence-backed identity decisions with human-in-the-loop governance.

---

## Key Design Principles

1. **Source-Agnostic Operation**: Works with any source type via `SourceFingerprint` and universal dictionaries, without coupling to PostgreSQL or Firebase schemas.
2. **Multi-Strategy Normalization**: Pluggable field normalizers handle legal suffix stripping (`Pvt Ltd`, `LLC`, `Corp`), case folding, whitespace collapsing, and alphanumeric identifier normalization.
3. **Compound Comparators with Null-Awareness**: Combines exact string matching, fuzzy Levenshtein similarity, token-set overlap, numeric thresholds, and domain-specific rules (e.g., CIN comparator). Missing fields degrade confidence gracefully rather than causing false negatives or false positives.
4. **Efficient Blocking Pipeline**: Avoids $O(N^2)$ exhaustive comparisons by using blocking strategies:
   - **Exact Blocking**: Groups records sharing a key (e.g. `state_code` or `pincode`).
   - **Prefix Blocking**: Groups records sharing a character prefix (e.g. first 4 characters of company name).
   - **Sorted Neighborhood**: Windows through lexicographically sorted records to catch slight prefix variations.
5. **Evidence-Backed Decision Making**: Every pairwise match produces a granular `FieldEvidence` trail detailing the comparator used, raw values, normalized values, weight, and confidence score.
6. **Human-in-the-Loop Governance**: Decisions are classified into `CONFIRMED_MATCH`, `REVIEW_REQUIRED`, and `NON_MATCH`. Low-confidence matches require analyst review before being merged into canonical identities.
7. **Identity Immutability & Audit Trail**: Merges and manual confirmations update canonical `EntityIdentity` records while preserving complete provenance back to the source records.

---

## Architecture Diagram

```
+-------------------------------------------------------------------------------+
|                             Heterogeneous Sources                             |
|          PostgreSQL (Relational)    |    Firebase RTDB (Document/JSON)        |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                             Source Normalizers                                |
|   normalize_company_name  |  normalize_cin  |  normalize_address  |  generic  |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                              Blocking Pipeline                                |
|       ExactBlockingKey     |     PrefixBlockingKey    |   SortedNeighborhood  |
+-------------------------------------------------------------------------------+
                                      | Candidate Pairs
                                      v
+-------------------------------------------------------------------------------+
|                            Compound Comparators                               |
|   ExactComparator  |  FuzzyComparator  |  TokenSetComparator  |  CINComparator|
+-------------------------------------------------------------------------------+
                                      | FieldEvidences & Aggregate Confidence
                                      v
+-------------------------------------------------------------------------------+
|                         Decision & Governance Matrix                          |
|   >= match_threshold (0.85)     -->  CONFIRMED_MATCH                          |
|   >= review_threshold (0.60)    -->  REVIEW_REQUIRED (Analyst Queue)          |
|   <  review_threshold           -->  NON_MATCH                                |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                           Canonical EntityIdentity                            |
|             canonical_id | source_fingerprints | properties | status          |
+-------------------------------------------------------------------------------+
```

---

## Core Models (`app.resolution.models`)

### `MatchDecision`
- `MATCH`: High confidence match above the automatic match threshold.
- `NO_MATCH`: Low confidence, records refer to distinct entities.
- `REVIEW_REQUIRED`: Borderline similarity requiring human analyst review.

### `ResolutionOrigin`
- `DETERMINISTIC_EXACT`: Exact key/identifier equivalence (e.g. identical CIN).
- `DETERMINISTIC_FUZZY`: Calculated fuzzy similarity across multiple attributes.
- `AI_ASSISTED`: Semantic match suggested by neural language models.
- `HUMAN_CONFIRMED`: Explicitly verified by a human analyst.
- `HUMAN_REJECTED`: Explicitly dismissed by a human analyst.

### `FieldEvidence`
Stores per-attribute comparison diagnostics:
- `field_name`: The field compared (e.g. `company_name`, `cin`, `state`).
- `comparator`: Name of comparator (e.g. `token_set`, `cin_exact`).
- `score`: Similarity score in $[0.0, 1.0]$.
- `weight`: Weight of this field in the overall decision.
- `left_raw` / `right_raw`: Original values.
- `left_normalized` / `right_normalized`: Cleaned values.
- `notes`: Human-readable justification.

### `MatchCandidate`
Encapsulates a pairwise comparison result:
- `candidate_id`: Unique identifier.
- `left_fingerprint` / `right_fingerprint`: Record identifiers.
- `overall_confidence`: Weighted aggregate score $[0.0, 1.0]$.
- `decision`: `MatchDecision`.
- `origin`: `ResolutionOrigin`.
- `evidences`: List of `FieldEvidence`.
- `status`: `ResolutionStatus` (`PROPOSED`, `CONFIRMED`, `REJECTED`, `SUPERSEDED`).
- `reviewed_by` / `reviewed_at` / `review_notes`: Audit attributes.

### `EntityIdentity`
Canonical representation of a resolved real-world entity:
- `canonical_id`: Global unique entity identifier (`id_<uuid>`).
- `entity_type`: Target entity type (e.g. `Company`, `Person`).
- `source_fingerprints`: List of source records mapped to this identity.
- `canonical_properties`: Consolidated authoritative attributes.
- `confidence`: Overall confidence in the identity resolution.
- `created_at` / `updated_at`: Timestamps.

---

## Normalization Engine (`app.resolution.normalizers`)

Field normalization standardizes formatting differences before running comparators:

| Normalizer | Target Fields | Transformations |
| :--- | :--- | :--- |
| `normalize_company_name` | `company_name`, `name` | Lowercases, strips punctuation, normalizes corporate suffixes (`private limited` $\rightarrow$ `pvt ltd`, `corporation` $\rightarrow$ `corp`, etc.), collapses whitespace. |
| `normalize_cin` | `cin`, `registration_no` | Uppercases, strips spaces, hyphens, and non-alphanumeric characters. |
| `normalize_address` | `address`, `registered_office` | Standardizes street abbreviations (`street` $\rightarrow$ `st`, `road` $\rightarrow$ `rd`, `avenue` $\rightarrow$ `ave`), removes punctuation. |
| `normalize_generic` | Any text field | Lowercases, strips leading/trailing whitespace, collapses internal whitespace. |

---

## Comparators & Scoring (`app.resolution.comparators`)

- **ExactComparator**: Returns `1.0` if normalized values are identical, `0.0` otherwise.
- **FuzzyComparator**: Uses Levenshtein edit distance via `difflib.SequenceMatcher` to compute smooth similarity in $[0.0, 1.0]$.
- **TokenSetComparator**: Computes Jaccard/set overlap of words, handling reordered names (e.g. `"Acme Global Technologies Pvt Ltd"` vs `"Acme Technologies Global Ltd"`).
- **CINComparator**: Strict matching for Indian Corporate Identification Numbers; returns `1.0` on exact alphanumeric match, `0.0` otherwise.
- **NumericComparator**: Percentage-based relative difference for financial or count fields.
- **Null-Awareness**: When a field is missing in one or both records, the comparator returns `0.0` confidence with `is_null=True`. The engine ignores or re-weights missing fields rather than penalizing candidate matches.

---

## Blocking Pipeline (`app.resolution.blocking`)

Pairwise resolution across large datasets ($N$ records) requires $O(N^2)$ comparisons without indexing. The blocking pipeline drastically cuts candidate pair generation:

1. **Exact Blocking**:
   - Groups records on attributes like `state_code` or `pincode`.
   - Records with matching keys are paired.
2. **Prefix Blocking**:
   - Computes prefix keys (e.g. first 4 characters of normalized name).
   - Generates candidate pairs for records sharing common prefixes.
3. **Sorted Neighborhood**:
   - Sorts records lexicographically by blocking key.
   - Slides a fixed window of size $W$ over the sorted array.
   - Pairs all records within the window to capture minor prefix typos.

The pipeline computes the union of candidate pairs while enforcing max pair bounds to protect memory and runtime.

---

## Universal Resolution Engine (`app.resolution.engine`)

The `UniversalResolutionEngine` coordinates normalizers, blocking, comparators, and identity persistence:

- `resolve_pair(record_a, record_b)`: Compares two records, accumulates field evidence, computes weighted confidence, and assigns a match decision.
- `resolve_batch(records, max_pairs=5000)`: Runs blocking over a batch of records, executes pairwise comparisons on candidate pairs, and returns candidate matches.
- `create_identity(record, entity_type)`: Instantiates a new canonical `EntityIdentity` from a source record.
- `merge_identities(target_identity, source_identity, candidate)`: Merges two confirmed identities, combining source fingerprints, updating properties, and recording match provenance.

---

## REST API Endpoints (`app.routes.resolution`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/resolution/resolve-pair` | Compare two arbitrary source records and obtain evidence-backed match decision. |
| `POST` | `/api/resolution/resolve-batch` | Run blocking and resolution over a batch of source records. |
| `GET` | `/api/resolution/candidates` | Retrieve proposed match candidates (with status filtering). |
| `POST` | `/api/resolution/candidates/{candidate_id}/confirm` | Confirm a match candidate and trigger identity merge. |
| `POST` | `/api/resolution/candidates/{candidate_id}/reject` | Dismiss a candidate as non-matching. |
| `GET` | `/api/resolution/identities` | List canonical resolved entity identities. |
| `GET` | `/api/resolution/identities/{canonical_id}` | Retrieve details and source fingerprints for a canonical identity. |
| `GET` | `/api/resolution/config` | View active thresholds, field weights, and blocking strategies. |
| `PUT` | `/api/resolution/config` | Update resolution thresholds dynamically. |

---

## Verification & Testing

The resolution subsystem is covered by 68 unit and integration tests in `backend/tests/test_entity_resolution.py`:
- Normalizers (name suffixes, whitespace, CIN formatting, addresses)
- Comparators (fuzzy, token-set, exact, CIN, null handling)
- Blocking strategies (exact, prefix, sorted neighborhood, union pipelines)
- Resolution engine (pair resolution, batch resolution, identity lifecycle, merge validation)
- Governance & human-in-the-loop actions (confirm, reject, audit trails)
- Real enterprise data simulations (variations in company formatting, cross-source reconciliation)
