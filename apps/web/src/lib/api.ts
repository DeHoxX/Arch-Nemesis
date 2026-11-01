import { z } from "zod";
import type {
  AdminDesignVersionResponse,
  AdminLeadItem,
  CreateDesignRequest,
  CreateLeadRequest,
  CreateLeadResponse,
  DesignResponse,
  Explanation,
  HealthData,
  IntakeTurnRequest,
  IntakeTurnResponse,
} from "./types";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly issues?: string[];

  constructor(message: string, code: string, status: number, issues?: string[]) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.issues = issues;
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

export const historyListSchema = z.array(historyEntrySchema);

async function parseErrorResponse(res: Response): Promise<ApiError> {
  try {
    const json = await res.json();
    const parsed = apiErrorEnvelopeSchema.safeParse(json);
    if (parsed.success) {
      return new ApiError(
        parsed.data.error.message,
        parsed.data.error.code,
        res.status,
        parsed.data.error.issues,
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
      json?.message || json?.error?.message || `HTTP ${res.status}`,
      json?.code || json?.error?.code || "HTTP_ERROR",
      res.status,
      issues,
    );
  } catch {
    return new ApiError(`HTTP error ${res.status}`, "NETWORK_ERROR", res.status);
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


