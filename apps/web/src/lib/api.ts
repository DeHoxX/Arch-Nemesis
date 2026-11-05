import { z } from "zod";
import type {
  AdminDesignVersionResponse,
  AdminLeadItem,
  ChatResponse,
  CreateDesignRequest,
  CreateLeadRequest,
  CreateLeadResponse,
  DesignResponse,
  DiffResult,
  Explanation,
  HealthData,
  IntakeTurnRequest,
  IntakeTurnResponse,
  MessagesResponse,
  PatchSummary,
  RefinedDesignResponse,
  RejectPatchResponse,
  ValidationIssue,
  VersionsResponse,
  SuggestionItemResponse,
  SuggestionsResponse,
} from "./types";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly issues?: string[];
  readonly retryAfter?: number;

  constructor(
    message: string,
    code: string,
    status: number,
    issues?: string[],
    retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.issues = issues;
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// Zod schemas mirroring backend validation and data contracts

export const healthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  llm_configured: z.boolean(),
  database: z.enum(["ok", "error"]),
});

export const briefConstraintSchema = z.object({
  id: z.string(),
  text: z.string(),
});

export const briefNumberSchema = z.object({
  label: z.string(),
  value: z.string(),
  unit: z.string(),
});

export const requirementBriefSchema = z.object({
  summary: z.string(),
  users: z.string(),
  data_involved: z.array(z.string()).default([]),
  domain_hint: z.string().default(""),
  stated_constraints: z.array(briefConstraintSchema).default([]),
  unverifiable_requirements: z.array(z.string()).default([]),
  numbers_given: z.array(briefNumberSchema).default([]),
  assumptions: z.array(z.string()).default([]),
});

export const intakeTurnResponseSchema = z.object({
  status: z.enum(["needs_info", "ready"]),
  session_id: z.string(),
  round: z.number(),
  questions: z.array(z.string()).default([]),
  brief: requirementBriefSchema.nullable().default(null),
});

export const nodeSpecSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  name: z.string(),
  type: z.string(),
  role: z.string(),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  tech_options: z.array(z.string()).default([]),
  needs_model: z.boolean().default(false),
  ai_role: z.enum(["none", "model", "agent"]).default("none").optional(),
  tools: z.array(z.string()).default([]).optional(),
});

export const edgeSpecSchema = z.object({
  from: z.string(),
  to: z.string(),
  flows: z.string(),
  condition: z.string().nullable().optional(),
});

export const constraintSpecSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: z.string(),
  node_id: z.string().nullable().default(null),
  a: z.string().nullable().default(null),
  b: z.string().nullable().default(null),
  covers: z.array(z.string()).default([]),
});

export const architectureSpecSchema = z.object({
  nodes: z.array(nodeSpecSchema).default([]),
  edges: z.array(edgeSpecSchema).default([]),
  constraints: z.array(constraintSpecSchema).default([]),
  entry_ids: z.array(z.string()).default([]),
  exit_ids: z.array(z.string()).default([]),
});

export const flowStepSchema = z.object({
  step: z.number(),
  node_id: z.string(),
  node_name: z.string(),
  text: z.string(),
});

export const partExplanationSchema = z.object({
  node_id: z.string(),
  node_name: z.string(),
  text: z.string(),
});

export const checkExplanationSchema = z.object({
  constraint_id: z.string(),
  text: z.string(),
});

export const nodeReferenceSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const modelUsageExplanationSchema = z.object({
  nodes: z.array(nodeReferenceSchema).default([]),
  text: z.string(),
});

export const explanationSchema = z.object({
  overview: z.string(),
  flow: z.array(flowStepSchema),
  parts: z.array(partExplanationSchema),
  checks: z.array(checkExplanationSchema),
  models: modelUsageExplanationSchema,
  source: z.enum(["llm", "fallback"]),
});

export const designResponseSchema = z.object({
  id: z.string(),
  intake_session_id: z.string(),
  current_version: z.number(),
  brief: requirementBriefSchema,
  spec: architectureSpecSchema,
  warnings: z.array(z.string()).default([]),
  flow_order: z.array(z.string()),
  prompt_version: z.string(),
  explanation: explanationSchema.nullable().optional(),
});

export const apiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z.array(z.string()).optional(),
  }),
});

export const createLeadResponseSchema = z.object({
  status: z.literal("received"),
});

export const adminLeadItemSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  name: z.string(),
  email: z.string(),
  note: z.string().nullable(),
  design_id: z.string(),
  version_no: z.number(),
});

export const adminLeadsListSchema = z.array(adminLeadItemSchema);

export const adminDesignVersionResponseSchema = z.object({
  brief: requirementBriefSchema,
  spec: architectureSpecSchema,
  warnings: z.array(z.string()).default([]),
  flow_order: z.array(z.string()),
  explanation: explanationSchema.nullable().optional(),
});

export const historyEntrySchema = z.object({
  design_id: z.string(),
  title: z.string(),
  created_at: z.string(),
});

// ---------------------------------------------------------------------------
// Phase 7 Refinement & Patch Schemas
// ---------------------------------------------------------------------------

/**
 * Diagnostic issue discovered during validation.
 * Backend source: apps/api/src/archnemesis/modules/validation/models.py:88-94
 */
export const validationIssueSchema: z.ZodType<ValidationIssue> = z.object({
  code: z.string(),
  severity: z.enum(["error", "warning"]),
  message: z.string(),
  ids: z.array(z.string()).default([]),
});

export const nodeChangeSchema = z.object({
  id: z.string(),
  changed_fields: z.array(z.string()),
});

/**
 * Added or removed edge descriptor.
 * Backend source: apps/api/src/archnemesis/modules/validation/patch.py:146-155
 * Supports both "from_node" (backend field name) and "from" for flexibility.
 */
export const edgeDiffSchema = z.object({
  from_node: z.string().optional(),
  from: z.string().optional(),
  to: z.string(),
  flows: z.string().default(""),
  condition: z.string().nullable().default(null).optional(),
});

export const edgeChangeSchema = z.object({
  from_node: z.string().optional(),
  from: z.string().optional(),
  to: z.string(),
  changed_fields: z.array(z.string()),
});

export const constraintChangeSchema = z.object({
  id: z.string(),
  changed_fields: z.array(z.string()),
});

export const diffResultSchema: z.ZodType<DiffResult> = z.object({
  added_nodes: z.array(z.string()).default([]),
  removed_nodes: z.array(z.string()).default([]),
  changed_nodes: z.array(nodeChangeSchema).default([]),
  added_edges: z.array(edgeDiffSchema).default([]),
  removed_edges: z.array(edgeDiffSchema).default([]),
  changed_edges: z.array(edgeChangeSchema).default([]),
  added_constraints: z.array(z.string()).default([]),
  removed_constraints: z.array(z.string()).default([]),
  changed_constraints: z.array(constraintChangeSchema).default([]),
  entry_changed: z.boolean().default(false),
  exit_changed: z.boolean().default(false),
});

export const patchStatusSchema = z.enum([
  "proposed",
  "blocked",
  "needs_confirmation",
  "accepted",
  "rejected",
  "superseded",
]);

export const patchSummarySchema: z.ZodType<PatchSummary> = z.object({
  id: z.string(),
  status: patchStatusSchema,
  diff: diffResultSchema.nullable().default(null),
  issues: z.array(validationIssueSchema).default([]),
  ops_count: z.number().default(0),
  preview_spec: architectureSpecSchema.nullable().default(null).optional().transform((v) => v ?? null),
});

export const chatResponseSchema: z.ZodType<ChatResponse> = z.object({
  message_id: z.string(),
  reply: z.string(),
  patch: patchSummarySchema.nullable().default(null),
});

export const refinedDesignResponseSchema: z.ZodType<RefinedDesignResponse> = z.object({
  id: z.string(),
  intake_session_id: z.string(),
  current_version: z.number(),
  brief: requirementBriefSchema,
  spec: architectureSpecSchema,
  warnings: z.array(z.string()).default([]),
  flow_order: z.array(z.string()).default([]),
  prompt_version: z.string(),
  explanation: explanationSchema.nullable().default(null).optional().transform((v) => v ?? null),
});

export const rejectPatchResponseSchema: z.ZodType<RejectPatchResponse> = z.object({
  id: z.string(),
  status: z.string().default("rejected"),
});

export const chatMessageItemSchema = z.object({
  id: z.string(),
  role: z.string(),
  text: z.string(),
  created_at: z.string(),
});

export const messagesResponseSchema: z.ZodType<MessagesResponse> = z.object({
  messages: z.array(chatMessageItemSchema).default([]),
});

export const versionSummaryItemSchema = z.object({
  version_no: z.number(),
  created_at: z.string(),
  change_note: z.string().nullable().default(null),
});

export const versionsResponseSchema: z.ZodType<VersionsResponse> = z.object({
  versions: z.array(versionSummaryItemSchema).default([]),
});

export const suggestionItemResponseSchema: z.ZodType<SuggestionItemResponse> = z.object({
  patch_id: z.string(),
  title: z.string(),
  reason: z.string(),
  status: patchStatusSchema,
  diff: diffResultSchema.nullable().default(null),
  preview_spec: architectureSpecSchema.nullable().default(null).optional().transform((v) => v ?? null),
  issues: z.array(validationIssueSchema).default([]),
});

export const suggestionsResponseSchema: z.ZodType<SuggestionsResponse> = z.object({
  suggestions: z.array(suggestionItemResponseSchema).default([]),
  discarded_count: z.number().default(0),
  discarded_issue_codes: z.array(z.array(z.string())).default([]),
});

export const historyListSchema = z.array(historyEntrySchema);

async function parseErrorResponse(res: Response): Promise<ApiError> {
  const retryAfterHeader = res.headers?.get?.("Retry-After");
  const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
  const validRetryAfter = typeof retryAfter === "number" && !isNaN(retryAfter) ? retryAfter : undefined;

  try {
    const json = await res.json();
    const parsed = apiErrorEnvelopeSchema.safeParse(json);
    if (parsed.success) {
      return new ApiError(
        parsed.data.error.message,
        parsed.data.error.code,
        res.status,
        parsed.data.error.issues,
        validRetryAfter,
      );
    }
    // Fallback if error body didn't match envelope:
    // Extract issues if present in either flat json or error sub-object
    const issues = Array.isArray(json?.issues)
      ? (json.issues as string[])
      : Array.isArray(json?.error?.issues)
        ? (json.error.issues as string[])
        : undefined;

    return new ApiError(
      json?.message ||
        json?.error?.message ||
        (res.status === 429 ? "Too many requests. Please try again later." : `HTTP ${res.status}`),
      json?.code || json?.error?.code || (res.status === 429 ? "RATE_LIMITED" : "HTTP_ERROR"),
      res.status,
      issues,
      validRetryAfter,
    );
  } catch {
    return new ApiError(
      res.status === 429 ? "Too many requests. Please try again later." : `HTTP error ${res.status}`,
      res.status === 429 ? "RATE_LIMITED" : "NETWORK_ERROR",
      res.status,
      undefined,
      validRetryAfter,
    );
  }
}

async function handleResponse<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(
      "Failed to parse server response as JSON.",
      "PARSE_ERROR",
      res.status,
    );
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");
    throw new ApiError(
      `Invalid response structure from server: ${errorDetails}`,
      "SCHEMA_MISMATCH",
      res.status,
    );
  }

  return result.data;
}

export async function getHealth(): Promise<HealthData> {
  const res = await fetch("/api/health");
  return handleResponse(res, healthSchema);
}

export async function sendIntakeTurn(
  payload: IntakeTurnRequest,
): Promise<IntakeTurnResponse> {
  const res = await fetch("/api/intake/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(res, intakeTurnResponseSchema);
}

export async function createDesign(
  payload: CreateDesignRequest,
): Promise<DesignResponse> {
  const res = await fetch("/api/designs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(res, designResponseSchema);
}

export async function getDesign(id: string): Promise<DesignResponse> {
  const res = await fetch(`/api/designs/${encodeURIComponent(id)}`);
  return handleResponse(res, designResponseSchema);
}

export async function postExplanation(
  id: string,
  version: number,
): Promise<Explanation> {
  const res = await fetch(
    `/api/designs/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/explanation`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
  );
  return handleResponse(res, explanationSchema);
}

export async function postLead(
  payload: CreateLeadRequest,
): Promise<CreateLeadResponse> {
  const res = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(res, createLeadResponseSchema);
}

export async function getAdminLeads(
  token: string,
  limit = 100,
): Promise<AdminLeadItem[]> {
  const clampedLimit = Math.min(Math.max(1, limit), 200);
  const res = await fetch(`/api/admin/leads?limit=${encodeURIComponent(clampedLimit)}`, {
    headers: {
      "X-Admin-Token": token,
    },
  });
  return handleResponse(res, adminLeadsListSchema);
}

export async function getAdminDesignVersion(
  token: string,
  id: string,
  versionNo: number,
): Promise<AdminDesignVersionResponse> {
  const res = await fetch(
    `/api/admin/designs/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionNo)}`,
    {
      headers: {
        "X-Admin-Token": token,
      },
    },
  );
  return handleResponse(res, adminDesignVersionResponseSchema);
}

// ---------------------------------------------------------------------------
// Refinement API Client Helpers (Phase 7)
// ---------------------------------------------------------------------------

export async function postChat(
  designId: string,
  message: string,
): Promise<ChatResponse> {
  const res = await fetch(`/api/designs/${encodeURIComponent(designId)}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return handleResponse(res, chatResponseSchema);
}

export async function getMessages(
  designId: string,
): Promise<MessagesResponse> {
  const res = await fetch(`/api/designs/${encodeURIComponent(designId)}/messages`);
  return handleResponse(res, messagesResponseSchema);
}

export async function getVersions(
  designId: string,
): Promise<VersionsResponse> {
  const res = await fetch(`/api/designs/${encodeURIComponent(designId)}/versions`);
  return handleResponse(res, versionsResponseSchema);
}

export async function getDesignVersion(
  designId: string,
  versionNo: number,
): Promise<RefinedDesignResponse> {
  const res = await fetch(
    `/api/designs/${encodeURIComponent(designId)}/versions/${encodeURIComponent(versionNo)}`,
  );
  return handleResponse(res, refinedDesignResponseSchema);
}

export async function acceptPatch(
  designId: string,
  patchId: string,
  confirmDrop = false,
): Promise<RefinedDesignResponse> {
  const res = await fetch(
    `/api/designs/${encodeURIComponent(designId)}/patches/${encodeURIComponent(patchId)}/accept`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm_drop: confirmDrop }),
    },
  );
  return handleResponse(res, refinedDesignResponseSchema);
}

export async function rejectPatch(
  designId: string,
  patchId: string,
): Promise<RejectPatchResponse> {
  const res = await fetch(
    `/api/designs/${encodeURIComponent(designId)}/patches/${encodeURIComponent(patchId)}/reject`,
    {
      method: "POST",
    },
  );
  return handleResponse(res, rejectPatchResponseSchema);
}

export async function restoreVersion(
  designId: string,
  versionNo: number,
): Promise<RefinedDesignResponse> {
  const res = await fetch(
    `/api/designs/${encodeURIComponent(designId)}/restore`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version_no: versionNo }),
    },
  );
  return handleResponse(res, refinedDesignResponseSchema);
}

export async function postSuggestions(
  designId: string,
): Promise<SuggestionsResponse> {
  const res = await fetch(
    `/api/designs/${encodeURIComponent(designId)}/suggestions`,
    {
      method: "POST",
    },
  );
  return handleResponse(res, suggestionsResponseSchema);
}



