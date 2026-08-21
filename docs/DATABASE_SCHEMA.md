# ReasonChain Enterprise Demo Database Schema

## 1. Overview & Purpose

The **ReasonChain Demo Database** serves as the initial relational enterprise data source for ReasonChain. It simulates real-world enterprise databases (ERP, CRM, Corporate Registries, Contracts Repositories, and Compliance Registries) containing corporate ownership structures, supplier networks, directorships, contracts, and sanction listings.

The dataset is purposefully structured to produce meaningful multi-hop graph investigation paths and evidence proofs, including intentional entity resolution variations (e.g. *"ABC Industrial Supplies"*, *"ABC Industrial Supplies Ltd."*, *"ABC Industrial Supplies Inc"*).

---

## 2. Table Definitions & Relationships

### 2.1 `countries`
- **Purpose**: Master table of country codes and baseline country risk levels.
- **Primary Key**: `code` (VARCHAR)
- **Columns**: `code`, `name`, `risk_level`

### 2.2 `companies`
- **Purpose**: Enterprise corporations, subsidiaries, and investment entities.
- **Primary Key**: `id` (VARCHAR)
- **Foreign Key**: `country` -> `countries.code`
- **Columns**: `id`, `name`, `country`, `industry`, `status`, `registration_number`

### 2.3 `suppliers`
- **Purpose**: Vendor organizations supplying goods, raw materials, logistics, and parts.
- **Primary Key**: `id` (VARCHAR)
- **Foreign Key**: `country` -> `countries.code`
- **Columns**: `id`, `name`, `country`, `status`, `supplier_type`, `risk_level`

### 2.4 `people`
- **Purpose**: Executives, directors, beneficial owners, and key individuals.
- **Primary Key**: `id` (VARCHAR)
- **Foreign Key**: `country` -> `countries.code`
- **Columns**: `id`, `full_name`, `country`, `role`, `status`

### 2.5 `company_directors`
- **Purpose**: Directorship and officer relationships linking people to companies.
- **Primary Key**: `id` (VARCHAR)
- **Foreign Keys**: `company_id` -> `companies.id`, `person_id` -> `people.id`
- **Columns**: `id`, `company_id`, `person_id`, `role`, `valid_from`, `valid_to`, `source`

### 2.6 `supplier_relationships`
- **Purpose**: Commercial supply chain connections between suppliers and enterprise companies.
- **Primary Key**: `id` (VARCHAR)
- **Foreign Keys**: `supplier_id` -> `suppliers.id`, `company_id` -> `companies.id`
- **Columns**: `id`, `supplier_id`, `company_id`, `relationship_type`, `start_date`, `end_date`, `source`, `confidence`

### 2.7 `ownership`
- **Purpose**: Corporate equity ownership relationships (parent-subsidiary holdings).
- **Primary Key**: `id` (VARCHAR)
- **Foreign Keys**: `owner_company_id` -> `companies.id`, `owned_company_id` -> `companies.id`
- **Columns**: `id`, `owner_company_id`, `owned_company_id`, `ownership_percentage`, `valid_from`, `valid_to`, `source`, `confidence`

### 2.8 `contracts`
- **Purpose**: Commercial supply contracts, start/end dates, values, and status.
- **Primary Key**: `id` (VARCHAR)
- **Foreign Keys**: `supplier_id` -> `suppliers.id`, `company_id` -> `companies.id`
- **Columns**: `id`, `contract_number`, `supplier_id`, `company_id`, `contract_type`, `start_date`, `end_date`, `status`, `value`, `source`

### 2.9 `sanctions`
- **Purpose**: Sanction list entries, watchlists, and regulatory enforcement flags.
- **Primary Key**: `id` (VARCHAR)
- **Foreign Keys**: `company_id` -> `companies.id`, `person_id` -> `people.id`
- **Columns**: `id`, `entity_type`, `company_id`, `person_id`, `authority`, `listed_date`, `delisted_date`, `status`, `source`

---

## 3. Core Investigation Scenarios

### Main Demo Investigation Path (Scenario A)
```
[ Supplier: ABC Industrial Supplies ]
          │ (SUPPLIES)
          ▼
[ Company: Acme Manufacturing ]
          │ (HAS DIRECTOR)
          ▼
[ Person: Rahul Mehta ]
          │ (DIRECTOR OF)
          ▼
[ Company: Orion Trading ]
          │ (LISTED ON)
          ▼
[ Sanction: OFAC SDN List ]
```

### Additional Investigation Paths
- **Scenario B (Corporate Ownership)**: `Nova Holdings` owns 72% of `Meridian Components`.
- **Scenario C (Shared Directorship)**: `Sarah Wilson` is a Director of both `Vertex Global` and `Nova Holdings`.
- **Scenario D (Expiring Contract Risk)**: `Global Components` contract with `Acme Manufacturing` expiring in September 2026.
- **Scenario E (Clean Low-Risk Supplier)**: `Delta Industrial Parts` supplies `Meridian Components` with zero sanction ties.

---

## 4. How to Seed and Reset the Database

### Seeding:
```bash
python scripts/seed_database.py
```

### Validation:
```bash
python scripts/validate_database.py
```
