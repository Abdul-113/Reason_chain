# ReasonChain — Canonical Knowledge Graph Materialization & Projection Architecture

## Executive Summary

ReasonChain unifies heterogeneous enterprise data (PostgreSQL, Firebase Realtime Database, CRM systems, sanction lists, and external registries) into a single, cohesive, research-grade Knowledge Graph in Neo4j.

To satisfy the core enterprise product philosophy:
> **SIMPLE TO SEE + RICH TO INSPECT + TRUSTWORTHY TO AUDIT**

ReasonChain deliberately decouples the storage layer from the presentation layer:

```
+-------------------------------------------------------------------------------+
|                           Heterogeneous Sources                               |
|       PostgreSQL (Relational)     |    Real Firebase (/companies)             |
|       External Registers          |    Synthetic Links (/company_relationships)|
+-------------------------------------------------------------------------------+
                                      │
                                      ▼
+-------------------------------------------------------------------------------+
|                     Universal Semantic Mapping & Resolution                   |
|       • CanonicalEntity (with canonical_entity_id, provenance, temporal)      |
|       • CanonicalRelationship (with relationship_id, confidence, mock_record) |
+-------------------------------------------------------------------------------+
                                      │
                                      ▼
+-------------------------------------------------------------------------------+
|                       Neo4j Materialization Pipeline                          |
|       • Source-agnostic UNWIND MERGE execution                                |
|       • Canonical uniqueness constraints (canonical_entity_id)                |
|       • Preserves full provenance, temporal, confidence & synthetic flags    |
+-------------------------------------------------------------------------------+
                                      │
                                      ▼
+-------------------------------------------------------------------------------+
|                           Graph Projection Layer                              |
|       GraphProjectionService: Projects rich Neo4j models -> clean             |
|       VisualizationNode and VisualizationEdge instances                       |
+-------------------------------------------------------------------------------+
                         │                              │
                         ▼                              ▼
+------------------------------------+   +--------------------------------------+
|          Default Visual View       |   |        Deep Audit Details Panels     |
|   Clean business display names,    |   |   Identity, Source provenance,       |
|   subtle entity-type differentiation|  |   Temporal intervals, Multi-factor   |
|   and lightweight relationship edges|  |   confidence, Synthetic badges       |
+------------------------------------+   +--------------------------------------+
```

---

## 1. Two-Layer Design Rationale

### Layer A: Rich Internal Canonical Graph (Neo4j)
The internal graph in Neo4j preserves every granular detail required for explainable reasoning, probabilistic inference, compliance audits, and multi-hop traversal:

- **Universal Identity**: Every node is keyed by `canonical_entity_id` (e.g. `firebase:companies:U74999MH2019PTC334643` or `relational:company:C001`). Display names or transient row keys are never used as universal keys.
- **Uniqueness Constraints**: Uniqueness constraints on `canonical_entity_id` ensure idempotency across all entity types:
  ```cypher
  CREATE CONSTRAINT FOR (c:Company) REQUIRE c.canonical_entity_id IS UNIQUE;
  CREATE CONSTRAINT FOR (p:Person) REQUIRE p.canonical_entity_id IS UNIQUE;
  CREATE CONSTRAINT FOR (s:Supplier) REQUIRE s.canonical_entity_id IS UNIQUE;
  CREATE CONSTRAINT FOR (ct:Contract) REQUIRE ct.canonical_entity_id IS UNIQUE;
  CREATE CONSTRAINT FOR (sn:Sanction) REQUIRE sn.canonical_entity_id IS UNIQUE;
  CREATE CONSTRAINT FOR (co:Country) REQUIRE co.canonical_entity_id IS UNIQUE;
  ```
- **Complete Traceability**: Every entity and relationship maintains:
  - `source_system`: e.g. `mca_registry`, `firebase`, `postgres`
  - `source_path`: e.g. `/companies/company_00001`
  - `source_record_id`: primary key or push ID in the source system
  - `source_reliability`: $[0.0, 1.0]$ source rating
  - `observed_at`: timestamp when the fact was observed
  - `ingested_at`: timestamp when record entered ReasonChain
- **Temporal Validity**:
  - `valid_from`: starting date from which the entity/relationship was legally valid
  - `valid_to`: date until which the entity/relationship remained valid (or open-ended)
- **Multi-Factor Confidence**:
  - `entity_confidence`: resolution and identification confidence
  - `mapping_confidence`: schema mapping certainty
  - `relationship_confidence`: edge certainty
- **Synthetic Data Flagging**:
  - Test branches (e.g. `/company_relationships`) carry explicit markers: `mock_record = true` and `is_synthetic = true`.

### Layer B: User-Facing Graph Projection
If the raw internal graph were rendered directly in the browser, users would face a chaotic web of infrastructure nodes (`SourceObservation`, `MappingProposal`, `EvidenceRecord`) and unreadable raw IDs.

The **Graph Projection Layer (`GraphProjectionService`)**:
1. **Focuses on Business Relationships**: Default visualization projects direct `ENTITY ──RELATIONSHIP──> ENTITY` interactions (e.g. `Person ──DIRECTOR_OF──> Company`, `Supplier ──SUPPLIES──> Company`).
2. **Prioritizes Human-Readable Business Names**: Shows `"1ST RATE PHARMA PRIVATE LIMITED"` instead of `"firebase:companies:U74999MH2019PTC334643"`.
3. **Presents Concise Relationship Labels**: Shows `"DIRECTOR OF"`, `"SUPPLIES"`, `"OWNS"`, rather than database column or Cypher implementation terms.
4. **Limits Initial Subgraph Density**: Bounded projection (30–60 curated nodes) prevents browser degradation across 10,000+ companies.
5. **Enables Query-Driven Exploration**: Users search an entity or click `+ Expand Neighborhood` to fetch and attach 1-hop connections on demand.
6. **Delegates Auditing to Details Drawers**: Deep provenance, temporal intervals, confidence breakdowns, and synthetic warnings are revealed cleanly inside sliding detail panels upon clicking a node or edge.

---

## 2. Materialization Pipeline (`MaterializationPipeline`)

### Source-Agnostic Operation
The materialization pipeline operates strictly on `CanonicalGraphPayload` structures. Upstream adapters handle source extraction:
- `FirebaseSourceAdapter`: Reads `/companies` (real ~10,000 records).
- Synthetic relationship extractor: Reads `/company_relationships` and flags records with `mock_record = true`.
- Relational adapter: Reads PostgreSQL tables.

### Idempotency & Batching
All Neo4j writes utilize `UNWIND` batches in transactions of 500 rows:
```cypher
// Nodes batch write
UNWIND $rows AS row
MERGE (n:Company {canonical_entity_id: row.canonical_entity_id})
SET n += row

// Relationships batch write
UNWIND $rows AS row
MATCH (a {canonical_entity_id: row.from_id})
MATCH (b {canonical_entity_id: row.to_id})
MERGE (a)-[r:DIRECTOR_OF {relationship_id: row.props.relationship_id}]->(b)
SET r += row.props
```
Re-running materialization multiple times updates properties without creating duplicate nodes or edges.

---

## 3. Real Firebase Integration & Synthetic Data Boundaries

ReasonChain currently reads from Firebase Realtime Database at:
`https://reason-chain-default-rtdb.firebaseio.com`

| Path | Nature | Policy in Knowledge Graph |
| :--- | :--- | :--- |
| `/companies` | **REAL** (~10,000 corporate records) | Ingested as authoritative canonical entities with MCA CINs and real registration data. |
| `/company_relationships` | **SYNTHETIC** test relationships | Ingested with mandatory `mock_record = true` and `is_synthetic = true`. Marked with amber "TEST EVIDENCE" badges in both UI and API. |
| `/company_reference` | Ignored | **STRICTLY IGNORED** as per system specification. |

---

## 4. REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/graph` | Fetch projected visualization subgraph (supports `limit`, `entity_type`, `min_confidence`, `include_synthetic`). |
| `GET` | `/api/graph/search?q=...` | Fast search across entity names, CINs, DINs, and properties. |
| `GET` | `/api/graph/neighborhood/{id}` | Fetch 1-hop or 2-hop local subgraph around an entity. |
| `GET` | `/api/graph/entity/{id}` | Deep multi-section audit view (Identity, Resolution, Sources, Temporal, Confidence). |
| `GET` | `/api/graph/relationship/{id}`| Deep audit view for a relationship (endpoints, evidence, temporal validity, confidence). |
| `GET` | `/api/graph/stats` | Live counts of entities, relationships, sources, and synthetic items. |
| `GET` | `/api/graph/reconciliation` | Integrity audit report verifying zero orphaned edges or duplicate IDs. |
| `POST` | `/api/graph/materialize` | Run on-demand materialization from real Firebase and relational sources. |

---

## 5. Verification & Testing

The materialization subsystem is verified by dedicated automated tests in `backend/tests/test_neo4j_materialization.py` covering:
- Canonical entity & relationship creation
- Provenance, temporal, and confidence preservation
- Synthetic marker preservation
- Idempotent writes and duplicate prevention
- Subgraph bounding and type filtering
- Multi-section entity and relationship detail retrieval
- Search and neighborhood queries
- Graph reconciliation audits
