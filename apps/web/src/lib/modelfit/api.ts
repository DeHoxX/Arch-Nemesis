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
  author?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

export async function fetchModels(params: FetchModelsParams = {}): Promise<ModelListResponse> {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.pipeline_tag) q.set("pipeline_tag", params.pipeline_tag);
  if (params.author) q.set("author", params.author);
  if (params.limit !== undefined) q.set("limit", String(params.limit));
  if (params.offset !== undefined) q.set("offset", String(params.offset));
  if (params.sort_by) q.set("sort_by", params.sort_by);
  if (params.sort_order) q.set("sort_order", params.sort_order);

  const res = await fetch(`${API_BASE}/api/models?${q.toString()}`, {
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

export interface EstimateRequestPayload {
  model_id?: string;
  total_params?: number;
  hardware_profile_id?: string;
  hardware_custom_memory_gb?: number;
  quantization?: string;
  context_length?: number;
  batch_size?: number;
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
