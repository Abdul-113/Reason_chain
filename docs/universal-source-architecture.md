# ReasonChain Universal Source Contract & Semantic Mapping Architecture

## 1. Architectural Motivation

In earlier iterations of ReasonChain, data connectors were coupled directly to domain transformation logic:
- A PostgreSQL reader fed directly into PostgreSQL-specific canonical transformation functions.
- A Firebase Realtime Database connector fed into Firebase-specific dictionary mapping logic.

As the platform scales to support heterogeneous enterprise data sources (PostgreSQL, Firebase, MongoDB, CSV files, ERP systems, and REST APIs), a **source-specific mapping pattern creates an unsustainable $O(N)$ architecture**, where each database engine requires its own custom semantic mapper, profiling logic, and validation pipeline.

To achieve research-grade enterprise reasoning, ReasonChain adopts a **Universal Source Contract & Source-Agnostic Semantic Mapping Foundation**.

---

## 2. Core Architecture Pipeline

The ingestion and semantic interpretation lifecycle is strictly decoupled:

```
┌─────────────────────────────────────────────────────────────────┐
│                    PHYSICAL DATA SOURCES                        │
│   [PostgreSQL Warehouse]   [Firebase RTDB]   [Future Mongo/API] │
└────────────────┬───────────────────┬─────────────────────┬──────┘
                 │                   │                     │
                 ▼                   ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SOURCE ADAPTER LAYER                         │
│  PostgreSQLSourceAdapter   FirebaseSourceAdapter   ...          │
│  - Engine-specific drivers (psycopg2, firebase-admin)           │
│  - Authentication & connection management                       │
│  - Bounded physical queries (LIMIT/OFFSET, shallow reads)       │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                   UNIVERSAL SOURCE CONTRACT                     │
│  (BaseSourceAdapter: connect, discover, profile, extract)       │
└────────────────┬─────────────────────────────────┬──────────────┘
                 │                                 │
                 ▼                                 ▼
┌─────────────────────────────────┐ ┌─────────────────────────────┐
│    UNIVERSAL SOURCE METADATA    │ │ UNIVERSAL INTERMEDIATE REPR │
│  - SourceDescriptor             │ │  - SourceLocation           │
│  - DatasetDescriptor            │ │  - SourceRecord             │
│  - FieldDescriptor              │ │  - SourceBatch              │
│  - ProfileResult                │ └──────────────┬──────────────┘
└─────────────────────────────────┘                │
                                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                UNIVERSAL SEMANTIC MAPPING ENGINE                │
│  (UniversalMappingEngine + Declarative MappingSpecification)    │
│  - EntityMappingRule & RelationshipMappingRule                  │
│  - ZERO source-type branching (no 'if firebase' / 'if postgres')│
│  - Field transformations (UPPERCASE, PARSE_FLOAT, etc.)         │
│  - Optional non-authoritative AI Proposals (SemanticMappingAsst)│
│  - Deterministic validation & human approval gates              │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CANONICAL REASONCHAIN MODEL                   │
│  - CanonicalEntity & CanonicalRelationship                      │
│  - ProvenanceMetadata (SourceType, record URI, timestamps)      │
│  - ConfidenceMetadata & TemporalMetadata                        │
│  - CanonicalGraphPayload                                        │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                 GRAPH STORAGE & REASONING                       │
│  - Neo4j Knowledge Graph                                        │
│  - Multi-hop deterministic and neural verification              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Concrete Example: Heterogeneous Sources -> Unified Intermediate Representation

Consider two distinct sources providing corporate registration facts:
1. **Firebase Realtime Database**: A nested JSON object under `/companies` with Indian MCA registration fields (`cin`, `company_name`, `state_code`).
2. **PostgreSQL Data Warehouse**: A relational row in table `companies` with international corporate fields (`id`, `name`, `country_code`).

### Step A: Source Normalization into `SourceRecord`

Both source adapters extract raw data and produce standard `SourceRecord` instances:

#### 1. From Firebase RTDB:
```python
SourceRecord(
    source_id="firebase_rtdb",
    dataset_id="companies",
    record_id="U72900DL2020PTC368921",
    attributes={
        "corp_id": "U72900DL2020PTC368921",
        "name": "Acme Firebase Technologies Pvt Ltd",
        "status": "active",
        "capital": "5000000.0",
        "country": "IN",
        "country_name": "India",
    },
    source_location=SourceLocation(
        source_id="firebase_rtdb",
        dataset_id="companies",
        record_key="U72900DL2020PTC368921",
    ),
    provenance_metadata=ProvenanceMetadata(
        source_system="firebase_rtdb",
        source_type=SourceType.FIREBASE,
        source_record_id="U72900DL2020PTC368921",
        source_table="companies",
        source_path="/companies/U72900DL2020PTC368921",
    )
)
```

#### 2. From PostgreSQL:
```python
SourceRecord(
    source_id="postgres_main",
    dataset_id="companies",
    record_id="C001",
    attributes={
        "corp_id": "C001",
        "name": "Global Postgres Solutions Inc",
        "status": "dormant",
        "capital": 10000000,
        "country": "US",
        "country_name": "United States",
    },
    source_location=SourceLocation(
        source_id="postgres_main",
        dataset_id="companies",
        record_key="C001",
    ),
    provenance_metadata=ProvenanceMetadata(
        source_system="postgres_main",
        source_type=SourceType.POSTGRES,
        source_record_id="C001",
        source_table="companies",
        source_path="companies/C001",
    )
)
```

---

### Step B: Single Universal Mapping Specification

A single, declarative `MappingSpecification` translates any record matching this dataset structure:

```python
spec = MappingSpecification(
    mapping_id="corporate_registry_mapping",
    dataset_id="companies",
    target_entities=[
        EntityMappingRule(
            target_entity_category=EntityCategory.COMPANY,
            identifier_field="corp_id",
            id_namespace="company",
            display_name_field="name",
            field_mappings=[
                FieldMappingRule(
                    source_field="status",
                    target_property="status",
                    transformation=TransformationRule(transform_type=TransformType.UPPERCASE),
                ),
                FieldMappingRule(
                    source_field="capital",
                    target_property="authorized_capital",
                    transformation=TransformationRule(transform_type=TransformType.PARSE_FLOAT),
                ),
            ],
            confidence=0.95,
        )
    ],
    target_relationships=[
        RelationshipMappingRule(
            target_relationship_type=CanonicalRelationshipType.LOCATED_IN,
            source_entity_ref="$PRIMARY",
            source_entity_type="Company",
            target_entity_ref="country",
            target_entity_type="Country",
            generate_target_entity=True,
            target_entity_category=EntityCategory.COUNTRY,
            target_entity_name_field="country_name",
            confidence=0.90,
        )
    ],
)
```

---

### Step C: Universal Mapping Execution

`UniversalMappingEngine.map_record(record, spec)` executes with **zero knowledge** of whether the record came from Firebase or PostgreSQL:

- Both produce a `CanonicalEntity` of category `Company` with exact provenance retained.
- Both produce an auto-generated `CanonicalEntity` of category `Country`.
- Both produce a `CanonicalRelationship` of type `LOCATED_IN`.

---

## 4. Key Architectural Boundaries

1. **Adapters Own Mechanics**:
   - `FirebaseSourceAdapter`: Manages Admin SDK, RTDB reference trees, `/companies` paths.
   - `PostgreSQLSourceAdapter`: Manages SQL connections, cursors, `information_schema.tables`.
2. **Semantic Engine is Agnostic**:
   - `UniversalMappingEngine` operates purely on `SourceRecord.attributes` and `MappingSpecification`.
   - Never contains database driver dependencies or `if source_type == '...'` branching.
3. **AI Assistance Boundary**:
   - The `SemanticMappingAssistant` protocol defines the contract for generating proposals.
   - All AI proposals enter as `origin = MappingOrigin.AI_PROPOSED` and `approval_status = ApprovalStatus.PENDING`.
   - The LLM is **never authoritative** over Knowledge Graph ground truth.
4. **Auditability & Provenance**:
   - Every entity and relationship holds `ProvenanceMetadata` pointing back to the physical source coordinate.
