import { z } from "zod";
import type {
  CreateDesignRequest,
  DesignResponse,
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
});

export const edgeSpecSchema = z.object({
  from: z.string(),
  to: z.string(),
  flows: z.string(),
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

export const designResponseSchema = z.object({
  id: z.string(),
  intake_session_id: z.string(),
  current_version: z.number(),
  brief: requirementBriefSchema,
  spec: architectureSpecSchema,
  warnings: z.array(z.string()).default([]),
  flow_order: z.array(z.string()),
  prompt_version: z.string(),
});

export const apiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z.array(z.string()).optional(),
  }),
});

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
    // Fallback if error body didn't match envelope
    return new ApiError(
      json?.message || `HTTP ${res.status}`,
      json?.code || "HTTP_ERROR",
      res.status,
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
