# ReasonChain: Supabase PostgreSQL → Neo4j Ingestion Pipeline

## Overview

ReasonChain ingests enterprise data from Supabase PostgreSQL (or any standard PostgreSQL instance), normalizes entities and relationships, maps them to symbolic graph primitives, and writes them into Neo4j AuraDB.

```
Supabase PostgreSQL (or PostgreSQL Database)
        ↓
  postgres_reader.py  (Extracts 9 enterprise tables)
        ↓
   normalizer.py      (Trims whitespace, formats dates, standardizes country codes & keys)
        ↓
     mapper.py        (Maps records to 6 Node types & 7 Relationship types)
        ↓
   neo4j_writer.py    (Idempotent batch MERGE queries via official Neo4j Python driver)
        ↓
  Neo4j AuraDB / Graph Database
        ↓
    pipeline.py       (Automated validation & multi-hop query verification)
```

---

## Architecture & Data Flow

### 1. Extraction (`postgres_reader.py`)
Extracts data from 9 relational tables using read-only parameterized queries:
- `companies`
- `suppliers`
- `people`
- `company_directors`
- `supplier_relationships`
- `ownership`
- `contracts`
- `sanctions`
- `countries`

### 2. Normalization (`normalizer.py`)
Cleans and standardizes raw inputs:
- Whitespace trimming (`" ABC Industrial Supplies "` → `"ABC Industrial Supplies"`)
- Empty/null handling (`"None"`, `""` → `None`)
- Date format normalization (`YYYY-MM-DD`)
- Country code standardization (ISO-2 uppercase e.g. `'us'` → `'US'`)
- String ID enforcement (`id` converted to string)
- Deterministic name normalization (`_normalized_name` for entity comparison)

### 3. Mapping (`mapper.py`)

#### Node Types
- `:Company` (`id`, `name`, `country`, `industry`, `status`, `registration_number`)
- `:Supplier` (`id`, `name`, `country`, `status`, `supplier_type`, `risk_level`)
- `:Person` (`id`, `full_name`, `country`, `role`, `status`)
- `:Contract` (`id`, `contract_number`, `contract_type`, `start_date`, `end_date`, `status`, `value`, `source`)
- `:Sanction` (`id`, `entity_type`, `authority`, `listed_date`, `delisted_date`, `status`, `source`)
- `:Country` (`code`, `name`, `risk_level`)

#### Relationship Types
- `(:Supplier)-[:SUPPLIES]->(:Company)`
- `(:Company)-[:HAS_DIRECTOR]->(:Person)`
- `(:Person)-[:DIRECTOR_OF]->(:Company)`
- `(:Company)-[:OWNS {ownership_percentage, valid_from, valid_to, source, confidence}]->(:Company)`
- `(:Supplier)-[:HAS_CONTRACT {contract_id, contract_number, contract_type, start_date, end_date, status, value, source}]->(:Company)`
- `(:Company)-[:SANCTIONED_BY {authority, listed_date, delisted_date, status, source}]->(:Sanction)`
- `(:Person)-[:SANCTIONED_BY {authority, listed_date, delisted_date, status, source}]->(:Sanction)`
- `(:Company|:Supplier|:Person)-[:LOCATED_IN]->(:Country)`

### 4. Idempotent Graph Writing (`neo4j_writer.py`)
Uses Cypher `MERGE` queries with `$rows` batching:
- Enforces uniqueness constraints (`Company.id`, `Supplier.id`, `Person.id`, `Contract.id`, `Sanction.id`, `Country.code`)
- Updates node properties without duplicating records on multiple runs (`SET n += row`)
- Updates relationship properties without creating duplicate edges (`SET r += row.props`)

### 5. Validation (`pipeline.py`)
Automated post-ingestion verification:
- Node & relationship count verification
- Executes multi-hop demo Cypher query:
  ```cypher
  MATCH path =
    (s:Supplier)-[:SUPPLIES]->
    (c1:Company)-[:HAS_DIRECTOR]->
    (p:Person)-[:DIRECTOR_OF]->
    (c2:Company)-[:SANCTIONED_BY]->
    (sanction:Sanction)
  WHERE s.status = "Active"
  RETURN path;
  ```

---

## Environment Variables

Configure `.env` in the root directory:

```env
# PostgreSQL Connection (Supabase or Local)
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=reasonchain_demo
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# Neo4j AuraDB / Local Neo4j
NEO4J_URI=neo4j+s://xxxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-aura-password
NEO4J_DATABASE=neo4j
```

> **Note:** If `DATABASE_URL` is provided, the connection manager prefers `DATABASE_URL` for Supabase PostgreSQL connections. If unreachable, it falls back to `POSTGRES_HOST` / `POSTGRES_PORT`, and finally SQLite demo fallback for local dev.

---

## Running the Backend & Ingestion Pipeline

### 1. Start Backend API Server
```bash
# From backend directory
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Trigger Ingestion via API
```bash
# Trigger full ingestion pipeline
curl -X POST http://localhost:8000/api/ingestion/run
```

**Example Output:**
```json
{
  "status": "success",
  "nodes_created": 85,
  "nodes_updated": 0,
  "relationships_created": 218,
  "relationships_updated": 0,
  "errors": [],
  "duration_seconds": 1.42,
  "started_at": "2026-08-20T23:40:00Z",
  "completed_at": "2026-08-20T23:40:01Z",
  "extraction": {
    "countries": 8,
    "companies": 25,
    "suppliers": 18,
    "people": 25,
    "company_directors": 32,
    "supplier_relationships": 28,
    "ownership": 18,
    "contracts": 22,
    "sanctions": 6
  },
  "validation": {
    "status": "passed",
    "main_demo_chain_found": true
  }
}
```

### 3. Check Ingestion Status
```bash
curl http://localhost:8000/api/ingestion/status
```

---

## Inspecting the Neo4j Graph

Log in to **Neo4j Workspace / Browser** (`https://workspace.neo4j.io` or `http://localhost:7474`) and execute:

### Count Nodes by Label
```cypher
MATCH (n) RETURN labels(n) AS Label, count(n) AS Count ORDER BY Count DESC;
```

### Count Relationships by Type
```cypher
MATCH ()-[r]->() RETURN type(r) AS RelationshipType, count(r) AS Count ORDER BY Count DESC;
```

### Multi-Hop Sanctions Path (Demo Case)
```cypher
MATCH path =
  (s:Supplier {name: 'ABC Industrial Supplies'})-[:SUPPLIES]->
  (c1:Company {name: 'Acme Manufacturing'})-[:HAS_DIRECTOR]->
  (p:Person {full_name: 'Rahul Mehta'})-[:DIRECTOR_OF]->
  (c2:Company {name: 'Orion Trading'})-[:SANCTIONED_BY]->
  (sanction:Sanction)
RETURN path;
```

---

## Resetting / Rebuilding the Graph

To completely reset the Neo4j graph and constraints, run in Neo4j Browser:

```cypher
// Clear all nodes and relationships
MATCH (n) DETACH DELETE n;
```

Then re-trigger ingestion:
```bash
curl -X POST http://localhost:8000/api/ingestion/run
```

---

## Running Automated Tests

Run backend tests using `pytest` or `python`:

```bash
cd backend
python -m pytest tests/test_ingestion.py -v
```
