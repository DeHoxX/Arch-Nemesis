import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EstimationResultCard } from "./EstimationResultCard";
import type { EstimationResult } from "@/lib/modelfit/schemas";

describe("EstimationResultCard component", () => {
  const sampleResult: EstimationResult = {
    fits: true,
    total_bytes: 5368709120, // 5 GiB
    weights_bytes: 4294967296, // 4 GiB
    kv_cache_bytes: 536870912, // 0.5 GiB
    activation_bytes: 536870912, // 0.5 GiB
    headroom_bytes: 19864223744, // 18.5 GiB
    total_params: 7615616512,
    is_context_truncated: false,
    effective_context: 4096,
    quantization: "Q4_K_M",
    assumptions: ["Batch size = 1", "Weights fit within VRAM"],
    errors: [],
  };

  it("renders fits badge and hardware name", () => {
    render(
      <EstimationResultCard
        result={sampleResult}
        hardwareName="RTX 4090 (24 GB)"
      />
    );

    expect(screen.getByText("Fits Comfortably")).toBeDefined();
    expect(screen.getByText(/RTX 4090/)).toBeDefined();
    expect(screen.getByText("Q4_K_M")).toBeDefined();
  });

  it("renders overflow badge when fits is false", () => {
    const overflowResult: EstimationResult = {
      ...sampleResult,
      fits: false,
      headroom_bytes: -5368709120,
    };

    render(<EstimationResultCard result={overflowResult} />);
    expect(screen.getByText("Exceeds Hardware Memory")).toBeDefined();
  });
});
