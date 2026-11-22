import { describe, expect, it } from "vitest";
import {
  EstimationResultSchema,
  HardwareProfileSchema,
  ModelDetailResponseSchema,
  ModelListResponseSchema,
  RecommendationResponseSchema,
} from "./schemas";

describe("ModelFit frontend Zod schemas", () => {
  it("validates ModelListResponseSchema correctly", () => {
    const raw = {
      items: [
        {
          id: "Qwen/Qwen2.5-7B-Instruct",
          author: "Qwen",
          model_name: "Qwen2.5-7B-Instruct",
          pipeline_tag: "text-generation",
          downloads: 120000,
          likes: 4500,
          is_supported: true,
          license: "apache-2.0",
          param_provenance: "safetensors",
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    };

    const parsed = ModelListResponseSchema.parse(raw);
    expect(parsed.total).toBe(1);
    expect(parsed.items[0]?.author).toBe("Qwen");
  });

  it("validates ModelDetailResponseSchema with normalized_model", () => {
    const raw = {
      id: "Qwen/Qwen2.5-7B-Instruct",
      hf_model_id: "Qwen/Qwen2.5-7B-Instruct",
      author: "Qwen",
      model_name: "Qwen2.5-7B-Instruct",
      pipeline_tag: "text-generation",
      likes: 4500,
      downloads: 120000,
      is_supported: true,
      support_status: "supported_llm",
      gated: false,
      license: "apache-2.0",
      param_provenance: "safetensors",
      raw_config: { hidden_size: 3584 },
      normalized_model: {
        architecture: "Qwen2ForCausalLM",
        total_params: 7615616512,
        context_length: 32768,
        hidden_size: 3584,
        num_hidden_layers: 28,
        num_attention_heads: 28,
        num_key_value_heads: 4,
        vocab_size: 152064,
        intermediate_size: 18944,
        dtype: "bfloat16",
        param_provenance: "safetensors",
      },
    };

    const parsed = ModelDetailResponseSchema.parse(raw);
    expect(parsed.normalized_model.hidden_size).toBe(3584);
    expect(parsed.normalized_model.total_params).toBe(7615616512);
  });

  it("validates HardwareProfileSchema correctly", () => {
    const raw = {
      id: "rtx-4090",
      name: "NVIDIA GeForce RTX 4090",
      kind: "gpu",
      memory_bytes: 24 * 1024 * 1024 * 1024,
      reserved_memory_bytes: 1288490188,
      is_preset: true,
    };

    const parsed = HardwareProfileSchema.parse(raw);
    expect(parsed.name).toBe("NVIDIA GeForce RTX 4090");
    expect(parsed.kind).toBe("gpu");
  });

  it("validates EstimationResultSchema correctly", () => {
    const raw = {
      fits: true,
      total_bytes: 5368709120,
      weights_bytes: 4294967296,
      kv_cache_bytes: 536870912,
      activation_bytes: 536870912,
      headroom_bytes: 20401094656,
      total_params: 7615616512,
      effective_context: 4096,
      quantization: "Q4_K_M",
      assumptions: ["Batch size = 1", "KV cache uncompressed"],
      errors: [],
    };

    const parsed = EstimationResultSchema.parse(raw);
    expect(parsed.fits).toBe(true);
    expect(parsed.quantization).toBe("Q4_K_M");
  });

  it("validates RecommendationResponseSchema correctly", () => {
    const raw = {
      task: "text-generation",
      hardware_name: "RTX 4090",
      memory_budget_gb: 24,
      recommendations: [
        {
          model: {
            id: "Qwen/Qwen2.5-7B-Instruct",
            author: "Qwen",
            model_name: "Qwen2.5-7B-Instruct",
            pipeline_tag: "text-generation",
            downloads: 120000,
            likes: 4500,
            is_supported: true,
          },
          fits: true,
          headroom_status: "fits",
          headroom_gb: 18.5,
          rank_score: 95.0,
          rank_reasons: ["fits_comfortably", "popular_and_proven"],
          estimated_memory: {
            fits: true,
            total_bytes: 5368709120,
            weights_bytes: 4294967296,
            kv_cache_bytes: 536870912,
            activation_bytes: 536870912,
            headroom_bytes: 19864223744,
            total_params: 7615616512,
            effective_context: 4096,
            quantization: "Q4_K_M",
            assumptions: [],
            errors: [],
          },
          quantization: "Q4_K_M",
          context_length: 4096,
          supported: true,
          tags: ["general"],
        },
      ],
      count: 1,
    };

    const parsed = RecommendationResponseSchema.parse(raw);
    expect(parsed.count).toBe(1);
    expect(parsed.recommendations[0]?.headroom_status).toBe("fits");
  });
});
