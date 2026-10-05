/**
 * ReasonChain Frontend API Client — AI-Assisted Semantic Mapping & Governance
 * Communicates with backend /api/mapping endpoints.
 * Never handles or exposes API keys or secrets; all AI calls are server-side.
 */

const API_BASE_URL = 'http://localhost:8000/api/mapping';

export interface MappingStatusResponse {
  configured: boolean;
  provider: string | null;
  model: string | null;
  prompt_version: string | null;
  base_url: string | null;
  message: string;
}

export interface TransformationRule {
  transform_type: 'direct' | 'lowercase' | 'uppercase' | 'strip' | 'parse_int' | 'parse_float' | 'parse_date_iso' | string;
  params?: Record<string, unknown>;
  default_value?: unknown;
}

export interface FieldMappingRule {
  source_field: string;
  target_property: string;
  transformation?: TransformationRule;
  required?: boolean;
  confidence: number;
}

export interface EntityMappingRule {
  target_entity_category: string;
  identifier_field: string;
  id_namespace?: string | null;
  display_name_field?: string | null;
  default_display_name?: string | null;
  field_mappings: FieldMappingRule[];
  confidence: number;
}

export interface RelationshipMappingRule {
  target_relationship_type: string;
  source_entity_ref: string;
  source_entity_type?: string;
  target_entity_ref: string;
  target_entity_type?: string;
  generate_target_entity?: boolean;
  target_entity_category?: string | null;
  target_entity_name_field?: string | null;
  field_mappings?: FieldMappingRule[];
  confidence: number;
  condition_field?: string | null;
}

export interface MappingSpecification {
  mapping_id: string;
  dataset_id: string;
  description?: string | null;
  target_entities: EntityMappingRule[];
  target_relationships: RelationshipMappingRule[];
  origin: 'deterministic' | 'user_defined' | 'ai_proposed';
  validation_status: 'valid' | 'invalid' | 'warning' | 'unvalidated';
  approval_status: 'approved' | 'pending' | 'rejected';
  confidence: number;
  validation_messages: string[];
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export interface FieldAmbiguity {
  field_path: string;
  candidate_interpretations: string[];
  selected_interpretation?: string | null;
  evidence: string;
  confidence: number;
}

export interface MappingProposalResponse {
  proposal_id: string;
  source_id: string;
  dataset_id: string;
  proposed_specification?: MappingSpecification | null;
  rationale: string;
  ambiguities: FieldAmbiguity[];
  warnings: string[];
  provider_metadata: Record<string, unknown>;
  ai_confidence: number;
  system_validation_confidence: number;
  generated_at: string;
  error?: string | null;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  field_or_target: string;
  message: string;
}

export interface ValidationReport {
  status: 'valid' | 'invalid' | 'warning' | 'unvalidated';
  issues: ValidationIssue[];
  validation_score: number;
  verified_fields: string[];
  unverified_fields: string[];
}

export interface ProposalSummary {
  proposal_id: string;
  source_id: string;
  dataset_id: string;
  generated_at: string;
  has_specification: boolean;
  origin?: string | null;
  validation_status?: string | null;
  approval_status?: string | null;
  ai_confidence: number;
  system_validation_confidence: number;
  ambiguities_count: number;
  error?: string | null;
}

export interface ProposeMappingRequest {
  source_id: string;
  dataset_id: string;
  sample_limit?: number;
  constraints?: Record<string, unknown>;
}

export interface ReviewDecisionRequest {
  reviewer_id?: string;
  notes?: string;
}

// ==========================================
// API CLIENT FUNCTIONS
// ==========================================

export async function getMappingStatus(): Promise<MappingStatusResponse> {
  const res = await fetch(`${API_BASE_URL}/status`);
  if (!res.ok) {
    throw new Error(`Failed to fetch AI mapping status: ${res.statusText}`);
  }
  return res.json();
}

export async function proposeMapping(req: ProposeMappingRequest): Promise<MappingProposalResponse> {
  const res = await fetch(`${API_BASE_URL}/propose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to propose mapping: ${res.statusText}`);
  }
  return res.json();
}

export async function listProposals(): Promise<ProposalSummary[]> {
  const res = await fetch(`${API_BASE_URL}/proposals`);
  if (!res.ok) {
    throw new Error(`Failed to list mapping proposals: ${res.statusText}`);
  }
  return res.json();
}

export async function getProposal(proposalId: string): Promise<MappingProposalResponse> {
  const res = await fetch(`${API_BASE_URL}/proposals/${encodeURIComponent(proposalId)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch proposal ${proposalId}: ${res.statusText}`);
  }
  return res.json();
}

export async function getValidationReport(proposalId: string): Promise<ValidationReport> {
  const res = await fetch(`${API_BASE_URL}/proposals/${encodeURIComponent(proposalId)}/validation`);
  if (!res.ok) {
    throw new Error(`Failed to get validation report: ${res.statusText}`);
  }
  return res.json();
}

export async function validateProposal(proposalId: string): Promise<ValidationReport> {
  const res = await fetch(`${API_BASE_URL}/validate/${encodeURIComponent(proposalId)}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to validate proposal: ${res.statusText}`);
  }
  return res.json();
}

export async function approveProposal(
  proposalId: string,
  reviewerId: string = 'human_operator',
  notes?: string
): Promise<MappingSpecification> {
  const res = await fetch(`${API_BASE_URL}/approve/${encodeURIComponent(proposalId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewer_id: reviewerId, notes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to approve proposal: ${res.statusText}`);
  }
  return res.json();
}

export async function rejectProposal(
  proposalId: string,
  reviewerId: string = 'human_operator',
  notes?: string
): Promise<MappingSpecification> {
  const res = await fetch(`${API_BASE_URL}/reject/${encodeURIComponent(proposalId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewer_id: reviewerId, notes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to reject proposal: ${res.statusText}`);
  }
  return res.json();
}
