// ==========================================
// REASONCHAIN CENTRAL MOCK DATA ENGINE
// Structured relational mock data across 5 scenarios
// ==========================================

export interface Entity {
  id: string;
  name: string;
  type: 'Supplier' | 'Company' | 'Person' | 'Contract' | 'Sanction';
  country: string;
  risk: 'High' | 'Medium' | 'Low' | 'Critical';
  source: string;
  relationshipsCount: number;
  lastUpdated: string;
  scenarioId: string;
  details: string;
}

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  type: 'SUPPLIES' | 'DIRECTOR_OF' | 'LISTED_ON' | 'OWNS' | 'SUBSIDIARY_OF' | 'CONSULTANT_TO' | 'BOUND_BY';
  status: 'verified' | 'warning' | 'risk';
  scenarioId: string;
}

export interface Investigation {
  id: string;
  title: string;
  question: string;
  targetEntityId: string;
  status: 'Verified' | 'Under Review' | 'Flagged';
  risk: 'High' | 'Medium' | 'Low' | 'Critical';
  confidence: string;
  createdDate: string;
  scenarioId: string;
  proofId?: string;
  hopsCount: number;
}

export interface Proof {
  id: string;
  investigationId: string;
  title: string;
  question: string;
  conclusion: string;
  risk: 'High' | 'Medium' | 'Low' | 'Critical';
  verificationStatus: 'Cryptographically Verified' | 'Attested' | 'Pending Audit';
  evidenceCount: number;
  hopsCount: number;
  createdDate: string;
  rulesEvaluated: string[];
  hash: string;
  evidenceSources: string[];
}

export interface DataSource {
  id: string;
  name: string;
  type: 'PostgreSQL' | 'MySQL' | 'REST API' | 'S3 Bucket' | 'Document Stream';
  category: 'ERP' | 'CRM' | 'SEC Filings' | 'Sanctions List' | 'Legal Contracts';
  status: 'Healthy' | 'Syncing' | 'Degraded';
  recordCount: number;
  lastSync: string;
  syncDuration: string;
  schemaVersion: string;
  tablesCount: number;
}

export interface Rule {
  id: string;
  code: string;
  name: string;
  category: 'Sanctions' | 'Ownership' | 'Conflict' | 'Contracts';
  conditions: string;
  conclusion: string;
  status: 'Active' | 'Draft' | 'Deprecated';
  version: string;
  lastUpdated: string;
  timesApplied: number;
  severity: 'High' | 'Medium' | 'Critical' | 'Low';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  object: string;
  result: 'Success' | 'Flagged' | 'Modified';
  ipAddress: string;
}

export interface AnalyticsSummary {
  totalInvestigations: number;
  completedInvestigations: number;
  underReviewInvestigations: number;
  failedInvestigations: number;
  investigationSuccessRate: string;
  ruleExecutionsTotal: number;
  monthlyGrowthEntities: string;
  monthlyGrowthRelationships: string;
  riskTrendData: { date: string; high: number; medium: number; low: number }[];
  ruleExecutionStats: { ruleCode: string; count: number }[];
}

// ------------------------------------------
// 1. ENTITIES DATASET
// ------------------------------------------
export const mockEntities: Entity[] = [
  // Scenario 1: Supplier Sanctions
  { id: 'ENT-1024', name: 'ABC Industrial Supplies', type: 'Supplier', country: 'Germany', risk: 'High', source: 'ERP PostgreSQL', relationshipsCount: 14, lastUpdated: '10 min ago', scenarioId: 'S1', details: 'Hardware & Raw Material Vendor' },
  { id: 'ENT-1025', name: 'Acme Manufacturing', type: 'Company', country: 'United States', risk: 'Low', source: 'Corporate Registry', relationshipsCount: 8, lastUpdated: '1 hour ago', scenarioId: 'S1', details: 'Parent Manufacturing Subsidiary' },
  { id: 'ENT-1026', name: 'Rahul Mehta', type: 'Person', country: 'United Kingdom', risk: 'Medium', source: 'SEC Filings', relationshipsCount: 4, lastUpdated: '3 hours ago', scenarioId: 'S1', details: 'Managing Director & Board Member' },
  { id: 'ENT-1027', name: 'Orion Trading LLC', type: 'Company', country: 'Panama', risk: 'High', source: 'Offshore Registry', relationshipsCount: 6, lastUpdated: '5 hours ago', scenarioId: 'S1', details: 'Offshore Trading Shell Entity' },
  { id: 'ENT-1028', name: 'OFAC Sanctions List', type: 'Sanction', country: 'Global', risk: 'Critical', source: 'US Treasury SDN', relationshipsCount: 112, lastUpdated: 'Live Feed', scenarioId: 'S1', details: 'Specially Designated Nationals' },

  // Scenario 2: Ownership Investigation
  { id: 'ENT-2001', name: 'Nova Holdings Ltd', type: 'Company', country: 'Cayman Islands', risk: 'Medium', source: 'Offshore Registry', relationshipsCount: 19, lastUpdated: '12 min ago', scenarioId: 'S2', details: 'Primary Private Equity Holding' },
  { id: 'ENT-2002', name: 'Vertex Global Corp', type: 'Company', country: 'Singapore', risk: 'Low', source: 'ACRA Registry', relationshipsCount: 28, lastUpdated: '2 hours ago', scenarioId: 'S2', details: 'Tech Infrastructure Operator' },
  { id: 'ENT-2003', name: 'Meridian Group', type: 'Company', country: 'Hong Kong', risk: 'Medium', source: 'HK Corporate Registry', relationshipsCount: 11, lastUpdated: '1 day ago', scenarioId: 'S2', details: 'Regional Subsidiary Network' },

  // Scenario 3: Conflict of Interest
  { id: 'ENT-3001', name: 'Sarah Wilson', type: 'Person', country: 'United States', risk: 'Medium', source: 'Executive HR Database', relationshipsCount: 5, lastUpdated: '30 min ago', scenarioId: 'S3', details: 'VP of Procurement' },
  { id: 'ENT-3002', name: 'Alpha Logistics', type: 'Company', country: 'United States', risk: 'Low', source: 'ERP Vendor Master', relationshipsCount: 12, lastUpdated: '4 hours ago', scenarioId: 'S3', details: 'Primary Freight Vendor' },
  { id: 'ENT-3003', name: 'Beta Logistics Advisory', type: 'Company', country: 'Delaware, US', risk: 'High', source: 'State Corporate Filings', relationshipsCount: 3, lastUpdated: '2 days ago', scenarioId: 'S3', details: 'External Consulting Entity' },

  // Scenario 4: Contract Risk
  { id: 'ENT-4001', name: 'Prime Materials Corp', type: 'Supplier', country: 'Switzerland', risk: 'Low', source: 'Contract Lifecycle System', relationshipsCount: 9, lastUpdated: '15 min ago', scenarioId: 'S4', details: 'Specialized Titanium Supplier' },
  { id: 'ENT-4002', name: 'Master Supply Agreement §892', type: 'Contract', country: 'Global', risk: 'High', source: 'Legal CLM', relationshipsCount: 4, lastUpdated: 'Expires Sep 2026', scenarioId: 'S4', details: '$42M Long-term Supply Obligation' },

  // Scenario 5: Corporate Network
  { id: 'ENT-5001', name: 'Vanguard Capital', type: 'Company', country: 'United Kingdom', risk: 'Low', source: 'FCA Registry', relationshipsCount: 34, lastUpdated: '20 min ago', scenarioId: 'S5', details: 'Institutional Investment Arm' }
];

// ------------------------------------------
// 2. RELATIONSHIPS DATASET
// ------------------------------------------
export const mockRelationships: Relationship[] = [
  // Scenario 1
  { id: 'REL-101', sourceId: 'ENT-1024', targetId: 'ENT-1025', label: 'SUPPLIES_TO', type: 'SUPPLIES', status: 'verified', scenarioId: 'S1' },
  { id: 'REL-102', sourceId: 'ENT-1025', targetId: 'ENT-1026', label: 'DIRECTOR_OF', type: 'DIRECTOR_OF', status: 'verified', scenarioId: 'S1' },
  { id: 'REL-103', sourceId: 'ENT-1026', targetId: 'ENT-1027', label: 'DIRECTOR_OF', type: 'DIRECTOR_OF', status: 'warning', scenarioId: 'S1' },
  { id: 'REL-104', sourceId: 'ENT-1027', targetId: 'ENT-1028', label: 'LISTED_ON', type: 'LISTED_ON', status: 'risk', scenarioId: 'S1' },

  // Scenario 2
  { id: 'REL-201', sourceId: 'ENT-2001', targetId: 'ENT-2002', label: 'OWNS_72%', type: 'OWNS', status: 'verified', scenarioId: 'S2' },
  { id: 'REL-202', sourceId: 'ENT-2002', targetId: 'ENT-2003', label: 'SUBSIDIARY_OF', type: 'SUBSIDIARY_OF', status: 'warning', scenarioId: 'S2' },

  // Scenario 3
  { id: 'REL-301', sourceId: 'ENT-3001', targetId: 'ENT-3002', label: 'DIRECTOR', type: 'DIRECTOR_OF', status: 'verified', scenarioId: 'S3' },
  { id: 'REL-302', sourceId: 'ENT-3001', targetId: 'ENT-3003', label: 'CONSULTANT_TO', type: 'CONSULTANT_TO', status: 'risk', scenarioId: 'S3' },

  // Scenario 4
  { id: 'REL-401', sourceId: 'ENT-4001', targetId: 'ENT-4002', label: 'BOUND_BY', type: 'BOUND_BY', status: 'warning', scenarioId: 'S4' },

  // Scenario 5
  { id: 'REL-501', sourceId: 'ENT-5001', targetId: 'ENT-2001', label: 'SHAREHOLDER', type: 'OWNS', status: 'verified', scenarioId: 'S5' }
];

// ------------------------------------------
// 3. INVESTIGATIONS DATASET
// ------------------------------------------
export const mockInvestigations: Investigation[] = [
  { id: 'INV-1042', title: 'Supplier Sanctions Exposure', question: 'Which active suppliers are indirectly connected to sanctioned companies?', targetEntityId: 'ENT-1024', status: 'Verified', risk: 'High', confidence: '94.2%', createdDate: '2026-08-10 10:42', scenarioId: 'S1', proofId: 'PRF-1042', hopsCount: 4 },
  { id: 'INV-2019', title: 'Beneficial Ownership Trace', question: 'Who ultimately exercises beneficial control over Vertex Global Corp?', targetEntityId: 'ENT-2002', status: 'Verified', risk: 'Medium', confidence: '98.7%', createdDate: '2026-08-10 09:15', scenarioId: 'S2', proofId: 'PRF-2019', hopsCount: 3 },
  { id: 'INV-3088', title: 'Executive Conflict Audit', question: 'Are any VP-level executives serving as paid consultants to active vendors?', targetEntityId: 'ENT-3001', status: 'Under Review', risk: 'High', confidence: '89.1%', createdDate: '2026-08-09 16:20', scenarioId: 'S3', proofId: 'PRF-3088', hopsCount: 2 },
  { id: 'INV-4012', title: 'Critical Contract Renewal Risk', question: 'Which major supplier contracts with single-source vendors expire in 2026?', targetEntityId: 'ENT-4002', status: 'Verified', risk: 'Low', confidence: '99.5%', createdDate: '2026-08-08 14:05', scenarioId: 'S4', proofId: 'PRF-4012', hopsCount: 2 }
];

// ------------------------------------------
// 4. PROOFS DATASET
// ------------------------------------------
export const mockProofs: Proof[] = [
  {
    id: 'PRF-1042',
    investigationId: 'INV-1042',
    title: 'Indirect Sanctions Link Proof Package',
    question: 'Which active suppliers are indirectly connected to sanctioned companies?',
    conclusion: 'ABC Industrial Supplies is linked to OFAC sanctioned Orion Trading through dual-Director Rahul Mehta.',
    risk: 'High',
    verificationStatus: 'Cryptographically Verified',
    evidenceCount: 4,
    hopsCount: 4,
    createdDate: '2026-08-10 10:45 UTC',
    rulesEvaluated: ['AML-04', 'SEC-OWNER', 'SANCTION-CHECK'],
    hash: '0x9a8f...31bc',
    evidenceSources: ['ERP Vendor File #892', 'SEC Directorship Filing #441', 'OFAC SDN Master Feed']
  },
  {
    id: 'PRF-2019',
    investigationId: 'INV-2019',
    title: 'Ultimate Beneficial Owner (UBO) Attestation',
    question: 'Who ultimately exercises beneficial control over Vertex Global Corp?',
    conclusion: 'Nova Holdings Ltd maintains 72% controlling stake in Vertex Global Corp via Singapore ACRA records.',
    risk: 'Medium',
    verificationStatus: 'Attested',
    evidenceCount: 6,
    hopsCount: 3,
    createdDate: '2026-08-10 09:30 UTC',
    rulesEvaluated: ['SEC-OWNER', 'UBO-THRESHOLD-50'],
    hash: '0x4b7c...881e',
    evidenceSources: ['ACRA Shareholder Register', 'Cayman Registry Filing #1092']
  },
  {
    id: 'PRF-3088',
    investigationId: 'INV-3088',
    title: 'Executive Dual-Role Conflict Proof',
    question: 'Are any VP-level executives serving as paid consultants to active vendors?',
    conclusion: 'Sarah Wilson (VP Procurement) holds undisclosed consultancy contract with Beta Logistics Advisory.',
    risk: 'High',
    verificationStatus: 'Pending Audit',
    evidenceCount: 3,
    hopsCount: 2,
    createdDate: '2026-08-09 16:40 UTC',
    rulesEvaluated: ['CONFLICT-07', 'HR-COMPLIANCE-01'],
    hash: '0x1e2d...772b',
    evidenceSources: ['Internal HR Roster', 'Delaware Corp Registry']
  }
];

// ------------------------------------------
// 5. DATA SOURCES DATASET
// ------------------------------------------
export const mockDataSources: DataSource[] = [
  { id: 'SRC-01', name: 'PostgreSQL ERP Master', type: 'PostgreSQL', category: 'ERP', status: 'Healthy', recordCount: 125430, lastSync: '8 mins ago', syncDuration: '42s', schemaVersion: 'v3.4.1', tablesCount: 18 },
  { id: 'SRC-02', name: 'Salesforce CRM Database', type: 'REST API', category: 'CRM', status: 'Healthy', recordCount: 84200, lastSync: '14 mins ago', syncDuration: '18s', schemaVersion: 'v2.1.0', tablesCount: 12 },
  { id: 'SRC-03', name: 'SEC EDGAR Corporate Filings', type: 'Document Stream', category: 'SEC Filings', status: 'Healthy', recordCount: 421000, lastSync: '2 mins ago', syncDuration: '3m 12s', schemaVersion: 'v5.0.0', tablesCount: 4 },
  { id: 'SRC-04', name: 'OFAC & Global Sanctions API', type: 'REST API', category: 'Sanctions List', status: 'Healthy', recordCount: 18450, lastSync: 'Live Feed', syncDuration: 'Real-time', schemaVersion: 'v1.8.9', tablesCount: 2 },
  { id: 'SRC-05', name: 'Icertis Contract Repository', type: 'S3 Bucket', category: 'Legal Contracts', status: 'Syncing', recordCount: 14200, lastSync: 'Syncing now...', syncDuration: 'In progress', schemaVersion: 'v2.0.4', tablesCount: 6 }
];

// ------------------------------------------
// 6. RULES DATASET
// ------------------------------------------
export const mockRules: Rule[] = [
  { id: 'R-01', code: 'AML-04', name: 'Supplier Sanctions Exposure', category: 'Sanctions', conditions: 'IF Entity(Supplier) -> CONNECTED_TO -> Entity(Sanction) WHERE HopDistance <= 4', conclusion: 'Flag Supplier as High Risk Sanction Path', status: 'Active', version: 'v4.2', lastUpdated: '2026-08-01', timesApplied: 482, severity: 'Critical' },
  { id: 'R-02', code: 'SEC-OWNER', name: 'Ultimate Ownership Threshold', category: 'Ownership', conditions: 'IF Entity(Company) -> OWNS -> Entity(Company) WHERE StakePercentage >= 50%', conclusion: 'Assign Ultimate Beneficial Ownership (UBO)', status: 'Active', version: 'v2.1', lastUpdated: '2026-07-15', timesApplied: 231, severity: 'Medium' },
  { id: 'R-03', code: 'CONFLICT-07', name: 'Executive Shared Role Detection', category: 'Conflict', conditions: 'IF Person(Executive) -> DIRECTOR_OF -> Company(Vendor) AND CONSULTANT_TO -> Company(Vendor)', conclusion: 'Trigger Immediate Conflict of Interest Review', status: 'Active', version: 'v3.0', lastUpdated: '2026-07-28', timesApplied: 189, severity: 'High' },
  { id: 'R-04', code: 'CONTRACT-EXP', name: 'Single-Source Expiration Alert', category: 'Contracts', conditions: 'IF Contract(Master) -> EXPIRES_IN <= 60 Days AND Supplier == SingleSource', conclusion: 'Generate Procurement Risk Warning', status: 'Active', version: 'v1.4', lastUpdated: '2026-06-10', timesApplied: 94, severity: 'Low' }
];

// ------------------------------------------
// 7. AUDIT LOGS DATASET
// ------------------------------------------
export const mockAuditLogs: AuditLog[] = [
  { id: 'AUD-991', timestamp: '2026-08-10 10:45:12', actor: 'System Engine', action: 'Proof Generated', object: 'PRF-1042 (ABC Industrial)', result: 'Success', ipAddress: '10.0.4.12' },
  { id: 'AUD-990', timestamp: '2026-08-10 10:42:00', actor: 'Alex Morgan', action: 'Investigation Started', object: 'INV-1042 (Supplier Sanctions)', result: 'Success', ipAddress: '192.168.1.45' },
  { id: 'AUD-989', timestamp: '2026-08-10 10:36:24', actor: 'System Engine', action: 'Entity Resolved', object: 'ENT-1024 (ABC Industrial)', result: 'Success', ipAddress: '10.0.4.12' },
  { id: 'AUD-988', timestamp: '2026-08-10 10:31:05', actor: 'Admin (Sarah J.)', action: 'Rule Updated', object: 'Rule AML-04 (v4.2)', result: 'Modified', ipAddress: '192.168.1.10' },
  { id: 'AUD-987', timestamp: '2026-08-10 10:27:18', actor: 'System Worker', action: 'Data Source Sync Completed', object: 'SRC-01 (PostgreSQL ERP)', result: 'Success', ipAddress: '10.0.8.99' },
  { id: 'AUD-986', timestamp: '2026-08-10 09:30:44', actor: 'Alex Morgan', action: 'Attestation Exported', object: 'PRF-2019 (Vertex UBO)', result: 'Success', ipAddress: '192.168.1.45' }
];

// ------------------------------------------
// 8. ANALYTICS DATASET
// ------------------------------------------
export const mockAnalytics: AnalyticsSummary = {
  totalInvestigations: 1248,
  completedInvestigations: 1102,
  underReviewInvestigations: 86,
  failedInvestigations: 60,
  investigationSuccessRate: '95.2%',
  ruleExecutionsTotal: 996,
  monthlyGrowthEntities: '+14.2%',
  monthlyGrowthRelationships: '+22.8%',
  riskTrendData: [
    { date: 'Jul 15', high: 28, medium: 45, low: 130 },
    { date: 'Jul 22', high: 32, medium: 48, low: 138 },
    { date: 'Jul 29', high: 30, medium: 52, low: 142 },
    { date: 'Aug 05', high: 35, medium: 54, low: 148 },
    { date: 'Aug 10', high: 37, medium: 56, low: 152 }
  ],
  ruleExecutionStats: [
    { ruleCode: 'AML-04', count: 482 },
    { ruleCode: 'SEC-OWNER', count: 231 },
    { ruleCode: 'CONFLICT-07', count: 189 },
    { ruleCode: 'CONTRACT-EXP', count: 94 }
  ]
};
