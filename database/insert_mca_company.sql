-- ========================================================
-- Insert MCA Company Record into ReasonChain PostgreSQL
-- Company: 3A INNOVATIVE TECHNOLOGIES PRIVATE LIMITED (CIN: U31908MH2012PTC230026)
-- ========================================================

-- 1. Insert into core 'companies' table (for Knowledge Graph, Entity Resolution & Ingestion)
INSERT INTO companies (id, name, country, industry, status, registration_number)
VALUES (
    'U31908MH2012PTC230026',
    '3A INNOVATIVE TECHNOLOGIES PRIVATE LIMITED',
    'IN',
    'Manufacturing (Machinery and Equipments)',
    'Active',
    'U31908MH2012PTC230026'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    country = EXCLUDED.country,
    industry = EXCLUDED.industry,
    status = EXCLUDED.status,
    registration_number = EXCLUDED.registration_number;

-- 2. Optional: Dedicated Full MCA Companies Table with all 16 attributes
CREATE TABLE IF NOT EXISTS mca_companies (
    cin VARCHAR(50) PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    authorized_capital BIGINT,
    paid_up_capital BIGINT,
    company_category VARCHAR(100),
    company_class VARCHAR(50),
    company_sub_category VARCHAR(100),
    company_status VARCHAR(50),
    indian_foreign_company VARCHAR(50),
    industrial_classification VARCHAR(255),
    listing_status VARCHAR(50),
    nic_code INTEGER,
    registered_office_address TEXT,
    registration_date VARCHAR(50),
    roc_code VARCHAR(100),
    state_code VARCHAR(50)
);

INSERT INTO mca_companies (
    cin,
    company_name,
    authorized_capital,
    paid_up_capital,
    company_category,
    company_class,
    company_sub_category,
    company_status,
    indian_foreign_company,
    industrial_classification,
    listing_status,
    nic_code,
    registered_office_address,
    registration_date,
    roc_code,
    state_code
) VALUES (
    'U31908MH2012PTC230026',
    '3A INNOVATIVE TECHNOLOGIES PRIVATE LIMITED',
    100000,
    100000,
    'Company limited by shares',
    'Private',
    'Non-government company',
    'Active',
    'India',
    'Manufacturing (Machinery and Equipments)',
    'Unlisted',
    31908,
    'A-56, Nandkishore Industrial Est, 2nd flr,Nr Paper Box factory, Off Mahakali Caves Rd, Andh,eri East,Mumbai,Maharashtra,400093-India',
    '2012-04-20',
    'ROC Mumbai',
    'maharashtra'
)
ON CONFLICT (cin) DO UPDATE SET
    company_name = EXCLUDED.company_name,
    authorized_capital = EXCLUDED.authorized_capital,
    paid_up_capital = EXCLUDED.paid_up_capital,
    company_status = EXCLUDED.company_status;
