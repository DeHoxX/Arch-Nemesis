import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EstimationResultCard } from "./EstimationResultCard";
import type { EstimationResult } from "@/lib/modelfit/schemas";

describe("EstimationResultCard component", () => {
  const sampleResult: EstimationResult = {
    weights_bytes: 4294967296,
    kv_cache_bytes: 536870912,
    activation_bytes: 536870912,
    runtime_overhead_bytes: 268435456,
    total_bytes: 5637144576,
    per_device_bytes: 5637144576,
    verdict: "fits",
    headroom_bytes: 19864223744,
    assumptions: ["Batch size = 1", "Weights fit within VRAM"],
    warnings: [],
    unsupported_reasons: [],
    confidence: "high",
    resolved_hardware: {
      name: "RTX 4090 (24 GB)",
      usable_memory_bytes: 24696061952,
      profile_type: "preset",
    },
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
    expect(screen.getByText("high")).toBeDefined();
  });

  it("renders overflow badge when verdict is does_not_fit", () => {
    const overflowResult: EstimationResult = {
      ...sampleResult,
      verdict: "does_not_fit",
      headroom_bytes: -5368709120,
    };

    render(<EstimationResultCard result={overflowResult} />);
    expect(screen.getByText("Exceeds Hardware Memory")).toBeDefined();
  });
});
