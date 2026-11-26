import {
  type ClarificationNeeded,
  ClarificationNeededSchema,
  type EstimationResult,
  EstimationResultSchema,
  type HardwareProfile,
  HardwareProfileSchema,
  type ModelDetailResponse,
  ModelDetailResponseSchema,
  type ModelListResponse,
  ModelListResponseSchema,
  type RecommendationResponse,
  RecommendationResponseSchema,
} from "./schemas";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface FetchModelsParams {
  search?: string;
  pipeline_tag?: string;
  sort?: "downloads" | "likes" | "recent";
  limit?: number;
  cursor?: string;
}

export async function fetchModels(params: FetchModelsParams = {}): Promise<ModelListResponse> {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.pipeline_tag) q.set("pipeline_tag", params.pipeline_tag);
  if (params.sort) q.set("sort", params.sort);
  if (params.limit !== undefined) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);

  const qs = q.toString();
  const res = await fetch(`${API_BASE}/api/models${qs ? `?${qs}` : ""}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch models: ${res.status}`);
  }

  const raw = await res.json();
  return ModelListResponseSchema.parse(raw);
}

export async function fetchModelDetail(repoId: string): Promise<ModelDetailResponse> {
  const parts = repoId.split("/").map((p) => encodeURIComponent(p)).join("/");
  const res = await fetch(`${API_BASE}/api/models/${parts}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch model '${repoId}': ${res.status}`);
  }

  const raw = await res.json();
  return ModelDetailResponseSchema.parse(raw);
}

export async function fetchHardwareProfiles(): Promise<HardwareProfile[]> {
  const res = await fetch(`${API_BASE}/api/hardware`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch hardware profiles: ${res.status}`);
  }

  const raw = await res.json();
  return HardwareProfileSchema.array().parse(raw);
}

export interface EstimationConfigPayload {
  quantization: string;
  kv_cache_dtype: "fp16" | "bf16" | "fp8" | "int8";
  context_length: number;
  batch_size: number;
  runtime: "llama_cpp" | "vllm" | "transformers";
  gpu_count: number;
  tensor_parallel_degree: number;
}

export interface HardwareProfileInputPayload {
  name: string;
  memory_bytes: number;
  kind: "gpu" | "apple_unified" | "cpu_ram";
  reserved_memory_bytes: number;
  is_preset: boolean;
}

export interface EstimateRequestPayload {
  repo_id?: string | null;
  config: EstimationConfigPayload;
  hardware: HardwareProfileInputPayload;
}

export interface BuildEstimatePayloadInput {
  repoId: string;
  quantization: string;
  contextLength: number;
  selectedHardware?: HardwareProfile | null;
  customMemoryGb?: number | null;
}

const GIB_TO_BYTES = 1024 * 1024 * 1024;

function normalizeHardwareKind(kind: string | undefined): "gpu" | "apple_unified" | "cpu_ram" {
  if (kind === "apple_unified" || kind === "cpu_ram") {
    return kind;
  }
  return "gpu";
}

export function buildEstimateRequestPayload(
  input: BuildEstimatePayloadInput
): EstimateRequestPayload {
  const repoId = input.repoId.trim();
  if (!repoId) {
    throw new Error("A Hugging Face Repo ID is required for memory estimation.");
  }

  let hardware: HardwareProfileInputPayload;
  if (input.selectedHardware) {
    hardware = {
      name: input.selectedHardware.name,
      memory_bytes: input.selectedHardware.memory_bytes,
      kind: normalizeHardwareKind(input.selectedHardware.kind),
      reserved_memory_bytes: input.selectedHardware.reserved_memory_bytes ?? 0,
      is_preset: true,
    };
  } else if (input.customMemoryGb !== undefined && input.customMemoryGb !== null) {
    if (!Number.isFinite(input.customMemoryGb) || input.customMemoryGb <= 0) {
      throw new Error("Custom memory budget must be greater than 0 GB.");
    }
    hardware = {
      name: `${input.customMemoryGb} GB Custom Memory`,
      memory_bytes: Math.round(input.customMemoryGb * GIB_TO_BYTES),
      kind: "gpu",
      reserved_memory_bytes: 0,
      is_preset: false,
    };
  } else {
    throw new Error("Please select a hardware profile or enter a custom memory budget.");
  }

  return {
    repo_id: repoId,
    config: {
      quantization: input.quantization.toLowerCase(),
      kv_cache_dtype: "fp16",
      context_length: input.contextLength,
      batch_size: 1,
      runtime: "llama_cpp",
      gpu_count: 1,
      tensor_parallel_degree: 1,
    },
    hardware,
  };
}

export async function estimateMemory(
  payload: EstimateRequestPayload
): Promise<EstimationResult> {
  const res = await fetch(`${API_BASE}/api/estimator`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Estimation failed (${res.status}): ${errBody}`);
  }

  const raw = await res.json();
  return EstimationResultSchema.parse(raw);
}

export interface RecommendRequestPayload {
  task: string;
  hardware_name?: string;
  memory_budget_gb?: number;
  max_context?: number;
  quantization_preference?: string;
  license_preference?: string;
}

export async function recommendModels(
  payload: RecommendRequestPayload
): Promise<RecommendationResponse | ClarificationNeeded> {
  const res = await fetch(`${API_BASE}/api/recommend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Recommendation failed (${res.status}): ${errBody}`);
  }

  const raw = await res.json();
  if ("clarification_needed" in raw && raw.clarification_needed === true) {
    return ClarificationNeededSchema.parse(raw);
  }
  return RecommendationResponseSchema.parse(raw);
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SSEEventData {
  event: string;
  data: Record<string, unknown>;
}

export async function streamAdvisorChat(
  messages: ChatMessage[],
  onEvent: (event: SSEEventData) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/advisor/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Advisor chat failed (${res.status}): ${err}`);
  }

  if (!res.body) {
    throw new Error("No response body received for streaming chat.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";

    for (const block of lines) {
      if (!block.trim()) continue;
      let eventType = "message";
      let eventPayloadStr = "";

      const rawLines = block.split("\n");
      for (const line of rawLines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          eventPayloadStr = line.slice(6).trim();
        }
      }

      if (eventPayloadStr) {
        try {
          const parsed = JSON.parse(eventPayloadStr);
          onEvent({ event: eventType, data: parsed });
        } catch {
          // Ignore json parse error for malformed SSE chunks
        }
      }
    }
  }
}
