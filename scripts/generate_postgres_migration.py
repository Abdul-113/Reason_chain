"""
Generate complete PostgreSQL migration SQL script from SQLite normalized database.
"""
import os
import sys
import sqlite3

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "backend", "reasonchain_demo.db")
SQL_PATH = os.path.join(BASE_DIR, "database", "replace_with_firebase_relationships.sql")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

def escape_sql(val):
    if val is None:
        return 'NULL'
    if isinstance(val, bool):
        return 'TRUE' if val else 'FALSE'
    if isinstance(val, (int, float)):
        return str(val)
    s = str(val).replace("'", "''")
    return f"'{s}'"

with open(SQL_PATH, "a", encoding="utf-8") as f:
    f.write("\n-- 3. INSERT RESOLVED ENTITIES AND RELATIONSHIPS\n\n")

    # Import batches
    cur.execute("SELECT * FROM import_batches")
    cols = [d[0] for d in cur.description]
    for row in cur.fetchall():
        d = dict(zip(cols, row))
        f.write(f"INSERT INTO import_batches (batch_id, source_system, source_path, schema_version, content_hash, record_counts, is_synthetic, is_authoritative, status, metadata) VALUES ({escape_sql(d['batch_id'])}, {escape_sql(d['source_system'])}, {escape_sql(d['source_path'])}, {escape_sql(d['schema_version'])}, {escape_sql(d['content_hash'])}, {escape_sql(d['record_counts'])}::jsonb, TRUE, FALSE, {escape_sql(d['status'])}, {escape_sql(d['metadata'])}::jsonb) ON CONFLICT (batch_id) DO NOTHING;\n")

    f.write("\n")
    # Companies
    cur.execute("SELECT * FROM companies")
    cols = [d[0] for d in cur.description]
    for row in cur.fetchall():
        d = dict(zip(cols, row))
        f.write(f"INSERT INTO companies (id, name, country, industry, status, registration_number, is_synthetic, raw_payload) VALUES ({escape_sql(d['id'])}, {escape_sql(d['name'])}, {escape_sql(d['country'])}, {escape_sql(d['industry'])}, {escape_sql(d['status'])}, {escape_sql(d['registration_number'])}, FALSE, {escape_sql(d['raw_payload'])}::jsonb) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;\n")

    f.write("\n")
    # Company links
    cur.execute("SELECT * FROM company_links")
    cols = [d[0] for d in cur.description]
    for row in cur.fetchall():
        d = dict(zip(cols, row))
        f.write(f"INSERT INTO company_links (company_key, cin, company_name, source_path, mock_relationships_present, canonical_id, resolution_status, raw_payload) VALUES ({escape_sql(d['company_key'])}, {escape_sql(d['cin'])}, {escape_sql(d['company_name'])}, {escape_sql(d['source_path'])}, TRUE, {escape_sql(d['canonical_id'])}, {escape_sql(d['resolution_status'])}, {escape_sql(d['raw_payload'])}::jsonb) ON CONFLICT (company_key) DO NOTHING;\n")

    f.write("\n")
    # External companies
    cur.execute("SELECT * FROM external_companies")
    cols = [d[0] for d in cur.description]
    for row in cur.fetchall():
        d = dict(zip(cols, row))
        f.write(f"INSERT INTO external_companies (id, name, country, status, is_synthetic, raw_payload) VALUES ({escape_sql(d['id'])}, {escape_sql(d['name'])}, {escape_sql(d['country'])}, {escape_sql(d['status'])}, TRUE, {escape_sql(d['raw_payload'])}::jsonb) ON CONFLICT (id) DO NOTHING;\n")

    f.write("\n")
    # People
    cur.execute("SELECT * FROM people")
    cols = [d[0] for d in cur.description]
    for row in cur.fetchall():
        d = dict(zip(cols, row))
        f.write(f"INSERT INTO people (id, full_name, country, role, status, is_synthetic, raw_payload) VALUES ({escape_sql(d['id'])}, {escape_sql(d['full_name'])}, {escape_sql(d['country'])}, {escape_sql(d['role'])}, {escape_sql(d['status'])}, TRUE, {escape_sql(d['raw_payload'])}::jsonb) ON CONFLICT (id) DO NOTHING;\n")

    f.write("\n")
    # Suppliers
    cur.execute("SELECT * FROM suppliers")
    cols = [d[0] for d in cur.description]
    for row in cur.fetchall():
        d = dict(zip(cols, row))
        f.write(f"INSERT INTO suppliers (id, name, country, status, supplier_type, risk_level, is_synthetic, raw_payload) VALUES ({escape_sql(d['id'])}, {escape_sql(d['name'])}, {escape_sql(d['country'])}, {escape_sql(d['status'])}, {escape_sql(d['supplier_type'])}, {escape_sql(d['risk_level'])}, TRUE, {escape_sql(d['raw_payload'])}::jsonb) ON CONFLICT (id) DO NOTHING;\n")

    f.write("\n")
    # Contracts
    cur.execute("SELECT * FROM contracts")
    cols = [d[0] for d in cur.description]
    for row in cur.fetchall():
        d = dict(zip(cols, row))
        f.write(f"INSERT INTO contracts (id, contract_number, supplier_id, company_id, contract_type, start_date, end_date, status, value, source, is_synthetic, raw_payload) VALUES ({escape_sql(d['id'])}, {escape_sql(d['contract_number'])}, {escape_sql(d['supplier_id'])}, {escape_sql(d['company_id'])}, {escape_sql(d['contract_type'])}, {escape_sql(d['start_date'])}, {escape_sql(d['end_date'])}, {escape_sql(d['status'])}, {escape_sql(d['value'])}, {escape_sql(d['source'])}, TRUE, {escape_sql(d['raw_payload'])}::jsonb) ON CONFLICT (id) DO NOTHING;\n")

    f.write("\n")
    # Sanctions
    cur.execute("SELECT * FROM sanctions")
    cols = [d[0] for d in cur.description]
    for row in cur.fetchall():
        d = dict(zip(cols, row))
        f.write(f"INSERT INTO sanctions (id, entity_type, company_id, authority, listed_date, status, source, list_name, jurisdiction, is_synthetic, raw_payload) VALUES ({escape_sql(d['id'])}, {escape_sql(d['entity_type'])}, {escape_sql(d['company_id'])}, {escape_sql(d['authority'])}, {escape_sql(d['listed_date'])}, {escape_sql(d['status'])}, {escape_sql(d['source'])}, {escape_sql(d['list_name'])}, {escape_sql(d['jurisdiction'])}, TRUE, {escape_sql(d['raw_payload'])}::jsonb) ON CONFLICT (id) DO NOTHING;\n")

    f.write("\n")
    # Relationship claims
    cur.execute("SELECT * FROM relationship_claims")
    cols = [d[0] for d in cur.description]
    for row in cur.fetchall():
        d = dict(zip(cols, row))
        f.write(f"INSERT INTO relationship_claims (relationship_id, import_batch_id, relationship_type, from_entity_id, from_entity_type, to_entity_id, to_entity_type, from_cin, to_cin, from_source_key, to_source_key, role, ownership_percentage, affiliation_reason, reason, contract_id, valid_from, valid_to, active, confidence, is_synthetic, validation_status, raw_payload) VALUES ({escape_sql(d['relationship_id'])}, {escape_sql(d['import_batch_id'])}, {escape_sql(d['relationship_type'])}, {escape_sql(d['from_entity_id'])}, {escape_sql(d['from_entity_type'])}, {escape_sql(d['to_entity_id'])}, {escape_sql(d['to_entity_type'])}, {escape_sql(d['from_cin'])}, {escape_sql(d['to_cin'])}, {escape_sql(d['from_source_key'])}, {escape_sql(d['to_source_key'])}, {escape_sql(d['role'])}, {escape_sql(d['ownership_percentage'])}, {escape_sql(d['affiliation_reason'])}, {escape_sql(d['reason'])}, {escape_sql(d['contract_id'])}, {escape_sql(d['valid_from'])}, {escape_sql(d['valid_to'])}, TRUE, {escape_sql(d['confidence'])}, TRUE, {escape_sql(d['validation_status'])}, {escape_sql(d['raw_payload'])}::jsonb) ON CONFLICT (relationship_id) DO NOTHING;\n")

    f.write("\n-- 4. INSERT INTO RELATIONAL GRAPH EDGE TABLES\n")
    cur.execute("SELECT * FROM company_directors")
    cols = [d[0] for d in cur.description]
    for row in cur.fetchall():
        d = dict(zip(cols, row))
        f.write(f"INSERT INTO company_directors (id, company_id, person_id, role, valid_from, valid_to, source) VALUES ({escape_sql(d['id'])}, {escape_sql(d['company_id'])}, {escape_sql(d['person_id'])}, {escape_sql(d['role'])}, {escape_sql(d['valid_from'])}, {escape_sql(d['valid_to'])}, {escape_sql(d['source'])}) ON CONFLICT (id) DO NOTHING;\n")

    cur.execute("SELECT * FROM supplier_relationships")
    cols = [d[0] for d in cur.description]
    for row in cur.fetchall():
        d = dict(zip(cols, row))
        f.write(f"INSERT INTO supplier_relationships (id, supplier_id, company_id, relationship_type, start_date, end_date, source, confidence) VALUES ({escape_sql(d['id'])}, {escape_sql(d['supplier_id'])}, {escape_sql(d['company_id'])}, {escape_sql(d['relationship_type'])}, {escape_sql(d['start_date'])}, {escape_sql(d['end_date'])}, {escape_sql(d['source'])}, {escape_sql(d['confidence'])}) ON CONFLICT (id) DO NOTHING;\n")

    cur.execute("SELECT * FROM ownership")
    cols = [d[0] for d in cur.description]
    for row in cur.fetchall():
        d = dict(zip(cols, row))
        f.write(f"INSERT INTO ownership (id, owner_company_id, owned_company_id, ownership_percentage, valid_from, valid_to, source, confidence) VALUES ({escape_sql(d['id'])}, {escape_sql(d['owner_company_id'])}, {escape_sql(d['owned_company_id'])}, {escape_sql(d['ownership_percentage'])}, {escape_sql(d['valid_from'])}, {escape_sql(d['valid_to'])}, {escape_sql(d['source'])}, {escape_sql(d['confidence'])}) ON CONFLICT (id) DO NOTHING;\n")

    f.write("\nCOMMIT;\n")

conn.close()
print("Successfully generated database/replace_with_firebase_relationships.sql!")
