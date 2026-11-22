import { z } from "zod";

/**
 * Zod schemas for Arch-Nemesis ModelFit native feature.
 * Strictly validates all backend API responses and client storage.
 */

export const ModelSummarySchema = z.object({
  id: z.string(),
  author: z.string(),
  model_name: z.string(),
  pipeline_tag: z.string().nullable().optional(),
  downloads: z.number().int().default(0),
  likes: z.number().int().default(0),
  is_supported: z.boolean().default(true),
  license: z.string().nullable().optional(),
  param_provenance: z.string().default("derived"),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type ModelSummary = z.infer<typeof ModelSummarySchema>;

export const ModelListResponseSchema = z.object({
  items: z.array(ModelSummarySchema),
  total: z.number().int().default(0),
  limit: z.number().int().default(20),
  offset: z.number().int().default(0),
});

export type ModelListResponse = z.infer<typeof ModelListResponseSchema>;

export const NormalizedModelSchema = z.object({
  architecture: z.string().default("transformer"),
  architecture_name: z.string().optional(),
  architecture_category: z.string().optional(),
  total_params: z.number().int().nullable().optional(),
  context_length: z.number().int().nullable().optional(),
  max_context_length: z.number().int().nullable().optional(),
  hidden_size: z.number().int().nullable().optional(),
  num_layers: z.number().int().nullable().optional(),
  num_hidden_layers: z.number().int().nullable().optional(),
  num_attention_heads: z.number().int().nullable().optional(),
  num_kv_heads: z.number().int().nullable().optional(),
  num_key_value_heads: z.number().int().nullable().optional(),
  attention_variant: z.string().optional(),
  vocab_size: z.number().int().nullable().optional(),
  intermediate_size: z.number().int().nullable().optional(),
  dtype: z.string().default("bfloat16"),
  param_provenance: z.string().default("derived"),
});

export type NormalizedModel = z.infer<typeof NormalizedModelSchema>;

export const ModelDetailResponseSchema = z.object({
  id: z.string(),
  hf_model_id: z.string(),
  author: z.string(),
  model_name: z.string(),
  pipeline_tag: z.string().nullable().optional(),
  likes: z.number().int().default(0),
  downloads: z.number().int().default(0),
  is_supported: z.boolean().default(true),
  support_status: z.string().default("supported_llm"),
  support_reason_code: z.string().nullable().optional(),
  support_reason_message: z.string().nullable().optional(),
  gated: z.boolean().default(false),
  license: z.string().nullable().optional(),
  param_provenance: z.string().default("derived"),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  raw_config: z.record(z.string(), z.unknown()).default({}),
  normalized_model: NormalizedModelSchema,
});

export type ModelDetailResponse = z.infer<typeof ModelDetailResponseSchema>;

export const HardwareProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  memory_bytes: z.number().int(),
  reserved_memory_bytes: z.number().int().default(0),
  memory_bandwidth_gbps: z.number().nullable().optional(),
  is_preset: z.boolean().default(false),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type HardwareProfile = z.infer<typeof HardwareProfileSchema>;

export const EstimationResultSchema = z.object({
  fits: z.boolean(),
  total_bytes: z.number().int(),
  weights_bytes: z.number().int(),
  kv_cache_bytes: z.number().int(),
  activation_bytes: z.number().int(),
  headroom_bytes: z.number().int(),
  total_params: z.number().int(),
  is_context_truncated: z.boolean().default(false),
  effective_context: z.number().int(),
  quantization: z.string(),
  assumptions: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([]),
});

export type EstimationResult = z.infer<typeof EstimationResultSchema>;

export const RecommendationItemSchema = z.object({
  model: ModelSummarySchema,
  fits: z.boolean(),
  headroom_status: z.enum(["fits", "borderline", "overflow"]),
  headroom_gb: z.number(),
  rank_score: z.number(),
  rank_reasons: z.array(z.string()),
  estimated_memory: EstimationResultSchema,
  quantization: z.string(),
  context_length: z.number().int(),
  supported: z.boolean(),
  tags: z.array(z.string()).default([]),
});

export type RecommendationItem = z.infer<typeof RecommendationItemSchema>;

export const RecommendationResponseSchema = z.object({
  task: z.string(),
  hardware_name: z.string().nullable().optional(),
  memory_budget_gb: z.number().nullable().optional(),
  recommendations: z.array(RecommendationItemSchema),
  count: z.number().int(),
});

export type RecommendationResponse = z.infer<typeof RecommendationResponseSchema>;

export const ClarificationNeededSchema = z.object({
  clarification_needed: z.literal(true),
  question: z.string(),
  missing_parameters: z.array(z.string()),
  suggestions: z.array(z.string()).default([]),
});

export type ClarificationNeeded = z.infer<typeof ClarificationNeededSchema>;

export const AdvisorMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type AdvisorMessage = z.infer<typeof AdvisorMessageSchema>;
