# Firebase Data Profiling & Structural Discovery

ReasonChain includes a **safe, read-only Firebase Data Profiler** designed to observe, inspect, and analyze real Firebase Realtime Database structures before mapping them into canonical knowledge graph entities.

---

## 1. Why Profiling Exists

Firebase Realtime Database does not enforce a relational tabular schema like PostgreSQL. Instead, it stores hierarchical JSON trees where:
- Node keys represent collections, documents, or arbitrary branches (e.g. `/companies`, `/suppliers`, `/registry`).
- Documents within the same branch may contain optional, missing, or heterogeneous field structures.
- Nested sub-objects (`address.city`) and arrays (`directors[].person_id`) may be present without formal foreign key constraints.

Before converting raw Firebase data into `CanonicalEntity` and `CanonicalRelationship` instances in Neo4j, ReasonChain uses **observational profiling** to determine the real structural characteristics of the data.

---

## 2. Strict Observational Boundary

> [!IMPORTANT]
> **Data profiling is purely observational.**
> - Profiling **never** decides that `companyName` = `Company` entity.
> - Profiling **never** decides that `supplierId` = `SUPPLIES` relationship.
> - Profiling **never** writes or mutates data in Neo4j.
> - Profiling **never** generates mock or synthetic Firebase data.

Semantic mapping decisions are deliberately separated into the subsequent Canonical Mapping phase.

---

## 3. Bounded Read Safety Guarantees

The profiler is designed for production databases containing tens of thousands or millions of records (e.g., the real ReasonChain instance containing 10,000+ records under `/companies`).

### Protection Measures
1. **Query-Level Bounding**: The profiler queries Firebase using:
   ```python
   ref.order_by_key().limit_to_first(sample_limit).get()
   ```
   Unrestricted root reads (`ref.get()`) are strictly forbidden.
2. **Configurable Caps**:
   - `sample_limit`: Bounded between 1 and 50 (default: 10).
   - `max_depth`: Bounded between 1 and 8 (default: 4) to prevent deep recursion.
   - `max_fields`: Bounded between 5 and 300 (default: 100).
3. **Data Sanitization**:
   - String sample values longer than 60 characters are safely truncated.
   - Sensitive keys (`password`, `secret`, `token`, `private_key`) are automatically redacted from sample values.

---

## 4. Heuristic Evidence Detection

The profiler evaluates each discovered field using evidence-based heuristics:

### A. Candidate Identifiers (`candidate_identifier`)
- **Naming Pattern**: Matches primary ID regex (`id`, `uid`, `uuid`, `guid`, `cin`, `key`, `registration_number`, `reg_no`).
- **Presence Ratio**: Checked for 100% presence (`presence_count == total_sampled`).
- **Uniqueness**: Checked for 100% distinct sample values across the sampled records.
- **Child Key**: Direct Firebase node key (`_key`).

### B. Candidate References (`candidate_reference`)
- **Naming Pattern**: Matches foreign reference suffix regex (`_id`, `Id`, `_key`, `Key`, `_code`, `Code`, `_ref`, `Ref`).
- **Data Types**: Alphanumeric strings or numbers.
- **Cross-Branch Key Matching**: If `cross_validate_references=True`, sampled reference values are cross-checked against child keys and candidate ID values of other discovered branches to calculate an empirical `match_rate` (e.g. 96% match with `/companies` keys).

### C. Candidate Temporal Fields (`candidate_temporal`)
- **Naming Pattern**: Field name contains `date`, `time`, `created`, `updated`, `_at`, `timestamp`, `start_date`, `end_date`, `dob`.
- **Value Matching**:
  - ISO-8601 timestamps (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SSZ`).
  - Standard formatted dates (`DD/MM/YYYY`, `MM/DD/YYYY`).
  - Unix epoch timestamps (numeric seconds `> 1000000000` or milliseconds `> 1000000000000`).

---

## 5. REST API & Data Contracts

### Endpoint
```http
POST /api/firebase/profile
Content-Type: application/json
```

### Request Payload
```json
{
  "paths": ["/companies"],
  "sample_limit": 10,
  "max_depth": 4,
  "max_fields": 100,
  "cross_validate_references": true
}
```

### Response Structure (`FirebaseDataProfileResponse`)
- `success`: Boolean indicator.
- `profiled_at`: UTC ISO timestamp.
- `config_limits`: Applied sampling and depth bounds.
- `total_branches_profiled`: Number of branches analyzed.
- `branches`: Array of `FirebaseBranchProfile`:
  - `path`, `name`, `approx_child_count`, `sample_size`, `is_collection_like`.
  - `fields`: Array of `FirebaseFieldProfile` with observed types, presence count, null count, missing count, candidate flags, and safe sample values.
  - `candidate_identifiers`: List of candidate ID field paths.
  - `candidate_references`: List of candidate reference field paths.
  - `candidate_temporal_fields`: List of candidate temporal field paths.
  - `reference_cross_checks`: Empirical cross-branch match rates and evidence.
- `human_readable_summary`: Markdown report formatted with summary tables.

---

## 6. Next Step: Canonical Mapping Handoff

The structured data profile generated by this profiler serves as the formal input for the next development phase:
```
Firebase Data Profile
        ↓
Firebase → Canonical Entity Mapper (FirebaseMapper)
        ↓
CanonicalEntity & CanonicalRelationship Instances
        ↓
Multi-Source Neo4j Knowledge Graph Ingestion
```
