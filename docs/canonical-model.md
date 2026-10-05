# ReasonChain Canonical Domain Model & Provenance Architecture

## 1. Why the Canonical Model Exists
In early versions of ReasonChain, PostgreSQL table structures directly dictated node and relationship representations in Neo4j. This tight coupling introduced two major limitations:

1. **Source Lock-in**: Adding non-relational source connectors (such as Firebase Realtime Database, REST APIs, or external compliance registries) required rewriting graph mapping rules and database query logic.
2. **Loss of Provenance & Evidence**: Ingested entities did not retain origin metadata, making it impossible to trace facts back to their source system, table, path, or extraction confidence.

The **Canonical Domain Model** decouples source ingestion from graph storage. The pipeline architecture is now:

```
SOURCE SYSTEM (PostgreSQL / Firebase / API)
        ↓
SOURCE-SPECIFIC READER
        ↓
RAW / DISCOVERED DATA
        ↓
CANONICAL REASONCHAIN MODEL (Domain Entities & Relationships + Provenance)
        ↓
NORMALIZATION / ENTITY RESOLUTION
        ↓
NEO4J STORAGE & REASONING ENGINE
```

---

## 2. Entity Model (`backend/app/domain/entities.py`)
Canonical entities represent source-independent enterprise objects.

Supported Categories (`EntityCategory` Enum):
- `Company`
- `Person`
- `Supplier`
- `Contract`
- `Sanction`
- `Country`
- `Account`
- `Transaction`
- `Device`
- `Rule`
- `Custom` (for dynamic future extensions)

### Schema & Fields
- `canonical_id`: Stable internal identifier (e.g. `"C001"` or `"US"`).
- `entity_type`: Canonical category (`Company`, `Person`, etc.).
- `display_name`: Human-readable label.
- `properties`: Typed key-value properties dictionary.
- `source_references`: List of `ProvenanceMetadata` records tracking source origins.
- `confidence`: `ConfidenceMetadata` (mapping, entity resolution, and reliability scores).
- `temporal`: `TemporalMetadata` (optional time-bound validity bounds).

---

## 3. Relationship Model (`backend/app/domain/relationships.py`)
Canonical relationships represent semantic edges connecting entities.

Supported Types (`CanonicalRelationshipType` Enum):
- `OWNS`
- `DIRECTOR_OF`
- `HAS_DIRECTOR`
- `SUPPLIES`
- `HAS_CONTRACT`
- `REGISTERED_IN`
- `SANCTIONED_BY`
- `TRANSACTS_WITH`
- `USES`
- `VIOLATES`
- `LOCATED_IN`
- `CUSTOM`

### Schema & Fields
- `relationship_id`: Unique edge identifier (e.g. `"S001-C001-SUPPLIES"`).
- `relationship_type`: Canonical semantic relationship type.
- `source_entity_id`: Canonical ID of source entity.
- `source_entity_type`: Semantic type of source entity.
- `target_entity_id`: Canonical ID of destination entity.
- `target_entity_type`: Semantic type of destination entity.
- `properties`: Dynamic edge properties.
- `provenance`: Origin metadata (`ProvenanceMetadata`).
- `confidence`: Edge confidence rating (`ConfidenceMetadata`).
- `temporal`: Validity timestamps (`TemporalMetadata`).

---

## 4. Provenance / Source Evidence Model (`backend/app/domain/provenance.py`)
Tracks data lineage and origin evidence without source-specific conditionals spreading through the codebase.

Fields:
- `source_system`: Origin system name (`"postgres"`, `"firebase_prod"`, etc.)
- `source_type`: Connector type (`postgres`, `firebase`, `external_registry`, `csv`, `rest_api`, `manual`)
- `source_record_id`: Primary key or record ID in source system
- `source_path`: Hierarchical NoSQL path (e.g. `/companies/C101`)
- `source_table`: Source table name (e.g. `companies`)
- `source_field`: Specific source field if single-attribute origin
- `source_document`: Document or filing reference code
- `ingested_at`: ISO timestamp when ingested into ReasonChain
- `observed_at`: ISO timestamp when fact was observed in source
- `valid_from` / `valid_to`: Time-bound validity timestamps
- `source_reliability`: Source reliability score (0.0 to 1.0)
- `extraction_confidence`: Extraction/mapping confidence score (0.0 to 1.0)

---

## 5. Confidence & Trust Model (`backend/app/domain/confidence.py`)
Distinguishes confidence dimensions to prepare for future probabilistic graph reasoning:
- `mapping_confidence`: Confidence in schema mapping.
- `entity_confidence`: Confidence in entity resolution / identity matching.
- `relationship_confidence`: Confidence in relationship validity.
- `source_reliability`: Reliability rating of origin source system.

---

## 6. Temporal Metadata Model (`backend/app/domain/temporal.py`)
Optional temporal bounds for facts:
- `valid_from`: Start timestamp of fact validity.
- `valid_to`: Expiration timestamp of fact.
- `observed_at`: Timestamp when fact was observed in origin system.
- `ingested_at`: Timestamp when record entered ReasonChain.

---

## 7. How PostgreSQL Maps Into the Canonical Model
`backend/app/ingestion/mapper.py` inspects raw PostgreSQL rows and instantiates canonical models with full provenance:

### Example: Entity Transformation
**PostgreSQL Input**:
```json
{
  "id": "101",
  "name": "Acme Manufacturing",
  "country": "US",
  "industry": "Industrial"
}
```

↓ **Canonical Intermediate Model**:
```python
CanonicalEntity(
    canonical_id="101",
    entity_type=EntityCategory.COMPANY,
    display_name="Acme Manufacturing",
    properties={
        "id": "101",
        "name": "Acme Manufacturing",
        "country": "US",
        "industry": "Industrial"
    },
    source_references=[
        ProvenanceMetadata(
            source_system="postgres",
            source_type=SourceType.POSTGRES,
            source_table="companies",
            source_record_id="101"
        )
    ]
)
```

↓ **Neo4j Node Output**:
```cypher
(:Company {
  id: "101",
  canonical_id: "101",
  name: "Acme Manufacturing",
  entity_type: "Company",
  country: "US",
  industry: "Industrial",
  source_system: "postgres",
  source_type: "postgres",
  source_record_id: "101"
})
```

### Example: Relationship Transformation
**PostgreSQL Foreign Key Input**:
```json
{
  "id": "SR-901",
  "supplier_id": "S-201",
  "company_id": "101",
  "relationship_type": "SUPPLIES",
  "start_date": "2023-01-01"
}
```

↓ **Canonical Intermediate Model**:
```python
CanonicalRelationship(
    relationship_id="SR-901",
    relationship_type=CanonicalRelationshipType.SUPPLIES,
    source_entity_id="S-201",
    source_entity_type="Supplier",
    target_entity_id="101",
    target_entity_type="Company",
    properties={"start_date": "2023-01-01"},
    provenance=ProvenanceMetadata(
        source_system="postgres",
        source_type=SourceType.POSTGRES,
        source_table="supplier_relationships",
        source_record_id="SR-901"
    ),
    temporal=TemporalMetadata(valid_from="2023-01-01")
)
```

↓ **Neo4j Relationship Output**:
```cypher
(:Supplier {id: "S-201"})-[:SUPPLIES {
  relationship_id: "SR-901",
  start_date: "2023-01-01",
  source_system: "postgres",
  source_type: "postgres"
}]->(:Company {id: "101"})
```

---

## 8. How Future Firebase Data Will Map Into It
When Firebase Realtime Database or Firestore connectors are added, they will construct `CanonicalEntity` and `CanonicalRelationship` instances directly without modifying Neo4j storage logic:

**Future Firebase Document**:
`/companies/C-500` $\rightarrow$ `{ "companyName": "Firebase Logistics", "type": "Supplier" }`

↓ **Firebase Connector Mapping**:
```python
CanonicalEntity(
    canonical_id="C-500",
    entity_type=EntityCategory.SUPPLIER,
    display_name="Firebase Logistics",
    properties={"name": "Firebase Logistics"},
    source_references=[
        ProvenanceMetadata(
            source_system="firebase_prod",
            source_type=SourceType.FIREBASE,
            source_path="/companies/C-500",
            source_record_id="C-500"
        )
    ]
)
```

---

## 9. Why Neo4j is Downstream of the Canonical Model
Neo4j is a database engine optimized for graph indexing and Cypher queries. Keeping it downstream of the canonical domain model ensures:
1. **Database Storage Independence**: Storage mechanisms can evolve or swap without altering business domain logic.
2. **Multi-Source Fusion**: Multi-source reconciliation (e.g. merging a PostgreSQL record and a Firebase document into a single canonical entity) occurs before Cypher execution.
3. **Decoupled API Contract**: Graph API responses (`/api/graph`) are built directly from canonical payloads.

---

## 10. What is Intentionally NOT Implemented Yet
To maintain strict scope boundaries for this step:
- **Firebase Connector**: No Firebase SDK, credentials, or connectors added yet (reserved for next step).
- **LLM Reasoning Planner**: No LLM chain or agent execution planner added yet.
- **Symbolic / Prolog Engine**: No Prolog inference rule engine added yet.
- **Graph Neural Network (GNN)**: No GNN node embedding or graph neural network models added yet.
- **Frontend Changes**: UI components were preserved without modification.
