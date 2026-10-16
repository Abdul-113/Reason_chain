# ReasonChain — Enterprise Knowledge Graph & Multi-Database Reasoning Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python)](https://python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Neo4j](https://img.shields.io/badge/Neo4j-5+-008CC1?style=flat-square&logo=neo4j)](https://neo4j.com/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4.x-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)

**ReasonChain** is an enterprise intelligence and corporate compliance reasoning platform. It unifies disparate multi-database sources (Firebase Realtime Database, Neon PostgreSQL, CSV/JSON extracts) into a canonical knowledge graph, running automated entity resolution, deterministic reasoning rules, and interactive graph investigations.

---

## Table of Contents

- [Architectural Overview](#architectural-overview)
- [Key Features](#key-features)
- [System Requirements](#system-requirements)
- [Environment Configuration](#environment-configuration)
- [Installation & Setup](#installation--setup)
  - [Windows Setup (PowerShell)](#windows-setup-powershell)
  - [Linux / macOS Setup (Bash)](#linux--macos-setup-bash)
- [Database Setup & Data Ingestion](#database-setup--data-ingestion)
  - [Option A: Docker Compose (Local PostgreSQL & Neo4j)](#option-a-docker-compose-local-postgresql--neo4j)
  - [Option B: Cloud Databases (Neon PostgreSQL & Neo4j Aura)](#option-b-cloud-databases-neon-postgresql--neo4j-aura)
  - [Importing Relationship Datasets into PostgreSQL](#importing-relationship-datasets-into-postgresql)
- [Running the Application](#running-the-application)
- [Testing & Quality Verification](#testing--quality-verification)
- [Repository Structure](#repository-structure)
- [API Reference](#api-reference)
- [Security & Provenance](#security--provenance)

---

## Architectural Overview

```
 ┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
 │ Firebase RTDB        │    │ PostgreSQL / Neon    │    │ File Uploads         │
 │ (Company Master)     │    │ (Relationships/Links)│    │ (CSV, JSON, Audit)   │
 └──────────┬───────────┘    └──────────┬───────────┘    └──────────┬───────────┘
            │                           │                           │
            ▼                           ▼                           ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │                      Universal Source Adapter Layer                          │
 │             (Schema Profiling, Type Inference, Data Sampling)                │
 └──────────────────────────────────────┬───────────────────────────────────────┘
                                        │
                                        ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │                   Entity Resolution & Canonical Mapper                       │
 │        (CIN / DIN / PAN Normalization, Deterministic ID Generation)          │
 └──────────────────────────────────────┬───────────────────────────────────────┘
                                        │
                                        ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │                     Knowledge Graph Projection & Storage                     │
 │          (Neo4j Graph Database + In-Memory Fast Projection Cache)            │
 └──────────────────────────────────────┬───────────────────────────────────────┘
                                        │
                                        ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │                 Enterprise Investigation UI (React Flow)                     │
 │      - Focused Investigation View (1-3 Hops)      - Shortest Path Tracer    │
 │      - Hierarchical / Radial / Overview Layouts   - Side Audit Inspector    │
 └──────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Features

1. **Unified Data Ingestion & Profiling**
   - Live inspection and schema discovery for PostgreSQL (Neon/Local) and Firebase Realtime Database.
   - Read-only data sampling with integrity scorecards and field-level metadata.

2. **Canonical Entity Resolution**
   - Normalizes disparate schemas into standard canonical types: `Company`, `Person`, `Supplier`, `Contract`, `Sanction`, and `Country`.
   - Deterministic cross-source entity deduplication based on CIN/DIN/PAN match rules.

3. **Enterprise Knowledge Graph Visualizer**
   - **Focused Investigation Mode**: Eliminates chaotic 100+ node hairballs by centering on visual anchor entities.
   - **Multi-Hop Depth Controls**: Toggle between `[1 Hop]`, `[2 Hops]` (default), `[3 Hops]`, or `[Full Graph]`.
   - **Adaptive Layout Engine**: Switch between **Radial Focus**, **Hierarchical (DAG)**, and **Overview Clustered** layouts.
   - **"Trace Connection" Causal Mode**: Computes and isolates the shortest connection chain between two entities, highlighting relevant paths at 100% opacity and dimming unrelated entities.
   - **Semantic Color Identities & Risk Badges**: Visual hierarchy for Companies (Cyan), Directors (Purple), Suppliers (Amber), Contracts (Emerald), and Sanctions (Red).
   - **Synthetic Claim Distinction**: Synthetic demo data is explicitly flagged with `[SYNTHETIC - DEMO]` badges and dashed amber borders.

4. **Audit Inspector & Provenance Tracking**
   - Every node and edge retains its origin metadata: source database, record ID, match confidence percentage, and ingestion timestamp.
   - Automated "Why Flagged?" risk attribution and reasoning explanation.

---

## System Requirements

| Component | Minimum Version | Recommended |
|-----------|----------------|-------------|
| **Node.js** | `v18.0.0`+ | `v20.x` or `v22.x` (LTS) |
| **npm** | `v9.0.0`+ | `v10.x`+ |
| **Python** | `3.10`+ | `3.11`, `3.12`, or `3.13` |
| **PostgreSQL** | `14`+ | `16` (Local or Neon Serverless) |
| **Neo4j** *(optional)* | `5.x` | `5.18+` (Local or AuraDB) |
| **Docker** *(optional)* | `20.10`+ | Docker Desktop with Compose v2 |

---

## Environment Configuration

Create a `.env` file in the project root directory by copying the provided `.env.example`:

```bash
# Copy template
cp .env.example .env
```

Edit `.env` with your credentials:

```dotenv
# Server Configuration
HOST=127.0.0.1
PORT=8000
ENVIRONMENT=development

# PostgreSQL Connection Settings (Local or Neon)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=reasonchain_demo
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# If using Neon Cloud PostgreSQL, provide NEON_DATABASE_URL:
# NEON_DATABASE_URL=postgresql://user:pass@ep-xyz.region.neon.tech/dbname?sslmode=require
# DATABASE_URL=postgresql://user:pass@ep-xyz.region.neon.tech/dbname?sslmode=require

# Neo4j Connection Settings (Optional — in-memory projection used if offline)
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j

# Firebase Realtime Database (Optional)
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
FIREBASE_SERVICE_ACCOUNT_JSON_PATH=backend/data/firebase-service-account.json

# AI Semantic Mapping (Optional - Groq / OpenAI compatible)
AI_PROVIDER=groq
AI_API_KEY=your-api-key-here
AI_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
AI_BASE_URL=https://api.groq.com/openai/v1
```

---

## Installation & Setup

### Windows Setup (PowerShell)

Open Windows PowerShell in the project root directory:

```powershell
# 1. Clone repository (if not already cloned)
git clone https://github.com/Abdul-113/Reason_chain.git
cd Reason_chain

# 2. Setup Python Virtual Environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 3. Upgrade pip and install backend dependencies
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
pip install pytest "psycopg[binary]"

# 4. Install Frontend Dependencies
npm install
```

> **Note on PowerShell Script Execution Policy:** If you encounter `Execution_Policies` restriction when activating `.venv`, run:
> ```powershell
> Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
> .\.venv\Scripts\Activate.ps1
> ```

---

### Linux / macOS Setup (Bash)

Open your terminal in the project root directory:

```bash
# 1. Clone repository (if not already cloned)
git clone https://github.com/Abdul-113/Reason_chain.git
cd Reason_chain

# 2. Setup Python Virtual Environment
python3 -m venv .venv
source .venv/bin/activate

# 3. Upgrade pip and install backend dependencies
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
pip install pytest "psycopg[binary]"

# 4. Install Frontend Dependencies
npm install
```

---

## Database Setup & Data Ingestion

### Option A: Docker Compose (Local PostgreSQL & Neo4j)

If Docker Desktop is installed, start both databases with automated schema initialization:

```bash
# Start PostgreSQL & Neo4j in background
docker compose up -d

# Verify health status
docker compose ps
```

- **PostgreSQL**: `localhost:5432` (`postgres` / `postgres`, DB: `reasonchain_demo`)
- **Neo4j Browser**: `http://localhost:7474` (`neo4j` / `password`)

---

### Option B: Cloud Databases (Neon PostgreSQL & Neo4j Aura)

Set the connection string in your `.env`:

```dotenv
NEON_DATABASE_URL=postgresql://[user]:[password]@[endpoint].neon.tech/neondb?sslmode=require
DATABASE_URL=postgresql://[user]:[password]@[endpoint].neon.tech/neondb?sslmode=require
```

---

### Importing Relationship Datasets into PostgreSQL

Run the idempotent dataset importer to populate the isolated `reasonchain_import` schema with corporate relationship records, people, contracts, suppliers, external companies, and sanctions:

#### On Windows (PowerShell):
```powershell
python backend/scripts/import_company_relationships_to_neon.py --file "backend/data/reason-chain-default-rtdb-company_relationships-export.json"
```

#### On Linux / macOS (Bash):
```bash
python backend/scripts/import_company_relationships_to_neon.py --file "backend/data/reason-chain-default-rtdb-company_relationships-export.json"
```

Expected record counts imported:
- `company_links`: 10 rows
- `people`: 6 rows
- `suppliers`: 5 rows
- `contracts`: 5 rows
- `external_companies`: 2 rows
- `sanctions`: 2 rows
- `relationship_claims`: 20 rows
- `raw_records`: 50 rows

---

## Running the Application

Both the FastAPI backend and Vite frontend development servers must be running.

### 1. Start the Backend API (Port 8000)

#### On Windows (PowerShell):
```powershell
.\.venv\Scripts\Activate.ps1
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

#### On Linux / macOS (Bash):
```bash
source .venv/bin/activate
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- API Docs (Swagger UI): `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/health`

---

### 2. Start the Frontend Application (Port 5173)

Open a second terminal window at the project root:

```bash
npm run dev
```

The ReasonChain platform will be accessible at: **`http://localhost:5173/`**

---

## Testing & Quality Verification

### Run Backend Pytest Suite

```bash
# Run graph service & API tests
python -m pytest backend/tests/test_graph_api.py -v
```

### Run Frontend Type Checks & Production Build

```bash
# TypeScript verification & Vite production bundle
npm run build
```

---

## Repository Structure

```
ReasonChain/
├── backend/
│   ├── app/
│   │   ├── core/              # App config, database connections, security
│   │   ├── db/                # PostgreSQL, Neo4j, Firebase connection drivers
│   │   ├── domain/            # Canonical entity models, schemas, relationships
│   │   ├── ingestion/         # Source readers, relational/firebase mappers
│   │   ├── routes/            # REST API endpoints (builder, postgres, graph, rules)
│   │   ├── services/          # Graph service, KG builder orchestrator, projection
│   │   └── main.py            # FastAPI entry point
│   ├── data/                  # Canonical exports & JSON test fixtures
│   ├── scripts/               # Neon/Postgres data migration & import tools
│   ├── tests/                 # Backend pytest test suites
│   └── requirements.txt       # Python dependencies
├── database/
│   ├── schema.sql             # Relational table schema definitions
│   └── seed.sql               # Baseline demo datasets
├── docs/                      # Architectural specifications & design documents
├── src/
│   ├── components/
│   │   ├── graph/             # Knowledge graph visualizer, layouts, custom nodes
│   │   │   ├── EntityNode.tsx         # Enterprise node card component
│   │   │   ├── layoutEngine.ts       # Radial, hierarchical, overview layout math
│   │   │   └── Neo4jGraphViewer.tsx  # Interactive canvas & toolbar
│   │   ├── DashboardView.tsx          # Workspace container & navigation tabs
│   │   ├── DataSourcesView.tsx        # Multi-database inspection & configuration
│   │   ├── KnowledgeGraphBuilder.tsx  # End-to-end execution pipeline
│   │   └── RulesView.tsx              # Deterministic compliance rule auditor
│   ├── services/              # Frontend API client modules
│   ├── App.tsx                # App root component
│   └── index.css              # Design tokens & Tailwind utility classes
├── docker-compose.yml         # Containerized PostgreSQL & Neo4j orchestration
├── package.json               # Node.js dependencies & scripts
├── tsconfig.json              # TypeScript configuration
└── vite.config.ts             # Vite build pipeline
```

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | `GET` | Health check and database connection status |
| `/api/graph` | `GET` | Retrieve canonical Knowledge Graph nodes and edges (`?limit=120&source=all`) |
| `/api/graph/stats` | `GET` | Real-time counts of entities, relationships, and risk distributions |
| `/api/postgres/tables` | `GET` | List discovered PostgreSQL tables and row counts |
| `/api/postgres/sample/{table}` | `GET` | Fetch read-only preview records and column types |
| `/api/builder/run` | `POST` | Execute complete ingestion, profiling, resolution, and graph build |
| `/api/rules/evaluate` | `POST` | Run reasoning rules against selected entity network |

---

## Security & Provenance

- **Read-Only Inspection**: Database exploratory tools operate in read-only mode, guaranteeing source isolation.
- **Credential Protection**: Database passwords and Firebase service accounts must only be defined in `.env` or injected via runtime environment variables. They are strictly excluded by `.gitignore`.
- **Claim Integrity**: All imported edges preserve provenance attributes (`source_record_id`, `source_database`, `confidence_score`), enabling complete compliance traceability.

---

## License

This project is licensed under the [MIT License](LICENSE).
