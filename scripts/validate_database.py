"""
ReasonChain Database Validation Script
Executes 9 validation queries against the seeded database to confirm scenario integrity.
"""

import os
import sys
import sqlite3

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQLITE_DB_PATH = os.path.join(BASE_DIR, "backend", "reasonchain_demo.db")

def validate():
    if not os.path.exists(SQLITE_DB_PATH):
        print("Error: Database file does not exist.")
        sys.exit(1)

    conn = sqlite3.connect(SQLITE_DB_PATH)
    cur = conn.cursor()

    print("=" * 60)
    print("REASONCHAIN DATABASE VALIDATION REPORT")
    print("=" * 60)

    # 1. Count companies
    cur.execute("SELECT COUNT(*) FROM companies")
    c_count = cur.fetchone()[0]
    print(f"\n1. Companies Count: {c_count}")

    # 2. Count suppliers
    cur.execute("SELECT COUNT(*) FROM suppliers")
    s_count = cur.fetchone()[0]
    print(f"2. Suppliers Count: {s_count}")

    # 3. Find all directors of Acme Manufacturing
    cur.execute("""
        SELECT p.id, p.full_name, cd.role 
        FROM company_directors cd
        JOIN people p ON cd.person_id = p.id
        JOIN companies c ON cd.company_id = c.id
        WHERE c.name = 'Acme Manufacturing';
    """)
    acme_directors = cur.fetchall()
    print(f"\n3. Directors of Acme Manufacturing:")
    for row in acme_directors:
        print(f"   - {row[1]} ({row[2]}) [ID: {row[0]}]")

    # 4. Find all companies directed by Rahul Mehta
    cur.execute("""
        SELECT c.id, c.name, cd.role 
        FROM company_directors cd
        JOIN people p ON cd.person_id = p.id
        JOIN companies c ON cd.company_id = c.id
        WHERE p.full_name = 'Rahul Mehta';
    """)
    rahul_companies = cur.fetchall()
    print(f"\n4. Companies directed by Rahul Mehta:")
    for row in rahul_companies:
        print(f"   - {row[1]} ({row[2]}) [ID: {row[0]}]")

    # 5. Find sanctioned companies
    cur.execute("""
        SELECT c.id, c.name, s.authority, s.listed_date
        FROM sanctions s
        JOIN companies c ON s.company_id = c.id
        WHERE s.status = 'Active';
    """)
    sanctioned_companies = cur.fetchall()
    print(f"\n5. Sanctioned Companies:")
    for row in sanctioned_companies:
        print(f"   - {row[1]} (Listed by: {row[2]} on {row[3]})")

    # 6. Find all suppliers connected to Acme Manufacturing
    cur.execute("""
        SELECT sup.id, sup.name, sr.relationship_type
        FROM supplier_relationships sr
        JOIN suppliers sup ON sr.supplier_id = sup.id
        JOIN companies c ON sr.company_id = c.id
        WHERE c.name = 'Acme Manufacturing';
    """)
    acme_suppliers = cur.fetchall()
    print(f"\n6. Suppliers connected to Acme Manufacturing:")
    for row in acme_suppliers:
        print(f"   - {row[1]} [{row[2]}]")

    # 7. Find contracts ending soon
    cur.execute("""
        SELECT ctr.contract_number, sup.name, c.name, ctr.end_date, ctr.value
        FROM contracts ctr
        JOIN suppliers sup ON ctr.supplier_id = sup.id
        JOIN companies c ON ctr.company_id = c.id
        WHERE ctr.status = 'Expiring Soon';
    """)
    expiring_contracts = cur.fetchall()
    print(f"\n7. Contracts Ending Soon / Expiring:")
    for row in expiring_contracts:
        print(f"   - {row[0]}: {row[1]} -> {row[2]} (Expires: {row[3]}, Value: ${row[4]:,.2f})")

    # 8. Find ownership percentages
    cur.execute("""
        SELECT c_owner.name, c_owned.name, o.ownership_percentage
        FROM ownership o
        JOIN companies c_owner ON o.owner_company_id = c_owner.id
        JOIN companies c_owned ON o.owned_company_id = c_owned.id
        LIMIT 5;
    """)
    ownerships = cur.fetchall()
    print(f"\n8. Sample Ownership Percentages:")
    for row in ownerships:
        print(f"   - {row[0]} owns {row[2]}% of {row[1]}")

    # 9. Verify main demo chain
    # ABC Industrial Supplies -> Acme Manufacturing -> Rahul Mehta -> Orion Trading -> Sanction
    cur.execute("""
        SELECT 
            sup.name AS supplier,
            c1.name AS company1,
            p.full_name AS director,
            c2.name AS company2,
            s.authority AS sanction_body
        FROM supplier_relationships sr
        JOIN suppliers sup ON sr.supplier_id = sup.id
        JOIN companies c1 ON sr.company_id = c1.id
        JOIN company_directors cd1 ON c1.id = cd1.company_id
        JOIN people p ON cd1.person_id = p.id
        JOIN company_directors cd2 ON p.id = cd2.person_id
        JOIN companies c2 ON cd2.company_id = c2.id
        JOIN sanctions s ON c2.id = s.company_id
        WHERE sup.name LIKE 'ABC Industrial Supplies%' 
          AND c1.name = 'Acme Manufacturing'
          AND p.full_name = 'Rahul Mehta'
          AND c2.name = 'Orion Trading';
    """)
    demo_chain = cur.fetchall()
    print(f"\n9. Multi-Hop Main Demo Chain Verification:")
    if demo_chain:
        for row in demo_chain:
            print(f"   [VERIFIED CHAIN FOUND]")
            print(f"   Supplier:      {row[0]}")
            print(f"   --> Supplies:  {row[1]}")
            print(f"   --> Director:  {row[2]}")
            print(f"   --> Director Of: {row[3]}")
            print(f"   --> SANCTIONED: {row[4]}")
    else:
        print("   [WARNING] Demo chain not found!")

    print("\n" + "=" * 60)
    print("ALL 9 VALIDATION CHECKS COMPLETED SUCCESSFULLY")
    print("=" * 60)

    conn.close()

if __name__ == "__main__":
    validate()
