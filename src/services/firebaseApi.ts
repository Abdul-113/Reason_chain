/**
 * ReasonChain Frontend API Client — Firebase Realtime Database
 * Interfaces and client functions for interacting with real server-side Firebase backend endpoints.
 * Never handles or exposes client credentials; all auth is server-side.
 */

const API_BASE_URL = 'http://localhost:8000/api/firebase';

// ==========================================
// TYPE DEFINITIONS (Mirroring FastAPI Schemas)
// ==========================================

export interface FirebaseStatusResponse {
  status: 'ready' | 'unconfigured' | string;
  is_configured: boolean;
  database_url: string | null;
  project_id: string | null;
  service_account_found: boolean;
}

export interface FirebaseConnectionResponse {
  success: boolean;
  message: string;
  database_url: string;
  collections: string[];
  total_collections: number;
}

export interface FirebasePathInfo {
  path: string;
  name: string;
  record_count: number;
  is_synthetic?: boolean;
  description?: string;
}

export interface DatasetSelectionItem {
  dataset_id: string;
  logical_name?: string;
  physical_identifier: string;
  record_estimate?: number;
  is_synthetic?: boolean;
  included: boolean;
  description?: string;
}

export interface FirebaseSourceConfigResponse {
  success: boolean;
  source_id: string;
  source_type: string;
  display_name: string;
  total_datasets_discovered: number;
  selected_datasets_count: number;
  datasets: DatasetSelectionItem[];
  message: string;
}

export interface FirebasePathsResponse {
  paths: FirebasePathInfo[];
  total_paths: number;
  total_records: number;
}

export interface FirebaseSampleResponse {
  path: string;
  sample_count: number;
  fields: string[];
  sample_records: Record<string, unknown>[];
}

export interface FirebaseConfigRequest {
  database_url?: string;
  service_account_path?: string;
}

// ==========================================
// DATA PROFILER TYPE DEFINITIONS
// ==========================================

export interface FirebaseProfileRequest {
  paths?: string[];
  sample_limit?: number;
  max_depth?: number;
  max_fields?: number;
  cross_validate_references?: boolean;
}

export interface FirebaseFieldProfile {
  field_path: string;
  observed_types: string[];
  presence_count: number;
  null_count: number;
  missing_count: number;
  total_sampled: number;
  presence_ratio: number;
  is_nested: boolean;
  is_array: boolean;
  array_item_types?: string[] | null;
  candidate_identifier: boolean;
  identifier_reason?: string | null;
  candidate_reference: boolean;
  reference_reason?: string | null;
  candidate_temporal: boolean;
  temporal_reason?: string | null;
  temporal_format?: string | null;
  sample_values: unknown[];
  unique_value_count: number;
}

export interface FirebaseReferenceCandidate {
  source_path: string;
  source_field: string;
  target_path?: string | null;
  reason: string;
  match_rate?: number | null;
  sampled_matches?: number | null;
  sampled_total?: number | null;
}

export interface FirebaseBranchProfile {
  path: string;
  name: string;
  exists: boolean;
  approx_child_count: number;
  sample_size: number;
  is_collection_like: boolean;
  is_object_like: boolean;
  is_primitive_like: boolean;
  has_nested_children: boolean;
  has_arrays: boolean;
  fields: FirebaseFieldProfile[];
  candidate_identifiers: string[];
  candidate_references: string[];
  candidate_temporal_fields: string[];
  reference_cross_checks: FirebaseReferenceCandidate[];
  warnings: string[];
}

export interface FirebaseDataProfileResponse {
  success: boolean;
  database_url: string | null;
  project_id: string | null;
  profiled_at: string;
  config_limits: {
    sample_limit?: number;
    max_depth?: number;
    max_fields?: number;
    cross_validate_references?: boolean;
  };
  total_branches_profiled: number;
  branches: FirebaseBranchProfile[];
  global_reference_candidates: FirebaseReferenceCandidate[];
  human_readable_summary: string;
}

// ==========================================
// API CLIENT FUNCTIONS
// ==========================================

/**
 * Fetch status and configuration of Firebase connector on the backend.
 */
export async function getFirebaseStatus(): Promise<FirebaseStatusResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/status`);
    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }
    return await res.json();
  } catch {
    return {
      status: 'error',
      is_configured: false,
      database_url: null,
      project_id: null,
      service_account_found: false,
    };
  }
}

/**
 * Test server-side Firebase connection using existing environment credentials.
 */
export async function testFirebaseServerConnection(): Promise<FirebaseConnectionResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/test-server-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server returned HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Firebase connection failed';
    return {
      success: false,
      message,
      database_url: '',
      collections: [],
      total_collections: 0,
    };
  }
}

/**
 * Discover root collections/paths in Firebase Realtime Database with record counts.
 */
export async function getFirebasePaths(): Promise<FirebasePathsResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/paths`);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server returned HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve database structure';
    throw new Error(message);
  }
}

/**
 * Fetch bounded sample records and schema from a specific Firebase Realtime Database path.
 */
export async function getFirebaseSample(
  collectionName: string,
  limit: number = 10
): Promise<FirebaseSampleResponse> {
  try {
    const cleanName = collectionName.replace(/^\/+/, '');
    const res = await fetch(`${API_BASE_URL}/sample/${encodeURIComponent(cleanName)}?limit=${limit}`);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server returned HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch sample records';
    throw new Error(message);
  }
}

/**
 * Execute safe, bounded data profiling on selected Firebase paths.
 */
export async function profileFirebaseData(
  request: FirebaseProfileRequest = {}
): Promise<FirebaseDataProfileResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server returned HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to profile Firebase data';
    throw new Error(message);
  }
}

// ==========================================
// ENTITY MAPPER TYPE DEFINITIONS
// ==========================================

export interface FirebaseMappingRequest {
  path?: string;
  limit?: number;
  include_relationships?: boolean;
  include_nested_entities?: boolean;
}

export interface FirebaseMappedEntitySummary {
  canonical_id: string;
  entity_type: string;
  display_name: string;
  properties: Record<string, unknown>;
  source_system: string;
  source_path?: string | null;
  mapping_confidence: number;
}

export interface FirebaseMappedRelationshipSummary {
  relationship_id: string;
  relationship_type: string;
  source_entity_id: string;
  target_entity_id: string;
  source_entity_type: string;
  target_entity_type: string;
  properties: Record<string, unknown>;
}

export interface FirebaseMappingResponse {
  success: boolean;
  path: string;
  total_records_processed: number;
  total_entities: number;
  total_relationships: number;
  entity_type_counts: Record<string, number>;
  relationship_type_counts: Record<string, number>;
  provenance_summary: {
    source?: string;
    source_path?: string;
    mapping_started_at?: string;
    mapping_completed_at?: string;
  };
  entities: FirebaseMappedEntitySummary[];
  relationships: FirebaseMappedRelationshipSummary[];
  mapping_duration_ms: number;
}

/**
 * Execute mapping of Firebase records into Canonical ReasonChain entities and relationships.
 */
export async function mapFirebaseData(
  request: FirebaseMappingRequest = {}
): Promise<FirebaseMappingResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server returned HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to map Firebase data to entities';
    throw new Error(message);
  }
}

/**
 * Quick preview of entity mapping results for a small sample of a collection.
 */
export async function previewFirebaseMapping(
  collectionName: string,
  limit: number = 5
): Promise<FirebaseMappingResponse> {
  try {
    const cleanName = collectionName.replace(/^\/+/, '');
    const res = await fetch(`${API_BASE_URL}/map/preview/${encodeURIComponent(cleanName)}?limit=${limit}`);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server returned HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to preview entity mapping';
    throw new Error(message);
  }
}

/**
 * Fetch current multi-dataset source configuration from backend.
 */
export async function getFirebaseSourceConfig(): Promise<FirebaseSourceConfigResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/source-config`);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server returned HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve source configuration';
    throw new Error(message);
  }
}

/**
 * Save multi-dataset selection under one Firebase source.
 */
export async function saveFirebaseSourceConfig(
  datasets: DatasetSelectionItem[]
): Promise<FirebaseSourceConfigResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/source-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_id: 'firebase_rtdb',
        source_type: 'firebase',
        display_name: 'Firebase Realtime Database',
        datasets,
      }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server returned HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save source configuration';
    throw new Error(message);
  }
}


