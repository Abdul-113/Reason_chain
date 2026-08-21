-- ==================================================
-- REASONCHAIN DEMO ENTERPRISE DATABASE SCHEMA
-- Target Database: PostgreSQL (with SQLite compatibility)
-- ==================================================

DROP TABLE IF EXISTS sanctions CASCADE;
DROP TABLE IF EXISTS contracts CASCADE;
DROP TABLE IF EXISTS ownership CASCADE;
DROP TABLE IF EXISTS supplier_relationships CASCADE;
DROP TABLE IF EXISTS company_directors CASCADE;
DROP TABLE IF EXISTS people CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS countries CASCADE;

-- 1. COUNTRIES
CREATE TABLE countries (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    risk_level VARCHAR(20) DEFAULT 'Low'
);

-- 2. COMPANIES
CREATE TABLE companies (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(10) REFERENCES countries(code),
    industry VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Active',
    registration_number VARCHAR(100)
);

-- 3. SUPPLIERS
CREATE TABLE suppliers (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(10) REFERENCES countries(code),
    status VARCHAR(50) DEFAULT 'Active',
    supplier_type VARCHAR(100),
    risk_level VARCHAR(20) DEFAULT 'Low'
);

-- 4. PEOPLE
CREATE TABLE people (
    id VARCHAR(50) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    country VARCHAR(10) REFERENCES countries(code),
    role VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Active'
);

-- 5. COMPANY DIRECTORS
CREATE TABLE company_directors (
    id VARCHAR(50) PRIMARY KEY,
    company_id VARCHAR(50) REFERENCES companies(id),
    person_id VARCHAR(50) REFERENCES people(id),
    role VARCHAR(100),
    valid_from VARCHAR(20),
    valid_to VARCHAR(20),
    source VARCHAR(100) DEFAULT 'Corporate Registry'
);

-- 6. SUPPLIER RELATIONSHIPS
CREATE TABLE supplier_relationships (
    id VARCHAR(50) PRIMARY KEY,
    supplier_id VARCHAR(50) REFERENCES suppliers(id),
    company_id VARCHAR(50) REFERENCES companies(id),
    relationship_type VARCHAR(100) DEFAULT 'SUPPLIES',
    start_date VARCHAR(20),
    end_date VARCHAR(20),
    source VARCHAR(100) DEFAULT 'ERP',
    confidence NUMERIC(3,2) DEFAULT 0.95
);

-- 7. OWNERSHIP
CREATE TABLE ownership (
    id VARCHAR(50) PRIMARY KEY,
    owner_company_id VARCHAR(50) REFERENCES companies(id),
    owned_company_id VARCHAR(50) REFERENCES companies(id),
    ownership_percentage NUMERIC(5,2) NOT NULL,
    valid_from VARCHAR(20),
    valid_to VARCHAR(20),
    source VARCHAR(100) DEFAULT 'Corporate Registry',
    confidence NUMERIC(3,2) DEFAULT 0.98
);

-- 8. CONTRACTS
CREATE TABLE contracts (
    id VARCHAR(50) PRIMARY KEY,
    contract_number VARCHAR(100) NOT NULL,
    supplier_id VARCHAR(50) REFERENCES suppliers(id),
    company_id VARCHAR(50) REFERENCES companies(id),
    contract_type VARCHAR(100),
    start_date VARCHAR(20),
    end_date VARCHAR(20),
    status VARCHAR(50) DEFAULT 'Active',
    value NUMERIC(14,2),
    source VARCHAR(100) DEFAULT 'Contracts Repository'
);

-- 9. SANCTIONS
CREATE TABLE sanctions (
    id VARCHAR(50) PRIMARY KEY,
    entity_type VARCHAR(20) CHECK (entity_type IN ('company', 'person')),
    company_id VARCHAR(50) REFERENCES companies(id),
    person_id VARCHAR(50) REFERENCES people(id),
    authority VARCHAR(100) NOT NULL,
    listed_date VARCHAR(20) NOT NULL,
    delisted_date VARCHAR(20),
    status VARCHAR(50) DEFAULT 'Active',
    source VARCHAR(100) DEFAULT 'Compliance Registry'
);

-- INDEXES FOR FREQUENT LOOKUPS
CREATE INDEX idx_companies_name ON companies(name);
CREATE INDEX idx_suppliers_name ON suppliers(name);
CREATE INDEX idx_people_full_name ON people(full_name);
CREATE INDEX idx_company_directors_comp ON company_directors(company_id);
CREATE INDEX idx_company_directors_person ON company_directors(person_id);
CREATE INDEX idx_supplier_rel_supplier ON supplier_relationships(supplier_id);
CREATE INDEX idx_supplier_rel_company ON supplier_relationships(company_id);
CREATE INDEX idx_ownership_owner ON ownership(owner_company_id);
CREATE INDEX idx_ownership_owned ON ownership(owned_company_id);
CREATE INDEX idx_sanctions_company ON sanctions(company_id);
CREATE INDEX idx_sanctions_person ON sanctions(person_id);
