// ==================================================
// REASONCHAIN GRAPH VALIDATION QUERIES
// Run these in Neo4j Browser (http://localhost:7474)
// ==================================================

// 1. Count nodes by label
MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count ORDER BY label;

// 2. Count relationships by type
MATCH ()-[r]->() RETURN type(r) AS rel_type, count(r) AS count ORDER BY rel_type;

// 3. Find all companies
MATCH (c:Company) RETURN c.id, c.name, c.country, c.industry, c.status ORDER BY c.id;

// 4. Find all suppliers
MATCH (s:Supplier) RETURN s.id, s.name, s.country, s.risk_level ORDER BY s.id;

// 5. Find orphan suppliers (no relationships)
MATCH (s:Supplier) WHERE NOT (s)--() RETURN s.id, s.name;

// 6. Find companies without any relationships
MATCH (c:Company) WHERE NOT (c)--() RETURN c.id, c.name;

// 7. Find duplicate normalized names (Company)
MATCH (c:Company) WITH c._normalized_name AS norm, collect(c) AS nodes WHERE size(nodes) > 1
RETURN norm, [n IN nodes | n.name] AS names, [n IN nodes | n.id] AS ids;

// 8. Find duplicate normalized names (Supplier)
MATCH (s:Supplier) WITH s._normalized_name AS norm, collect(s) AS nodes WHERE size(nodes) > 1
RETURN norm, [n IN nodes | n.name] AS names, [n IN nodes | n.id] AS ids;

// 9. Find sanctioned companies
MATCH (c:Company)-[r:SANCTIONED_BY]->(sn:Sanction)
RETURN c.name, sn.authority, sn.listed_date, sn.status;

// 10. Find sanctioned persons
MATCH (p:Person)-[r:SANCTIONED_BY]->(sn:Sanction)
RETURN p.full_name, sn.authority, sn.listed_date, sn.status;

// 11. Ownership chains
MATCH (owner:Company)-[r:OWNS]->(owned:Company)
RETURN owner.name AS owner, owned.name AS owned, r.ownership_percentage
ORDER BY r.ownership_percentage DESC;

// 12. Directors with multiple companies
MATCH (p:Person)-[r:DIRECTOR_OF]->(c:Company)
WITH p, collect(c.name) AS companies
WHERE size(companies) > 1
RETURN p.full_name, companies;

// 13. Find contracts expiring soon
MATCH (s:Supplier)-[r:HAS_CONTRACT]->(c:Company)
WHERE r.status = 'Expiring Soon'
RETURN s.name, c.name, r.contract_number, r.end_date, r.value
ORDER BY r.end_date;

// 14. MAIN DEMO CHAIN - Multi-hop investigation path
MATCH path = (s:Supplier {name: 'ABC Industrial Supplies'})
      -[:SUPPLIES]->(c1:Company {name: 'Acme Manufacturing'})
      -[:HAS_DIRECTOR]->(p:Person {full_name: 'Rahul Mehta'})
      -[:DIRECTOR_OF]->(c2:Company {name: 'Orion Trading'})
      -[:SANCTIONED_BY]->(sn:Sanction)
RETURN s.name AS supplier,
       c1.name AS company1,
       p.full_name AS person,
       c2.name AS company2,
       sn.authority AS sanction_authority;

// 15. All paths from a supplier to any sanctioned entity (multi-hop)
MATCH path = (s:Supplier)-[:SUPPLIES|HAS_DIRECTOR|DIRECTOR_OF|OWNS*1..5]->(target)
      -[:SANCTIONED_BY]->(sn:Sanction)
RETURN s.name, [n IN nodes(path) | coalesce(n.name, n.full_name, n.authority)] AS chain,
       length(path) AS hops
ORDER BY hops;

// 16. Temporal query — expired directorships
MATCH (p:Person)-[r:DIRECTOR_OF]->(c:Company)
WHERE r.valid_to < date().toString()
RETURN p.full_name, c.name, r.role, r.valid_from, r.valid_to;

// 17. Country risk distribution
MATCH (co:Country)<-[:LOCATED_IN]-(entity)
RETURN co.name, co.risk_level, labels(entity)[0] AS entity_type, count(entity) AS count
ORDER BY co.risk_level DESC, count DESC;
