/**
 * Core domain types and API contract definitions for Arch-Nemesis.
 *
 * Backend Schema Sources:
 * - BriefConstraint, BriefNumber, RequirementBrief:
 *   apps/api/src/archnemesis/shared/brief.py:6-37
 * - NodeSpec, EdgeSpec, ConstraintSpec, ArchitectureSpec:
 *   apps/api/src/archnemesis/modules/validation/models.py:19-68
 * - IntakeTurnRequest, IntakeTurnResponse:
 *   apps/api/src/archnemesis/modules/intake/schemas.py:35-49
 * - CreateDesignRequest, DesignResponse:
 *   apps/api/src/archnemesis/modules/designs/schemas.py:9-29
 * - HealthData:
 *   apps/api/src/archnemesis/health.py:12-16
 * - ApiErrorPayload, ApiErrorEnvelope:
 *   apps/api/src/archnemesis/errors.py:140-148
 */

export interface BriefConstraint {
  id: string;
  text: string;
}

export interface BriefNumber {
  label: string;
  value: string;
  unit: string;
}

export interface RequirementBrief {
  summary: string;
  users: string;
  data_involved: string[];
  domain_hint: string;
  stated_constraints: BriefConstraint[];
  unverifiable_requirements: string[];
  numbers_given: BriefNumber[];
  assumptions: string[];
}

export interface NodeSpec {
  id: string;
  name: string;
  type: string;
  role: string;
  inputs: string[];
  outputs: string[];
  tech_options: string[];
  needs_model: boolean;
  ai_role?: "none" | "model" | "agent";
  tools?: string[];
  layer?: string | null;
}

export interface EdgeSpec {
  from: string;
  to: string;
  flows: string;
  condition?: string | null;
}

export interface ConstraintSpec {
  id: string;
  text: string;
  kind: string;
  node_id: string | null;
  a: string | null;
  b: string | null;
  covers: string[];
}

export interface ArchitectureSpec {
  nodes: NodeSpec[];
  edges: EdgeSpec[];
  constraints: ConstraintSpec[];
  entry_ids: string[];
  exit_ids: string[];
}

export interface FlowStep {
  step: number;
  node_id: string;
  node_name: string;
  text: string;
}

export interface PartExplanation {
  node_id: string;
  node_name: string;
  text: string;
}

export interface CheckExplanation {
  constraint_id: string;
  text: string;
}

export interface NodeReference {
  id: string;
  name: string;
}

export interface ModelUsageExplanation {
  nodes: NodeReference[];
  text: string;
}

export interface Explanation {
  overview: string;
  flow: FlowStep[];
  parts: PartExplanation[];
  checks: CheckExplanation[];
  models: ModelUsageExplanation;
  source: "llm" | "fallback";
}

export interface DesignResponse {
  id: string;
  intake_session_id: string;
  title: string;
  current_version: number;
  brief: RequirementBrief;
  spec: ArchitectureSpec;
  warnings: string[];
  flow_order: string[];
  prompt_version: string;
  explanation?: Explanation | null;
}

export interface CreateDesignRequest {
  session_id: string;
}

export interface IntakeQuestion {
  question: string;
  suggested_answer?: string | null;
  options?: string[];
}

export interface IntakeTurnRequest {
  session_id: string | null;
  text: string;
}

export interface IntakeTurnResponse {
  status: "needs_info" | "ready";
  session_id: string;
  round: number;
  questions: IntakeQuestion[];
  brief: RequirementBrief | null;
}

export interface HealthData {
  status: "ok" | "degraded";
  llm_configured: boolean;
  database: "ok" | "error";
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  issues?: string[];
}

export interface ApiErrorEnvelope {
  error: ApiErrorPayload;
}

/**
 * Max characters for lead note.
 * Matches backend `Settings.lead_note_max_chars` in `apps/api/src/archnemesis/settings.py:38`.
 */
export const LEAD_NOTE_MAX_CHARS = 500;

export interface CreateLeadRequest {
  design_id: string;
  version_no: number;
  name: string;
  email: string;
  note?: string | null;
  website?: string | null;
}

export interface CreateLeadResponse {
  status: "received";
}

export interface AdminLeadItem {
  id: string;
  created_at: string;
  name: string;
  email: string;
  note: string | null;
  design_id: string;
  version_no: number;
}

export interface AdminDesignVersionResponse {
  brief: RequirementBrief;
  spec: ArchitectureSpec;
  warnings: string[];
  flow_order: string[];
  explanation?: Explanation | null;
}

export interface HistoryEntry {
  design_id: string;
  title: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Phase 7 Refinement & Patch Types
// ---------------------------------------------------------------------------

// Mirrored from apps/api/src/archnemesis/settings.py:32
export const MAX_INPUT_CHARS = 4000;

// Mirrored from apps/api/src/archnemesis/modules/refinement/schemas.py:17
export const MAX_REFINEMENT_INPUT_CHARS = 1000;

// Mirrored from apps/api/src/archnemesis/settings.py:38
export const MAX_PATCH_OPS = 20;

// Mirrored from apps/api/src/archnemesis/settings.py:40
export const MAX_REFINEMENT_TURNS = 20;

// Mirrored from apps/api/src/archnemesis/settings.py:41
export const MAX_VERSIONS = 15;

/**
 * Diagnostic issue discovered during validation.
 * Backend source: apps/api/src/archnemesis/modules/validation/models.py:88-94
 */
export interface ValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  ids: string[];
}

/**
 * Field-level change descriptor for a modified node.
 * Backend source: apps/api/src/archnemesis/modules/validation/patch.py:137-144
 */
export interface NodeChange {
  id: string;
  changed_fields: string[];
}

/**
 * Added or removed edge descriptor.
 * Backend source: apps/api/src/archnemesis/modules/validation/patch.py:146-155
 */
export interface EdgeDiff {
  from_node?: string;
  from?: string;
  to: string;
  flows: string;
  condition?: string | null;
}

/**
 * Field-level change descriptor for a modified edge.
 * Backend source: apps/api/src/archnemesis/modules/validation/patch.py:157-165
 */
export interface EdgeChange {
  from_node?: string;
  from?: string;
  to: string;
  changed_fields: string[];
}

/**
 * Field-level change descriptor for a modified constraint.
 * Backend source: apps/api/src/archnemesis/modules/validation/patch.py:167-174
 */
export interface ConstraintChange {
  id: string;
  changed_fields: string[];
}

/**
 * Deterministic structural diff between two ArchitectureSpecs.
 * Backend source: apps/api/src/archnemesis/modules/validation/patch.py:176-192
 */
export interface DiffResult {
  added_nodes: string[];
  removed_nodes: string[];
  changed_nodes: NodeChange[];
  added_edges: EdgeDiff[];
  removed_edges: EdgeDiff[];
  changed_edges: EdgeChange[];
  added_constraints: string[];
  removed_constraints: string[];
  changed_constraints: ConstraintChange[];
  entry_changed: boolean;
  exit_changed: boolean;
}

export type PatchStatus =
  | "proposed"
  | "blocked"
  | "needs_confirmation"
  | "accepted"
  | "rejected"
  | "superseded"
  | "discarded";

/**
 * Candidate patch evaluation summary.
 * Backend source: apps/api/src/archnemesis/modules/refinement/schemas.py:20-30
 */
export interface PatchSummary {
  id: string;
  status: PatchStatus;
  diff: DiffResult | null;
  issues: ValidationIssue[];
  ops_count: number;
  preview_spec: ArchitectureSpec | null;
}

/**
 * Refinement conversational chat response.
 * Backend source: apps/api/src/archnemesis/modules/refinement/schemas.py:32-40
 */
export interface ChatResponse {
  message_id: string;
  reply: string;
  patch: PatchSummary | null;
}

/**
 * Refined architecture design returned by refinement mutations and version endpoints.
 * Backend source: apps/api/src/archnemesis/modules/refinement/schemas.py:136-149
 */
export interface RefinedDesignResponse {
  id: string;
  intake_session_id: string;
  current_version: number;
  brief: RequirementBrief;
  spec: ArchitectureSpec;
  warnings: string[];
  flow_order: string[];
  prompt_version: string;
  explanation: Explanation | null;
}

/**
 * Reject patch response.
 * Backend source: apps/api/src/archnemesis/modules/refinement/schemas.py:100-107
 */
export interface RejectPatchResponse {
  id: string;
  status: string;
}

/**
 * Chat conversation message history item.
 * Backend source: apps/api/src/archnemesis/modules/refinement/schemas.py:118-126
 */
export interface ChatMessageItem {
  id: string;
  role: string;
  text: string;
  created_at: string;
}

/**
 * Chat conversation history list response.
 * Backend source: apps/api/src/archnemesis/modules/refinement/schemas.py:128-134
 */
export interface MessagesResponse {
  messages: ChatMessageItem[];
  turns_used: number;
  max_turns: number;
}

/**
 * Version summary item for version history list.
 * Backend source: apps/api/src/archnemesis/modules/refinement/schemas.py:151-158
 */
export interface VersionSummaryItem {
  version_no: number;
  created_at: string;
  change_note: string | null;
}

/**
 * Versions list response (newest first).
 * Backend source: apps/api/src/archnemesis/modules/refinement/schemas.py:160-167
 */
export interface VersionsResponse {
  versions: VersionSummaryItem[];
}

/**
 * Single validated suggestion exposed to the client.
 * Backend source: apps/api/src/archnemesis/modules/refinement/schemas.py:71-82
 */
export interface SuggestionItemResponse {
  patch_id: string;
  title: string;
  reason: string;
  status: PatchStatus;
  diff: DiffResult | null;
  preview_spec?: ArchitectureSpec | null;
  issues?: ValidationIssue[];
}

/**
 * Suggestions list response with discarded counter.
 * Backend source: apps/api/src/archnemesis/modules/refinement/schemas.py:84-91
 */
export interface SuggestionsResponse {
  suggestions: SuggestionItemResponse[];
  discarded_count: number;
  discarded_issue_codes?: string[][];
}

// ---------------------------------------------------------------------------
// Union Graph Types (Pure Client Diff)
// ---------------------------------------------------------------------------

export type DiffStatus = "unchanged" | "added" | "removed" | "edited";

export interface UnionNodeSpec extends NodeSpec {
  diffStatus: DiffStatus;
}

export interface UnionEdgeSpec extends EdgeSpec {
  diffStatus: DiffStatus;
}

export interface UnionArchitectureSpec extends ArchitectureSpec {
  nodes: UnionNodeSpec[];
  edges: UnionEdgeSpec[];
}




