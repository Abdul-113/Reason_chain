# ReasonChain Ingestion Pipeline

## Overview

The ingestion pipeline reads enterprise data from PostgreSQL and creates/updates a Neo4j Knowledge Graph.

```
PostgreSQL (Source)
    |
    v
PostgreSQL Connector (postgres_reader.py)
    |
    v
Data Extraction (9 tables)
    |
    v
Data Normalization (normalizer.py)
    |
    v
Entity Resolution (basic deterministic)
    |
    v
Entity Mapping (mapper.py)
    |
    v
Neo4j Graph Writer (neo4j_writer.py)
    |
    v
Knowledge Graph Validation
    |
    v
Ingestion Summary
```

## Graph Model

### Node Types

| Neo4j Label | Source Table | Key Property |
|:--|:--|:--|
| `:Company` | `companies` | `id` |
| `:Supplier` | `suppliers` | `id` |
| `:Person` | `people` | `id` |
| `:Contract` | `contracts` | `id` |
| `:Sanction` | `sanctions` | `id` |
| `:Country` | `countries` | `code` |

### Relationship Types

| Relationship | From | To | Source Table |
|:--|:--|:--|:--|
| `SUPPLIES` | Supplier | Company | `supplier_relationships` |
| `HAS_DIRECTOR` | Company | Person | `company_directors` |
| `DIRECTOR_OF` | Person | Company | `company_directors` |
| `OWNS` | Company | Company | `ownership` |
| `HAS_CONTRACT` | Supplier | Company | `contracts` |
| `SANCTIONED_BY` | Company/Person | Sanction | `sanctions` |
| `LOCATED_IN` | Company/Supplier/Person | Country | entity.country field |

## Mapping Examples

### PostgreSQL Row → Neo4j Node

```
PostgreSQL companies row:
{
  "id": "C001",
  "name": "Acme Manufacturing",
  "country": "US",
  "industry": "Industrial Manufacturing",
  "status": "Active",
  "registration_number": "REG-10001"
}

→ Neo4j :Company node:
(:Company {
  id: "C001",
  name: "Acme Manufacturing",
  country: "US",
  industry: "Industrial Manufacturing",
  status: "Active",
  registration_number: "REG-10001",
  _normalized_name: "acme manufacturing"
})
```

### PostgreSQL Relationship → Neo4j Relationship

```
PostgreSQL supplier_relationships row:
{
  "id": "SR001",
  "supplier_id": "S001",
  "company_id": "C001",
  "relationship_type": "SUPPLIES",
  "start_date": "2022-01-01",
  "end_date": "2026-12-31",
  "source": "ERP",
  "confidence": 0.98
}

→ Neo4j relationship:
(:Supplier {id: "S001"})
  -[:SUPPLIES {
    relationship_id: "SR001",
    original_type: "SUPPLIES",
    start_date: "2022-01-01",
    end_date: "2026-12-31",
    source: "ERP",
    confidence: 0.98
  }]->
(:Company {id: "C001"})
```

## Environment Variables

| Variable | Default | Description |
|:--|:--|:--|
| `POSTGRES_HOST` | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_DB` | `reasonchain_demo` | Database name |
| `POSTGRES_USER` | `postgres` | Database user |
| `POSTGRES_PASSWORD` | `postgres` | Database password |
| `NEO4J_URI` | `bolt://localhost:7687` | Neo4j Bolt URI |
| `NEO4J_USERNAME` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | `password` | Neo4j password |
| `NEO4J_DATABASE` | `neo4j` | Neo4j database name |

## How to Run

### 1. Start Infrastructure

**Option A: Docker (recommended)**
```bash
docker-compose up -d
```

**Option B: Local installations**
- Start PostgreSQL on port 5432
- Start Neo4j on port 7687
- Seed the PostgreSQL database:
```bash
python scripts/seed_database.py
```

### 2. Start Backend

```bash
pip install -r backend/requirements.txt
python -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

### 3. Run Ingestion

```bash
curl -X POST http://localhost:8000/api/ingestion/run
```

### 4. Check Status

```bash
curl http://localhost:8000/api/ingestion/status
```

### 5. Inspect Neo4j

Open Neo4j Browser: [http://localhost:7474](http://localhost:7474)

Run verification query:
```cypher
MATCH (s:Supplier {name: 'ABC Industrial Supplies'})
      -[:SUPPLIES]->(c1:Company {name: 'Acme Manufacturing'})
      -[:HAS_DIRECTOR]->(p:Person {full_name: 'Rahul Mehta'})
      -[:DIRECTOR_OF]->(c2:Company {name: 'Orion Trading'})
      -[:SANCTIONED_BY]->(sn:Sanction)
RETURN s.name, c1.name, p.full_name, c2.name, sn.authority;
```

### 6. Reset/Rebuild Graph

To clear and rebuild the entire graph:
```cypher
MATCH (n) DETACH DELETE n;
```
Then re-run: `POST /api/ingestion/run`

## Idempotency

The pipeline uses `MERGE` for all Neo4j writes. Running the pipeline multiple times:
- Does NOT create duplicate nodes
- Does NOT create duplicate relationships
- Updates properties on existing nodes/relationships
- Is safe to run repeatedly

## Entity Resolution

Basic deterministic entity resolution detects potential duplicates:
- Normalizes names (lowercase, trim, remove suffixes like Ltd/Inc)
- Groups by normalized name
- Reports duplicates in the ingestion summary
- Does NOT auto-merge (by design, for safety)

## Validation

After ingestion, the pipeline automatically verifies:
1. Node counts for all labels
2. Relationship counts for all types
3. Uniqueness constraints
4. The main demo investigation chain:

```
ABC Industrial Supplies → Acme Manufacturing → Rahul Mehta → Orion Trading → OFAC SDN Sanction
```

## API Endpoints

| Method | Path | Description |
|:--|:--|:--|
| `POST` | `/api/ingestion/run` | Trigger ingestion pipeline |
| `GET` | `/api/ingestion/status` | Last ingestion result |
| `GET` | `/api/ingestion/neo4j-health` | Neo4j connectivity check |
| `GET` | `/api/ingestion/tables` | List source tables |
| `POST` | `/api/ingestion/test-connection` | Test PostgreSQL connection |

## File Structure

```
backend/app/
  db/
    postgres.py          # PostgreSQL connection manager
    neo4j.py             # Neo4j connection manager
  ingestion/
    __init__.py
    postgres_reader.py   # Data extraction from PostgreSQL
    normalizer.py        # Data normalization and entity resolution
    mapper.py            # PostgreSQL → Neo4j mapping
    neo4j_writer.py      # Neo4j graph writer (MERGE-based)
    pipeline.py          # Central pipeline orchestrator
  routes/
    ingestion.py         # API endpoints

graph/
  validation.cypher      # Reusable validation Cypher queries
```
