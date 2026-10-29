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
}

export interface EdgeSpec {
  from: string;
  to: string;
  flows: string;
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

export interface DesignResponse {
  id: string;
  intake_session_id: string;
  current_version: number;
  brief: RequirementBrief;
  spec: ArchitectureSpec;
  warnings: string[];
  flow_order: string[];
  prompt_version: string;
}

export interface CreateDesignRequest {
  session_id: string;
}

export interface IntakeTurnRequest {
  session_id: string | null;
  text: string;
}

export interface IntakeTurnResponse {
  status: "needs_info" | "ready";
  session_id: string;
  round: number;
  questions: string[];
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

