import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecommendationCardView } from "./RecommendationCardView";
import type { RecommendationItem } from "@/lib/modelfit/schemas";

describe("RecommendationCardView component", () => {
  const sampleRec: RecommendationItem = {
    model: {
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
      is_context_truncated: false,
      effective_context: 4096,
      quantization: "Q4_K_M",
      assumptions: [],
      errors: [],
    },
    quantization: "Q4_K_M",
    context_length: 4096,
    supported: true,
    tags: ["general"],
  };

  it("renders empty state message when recommendations array is empty", () => {
    render(<RecommendationCardView recommendations={[]} />);
    expect(
      screen.getByText("No models matched your task and hardware constraints.")
    ).toBeDefined();
  });

  it("renders recommended model cards with headroom and link actions", () => {
    render(
      <RecommendationCardView
        recommendations={[sampleRec]}
        task="text-generation"
      />
    );

    expect(screen.getByText("Qwen2.5-7B-Instruct")).toBeDefined();
    expect(screen.getByText(/18.5 GB Free/)).toBeDefined();
    expect(screen.getByText("Q4_K_M")).toBeDefined();
    expect(screen.getByText("fits_comfortably")).toBeDefined();
    expect(screen.getByText("Details")).toBeDefined();
    expect(screen.getByText("Chat Advisor")).toBeDefined();
  });
});
