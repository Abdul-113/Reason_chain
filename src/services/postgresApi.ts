/**
 * PostgreSQL & Relational Database API Client
 * Provides communication with the backend PostgreSQL routes for live database status,
 * table schema & row exploration, relationship claims, and import batch metadata.
 */

const API_BASE_URL = 'http://localhost:8000';

export interface PostgresTableInfo {
  table_name: string;
  row_count: number;
}

export interface ImportBatchInfo {
  batch_id: string;
  source_system: string;
  source_path: string;
  schema_version: string;
  content_hash: string;
  imported_at: string;
  record_counts: {
    company_links_resolved?: number;
    company_links_unresolved?: number;
    companies_created?: number;
    external_companies?: number;
    people?: number;
    suppliers?: number;
    contracts?: number;
    sanctions?: number;
    relationships?: number;
    [key: string]: any;
  };
  is_synthetic: number | boolean;
  is_authoritative: number | boolean;
  status: string;
}

export interface PostgresStatusResponse {
  success: boolean;
  connected: boolean;
  engine: string;
  database_name: string;
  host_display: string;
  total_tables: number;
  tables: PostgresTableInfo[];
  total_entities: number;
  entity_breakdown: {
    companies?: number;
    external_companies?: number;
    people?: number;
    suppliers?: number;
    [key: string]: any;
  };
  total_relationship_claims: number;
  company_links_resolved: number;
  company_links_unresolved: number;
  latest_import_batch: ImportBatchInfo | null;
  is_synthetic: boolean;
  warning: string;
  error?: string;
}

export interface TableRowsResponse {
  success?: boolean;
  table_name: string;
  columns: { name: string; type: string }[];
  total_rows: number;
  page: number;
  page_size: number;
  total_pages: number;
  rows: Record<string, any>[];
  error?: string;
}

export interface RelationshipClaimRecord {
  relationship_id: string;
  import_batch_id: string;
  relationship_type: string;
  from_entity_id: string;
  from_entity_type: string;
  to_entity_id: string;
  to_entity_type: string;
  from_label?: string;
  to_label?: string;
  from_cin?: string | null;
  to_cin?: string | null;
  from_source_key?: string | null;
  to_source_key?: string | null;
  role?: string | null;
  ownership_percentage?: number | null;
  affiliation_reason?: string | null;
  reason?: string | null;
  contract_id?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  active: number | boolean;
  confidence: number;
  is_synthetic: number | boolean;
  validation_status: string;
  raw_payload: Record<string, any>;
}

export interface RelationshipsResponse {
  success?: boolean;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  claims: RelationshipClaimRecord[];
  is_synthetic: boolean;
  warning: string;
}

/**
 * Fetch real PostgreSQL database status and row counts
 */
export async function getPostgresStatus(): Promise<PostgresStatusResponse> {
  const res = await fetch(`${API_BASE_URL}/api/postgres/status`);
  if (!res.ok) {
    throw new Error(`Failed to fetch PostgreSQL status: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch list of tables and counts
 */
export async function getPostgresTables(): Promise<{ success: boolean; total_tables: number; tables: PostgresTableInfo[] }> {
  const res = await fetch(`${API_BASE_URL}/api/postgres/tables`);
  if (!res.ok) {
    throw new Error(`Failed to fetch PostgreSQL tables: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch paginated rows from a specific table with optional search
 */
export async function getPostgresTableRows(
  tableName: string,
  page: number = 1,
  limit: number = 25,
  search?: string
): Promise<TableRowsResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: limit.toString(),
  });
  if (search && search.trim()) {
    params.append('search', search.trim());
  }

  const res = await fetch(`${API_BASE_URL}/api/postgres/table/${encodeURIComponent(tableName)}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch rows for table ${tableName}: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch paginated relationship claims
 */
export async function getPostgresRelationships(
  page: number = 1,
  limit: number = 25,
  typeFilter?: string,
  search?: string
): Promise<RelationshipsResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: limit.toString(),
  });
  if (typeFilter && typeFilter !== 'ALL') {
    params.append('relationship_type', typeFilter);
  }
  if (search && search.trim()) {
    params.append('search', search.trim());
  }

  const res = await fetch(`${API_BASE_URL}/api/postgres/relationships?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch relationship claims: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Trigger controlled replacement import
 */
export async function triggerReplaceImport(filePath?: string): Promise<{ success: boolean; message: string; batch_id: string; counts: any }> {
  const res = await fetch(`${API_BASE_URL}/api/postgres/replace-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to trigger replacement import: ${res.statusText}`);
  }
  return res.json();
}
