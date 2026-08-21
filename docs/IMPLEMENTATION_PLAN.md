# ReasonChain Architecture & Implementation Plan

## 1. Current Architecture

ReasonChain is a modern enterprise reasoning platform featuring a React 19 + TypeScript frontend with Vite, Tailwind CSS v4, Framer Motion, and `@xyflow/react` coupled with a FastAPI backend engine.

- **Frontend Core**:
  - `src/App.tsx`: State-based view switcher (`landing` vs `workspace`) and modal state management.
  - `src/components/DashboardView.tsx`: Enterprise Command Center layout with tab-based routing (`Overview`, `Investigate`, `Knowledge Graph`, `Data Sources`, `Entities`, `Proofs`, `Rules`, `Analytics`, `Audit Log`).
  - `src/components/graph/`: `@xyflow/react` powered interactive Knowledge Graph explorer (`KnowledgeGraphPanel.tsx`, `EntityNode.tsx`, `AnimatedEdge.tsx`).
  - `src/data/mockData.ts`: Central mock data store providing initial schema, entity relationships, proof steps, and risk signals.

- **Backend / API Services**:
  - FastAPI app in `backend/app/main.py`.
  - Database connection engine in `backend/app/db/postgres.py` with PostgreSQL support and zero-config SQLite fallback.
  - Pydantic models in `backend/app/models/schemas.py`.
  - API Routes:
    - `GET /api/health`
    - `POST /api/ingestion/test-connection`
    - `GET /api/ingestion/tables`
    - `GET /api/ingestion/table/{table_name}`

---

## 2. Target Architecture

The target architecture introduces a real end-to-end data pipeline connecting enterprise relational data sources directly to a unified Knowledge Graph and multi-hop reasoning engine.

```
[ Frontend: React / Vite ]
          │ (REST API / JSON)
          ▼
[ Backend: FastAPI Service ]
   ├── Ingestion Engine (psycopg2 / sqlite3)
   ├── Normalization & Entity Resolution Pipeline
   └── Reasoning Engine & Proof Generator
          │                     │
          ▼                     ▼
[ PostgreSQL / Demo DB ]   [ Neo4j Graph DB ]
```

---

## 3. End-to-End Data Flow

The platform executes the following exact end-to-end flow:

```
User
↓
Authentication
↓
First-time onboarding
↓
Connect PostgreSQL
↓
Test connection
↓
Select tables
↓
Data ingestion
↓
Normalization
↓
Entity mapping
↓
Neo4j
↓
Knowledge Graph
↓
Investigation
↓
Multi-hop reasoning
↓
Proof
```

---

## 4. Completed & Upcoming Implementation Stages

1. **Step 1: Codebase Inspection & Preparation (COMPLETED)**
   - Backend structure creation (`backend/app/`).
   - Central environment configuration (`.env`).
   - Dependency definitions (`backend/requirements.txt`).
   - Health-check endpoint (`GET /api/health`).

2. **Step 2: PostgreSQL Demo Database & Connection (COMPLETED)**
   - Enterprise relational demo database seeded with 5 core tables (`companies`, `directors`, `directorships`, `transactions`, `sanction_list`).
   - Connection testing & metadata extraction endpoints:
     - `POST /api/ingestion/test-connection`
     - `GET /api/ingestion/tables`
     - `GET /api/ingestion/table/{table_name}`
   - Automatic fallback support for zero-config demo execution when local PostgreSQL port is inactive.

3. **Step 3: Data Ingestion & Normalization (Upcoming)**
   - Tabular data ingestion pipeline.
   - Entity & relationship extraction and normalization.

4. **Step 4: Neo4j Knowledge Graph Construction (Upcoming)**
   - Mapping normalized entities/relationships to Neo4j.
   - Graph visualization endpoint sync.

5. **Step 5: Multi-Hop Reasoning & Proof Engine (Upcoming)**
   - Multi-hop traversal and evidence proof generation.
