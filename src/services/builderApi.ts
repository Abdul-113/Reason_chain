/**
 * Knowledge Graph Builder API Service
 * Handles data source inspection, asynchronous build jobs, live stage tracking,
 * build summaries, and build history querying.
 */

export interface DatasetInfo {
  name: string;
  record_count: number;
  type: string;
}

export interface DataSourceInfo {
  source_id: string;
  name: string;
  type: string;
  status: 'connected' | 'disconnected';
  is_connected: boolean;
  connection_message: string;
  connection_time_ms: number;
  datasets: DatasetInfo[];
  total_records: number;
  primary_dataset: string;
  role: string;
  last_build_at: string | null;
}

export interface BuildStage {
  stage_id: string;
  name: string;
  group: 'firebase' | 'postgres' | 'shared';
  status: 'pending' | 'running' | 'completed' | 'completed_with_warnings' | 'failed';
  records_processed: number;
  records_total: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number;
  message: string;
  warnings: string[];
  errors: string[];
}

export interface BuildJobCounts {
  firebase_records_extracted: number;
  postgres_records_extracted: number;
  canonical_entities_count: number;
  canonical_relationships_count: number;
  resolved_companies_count: number;
  unresolved_companies_count: number;
  verified_relationships_count: number;
  unresolved_relationships_count: number;
  synthetic_relationships_count: number;
  neo4j_nodes_written: number;
  neo4j_edges_written: number;
  neo4j_available: boolean;
}

export interface BuildJob {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'completed_with_warnings' | 'failed';
  selected_databases: string[];
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number;
  stages: Record<string, BuildStage>;
  counts: BuildJobCounts;
  neo4j_verification_notes: string;
  error_message: string | null;
}

export interface ResolutionDecision {
  source_entity_id: string;
  source_name: string;
  source_identifier: string;
  matched_canonical_id: string | null;
  matched_name: string | null;
  match_method: string;
  confidence: number;
  status: string;
  reason: string;
}

export interface BuildSummary extends BuildJob {
  resolution_decisions: ResolutionDecision[];
  unresolved_entities: Array<Record<string, any>>;
}

const API_BASE = 'http://localhost:8000/api/v1/builder';

export async function getBuilderSources(): Promise<{ sources: DataSourceInfo[]; active_job_id: string | null }> {
  const res = await fetch(`${API_BASE}/sources`);
  if (!res.ok) {
    throw new Error(`Failed to fetch builder sources: ${res.statusText}`);
  }
  return res.json();
}

export async function startBuildJob(
  selected_databases: string[],
  firebase_limit = 100,
  mode: 'cross_source' | 'standalone_master' = 'cross_source'
): Promise<{ job: BuildJob }> {
  const res = await fetch(`${API_BASE}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selected_databases, firebase_limit, mode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to start build');
  }
  return res.json();
}

export async function getJobProgress(job_id: string): Promise<{ job: BuildJob }> {
  const res = await fetch(`${API_BASE}/job/${job_id}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch job progress: ${res.statusText}`);
  }
  return res.json();
}

export async function getJobSummary(job_id: string): Promise<{ summary: BuildSummary }> {
  const res = await fetch(`${API_BASE}/job/${job_id}/summary`);
  if (!res.ok) {
    throw new Error(`Failed to fetch job summary: ${res.statusText}`);
  }
  return res.json();
}

export async function getBuildHistory(): Promise<{ total_jobs: number; jobs: BuildJob[] }> {
  const res = await fetch(`${API_BASE}/history`);
  if (!res.ok) {
    throw new Error(`Failed to fetch build history: ${res.statusText}`);
  }
  return res.json();
}

export async function retryBuildJob(job_id: string): Promise<{ job: BuildJob }> {
  const res = await fetch(`${API_BASE}/job/${job_id}/retry`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error(`Failed to retry build job: ${res.statusText}`);
  }
  return res.json();
}

export async function getBuilderProfiling(sources?: string[]): Promise<any> {
  const query = sources ? `?sources=${sources.join(',')}` : '';
  const res = await fetch(`${API_BASE}/profile${query}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch profiling data: ${res.statusText}`);
  }
  return res.json();
}

export async function getBuilderMappingPreview(sources?: string[]): Promise<any> {
  const query = sources ? `?sources=${sources.join(',')}` : '';
  const res = await fetch(`${API_BASE}/mapping-preview${query}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch mapping preview: ${res.statusText}`);
  }
  return res.json();
}

export async function getBuilderResolutionPreview(sources?: string[]): Promise<any> {
  const query = sources ? `?sources=${sources.join(',')}` : '';
  const res = await fetch(`${API_BASE}/resolution-preview${query}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch resolution preview: ${res.statusText}`);
  }
  return res.json();
}

export async function getBuilderIntegrationPreview(sources?: string[]): Promise<any> {
  const query = sources ? `?sources=${sources.join(',')}` : '';
  const res = await fetch(`${API_BASE}/integration-preview${query}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch integration preview: ${res.statusText}`);
  }
  return res.json();
}

