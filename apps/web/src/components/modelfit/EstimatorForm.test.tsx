import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EstimatorForm } from "./EstimatorForm";
import { buildEstimateRequestPayload } from "@/lib/modelfit/api";
import type { HardwareProfile } from "@/lib/modelfit/schemas";

const PRESET_GPU: HardwareProfile = {
  id: "hw-4090",
  name: "NVIDIA GeForce RTX 4090",
  kind: "gpu",
  memory_bytes: 25_769_803_776,
  reserved_memory_bytes: 1_073_741_824,
  is_preset: true,
};

const VALID_ESTIMATE_RESPONSE = {
  fits: true,
  total_bytes: 6_000_000_000,
  weights_bytes: 4_500_000_000,
  kv_cache_bytes: 1_000_000_000,
  activation_bytes: 300_000_000,
  headroom_bytes: 2_000_000_000,
  total_params: 7_000_000_000,
  is_context_truncated: false,
  effective_context: 4096,
  quantization: "q4_k_m",
  assumptions: [],
  errors: [],
};

describe("buildEstimateRequestPayload & EstimatorForm POST /api/estimator", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds exact nested body for repo_id + hardware profile with default config values", () => {
    const payload = buildEstimateRequestPayload({
      repoId: "  Qwen/Qwen2.5-7B-Instruct  ",
      quantization: "Q4_K_M",
      contextLength: 4096,
      selectedHardware: PRESET_GPU,
      customMemoryGb: null,
    });

    expect(payload).toEqual({
      repo_id: "Qwen/Qwen2.5-7B-Instruct",
      config: {
        quantization: "q4_k_m",
        kv_cache_dtype: "fp16",
        context_length: 4096,
        batch_size: 1,
        runtime: "llama_cpp",
        gpu_count: 1,
        tensor_parallel_degree: 1,
      },
      hardware: {
        name: "NVIDIA GeForce RTX 4090",
        memory_bytes: 25_769_803_776,
        kind: "gpu",
        reserved_memory_bytes: 1_073_741_824,
        is_preset: true,
      },
    });
    expect(Object.keys(payload)).toEqual(["repo_id", "config", "hardware"]);
  });

  it("builds exact nested body for repo_id + custom memory GB with default config values", () => {
    const payload = buildEstimateRequestPayload({
      repoId: "meta-llama/Llama-3.1-8B",
      quantization: "fp16",
      contextLength: 8192,
      selectedHardware: null,
      customMemoryGb: 24,
    });

    expect(payload).toEqual({
      repo_id: "meta-llama/Llama-3.1-8B",
      config: {
        quantization: "fp16",
        kv_cache_dtype: "fp16",
        context_length: 8192,
        batch_size: 1,
        runtime: "llama_cpp",
        gpu_count: 1,
        tensor_parallel_degree: 1,
      },
      hardware: {
        name: "24 GB Custom Memory",
        memory_bytes: 24 * 1024 * 1024 * 1024,
        kind: "gpu",
        reserved_memory_bytes: 0,
        is_preset: false,
      },
    });
  });

  it("submits exact nested JSON body on EstimatorForm submit for preset and custom memory", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/hardware") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify([PRESET_GPU]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/estimator") && init?.method === "POST") {
        return new Response(JSON.stringify(VALID_ESTIMATE_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<EstimatorForm initialModelId="Qwen/Qwen2.5-7B-Instruct" />);

    await waitFor(() => {
      expect(screen.getByText(/NVIDIA GeForce RTX 4090/)).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /Calculate Memory Footprint/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([u, init]) => String(u).endsWith("/api/estimator") && init?.method === "POST"
      );
      expect(postCall).toBeDefined();
      const sentBody = JSON.parse(String(postCall?.[1]?.body));
      expect(sentBody).toEqual({
        repo_id: "Qwen/Qwen2.5-7B-Instruct",
        config: {
          quantization: "q4_k_m",
          kv_cache_dtype: "fp16",
          context_length: 4096,
          batch_size: 1,
          runtime: "llama_cpp",
          gpu_count: 1,
          tensor_parallel_degree: 1,
        },
        hardware: {
          name: "NVIDIA GeForce RTX 4090",
          memory_bytes: 25_769_803_776,
          kind: "gpu",
          reserved_memory_bytes: 1_073_741_824,
          is_preset: true,
        },
      });
    });

    // Switch to Custom Budget and re-submit
    fireEvent.click(screen.getByRole("button", { name: /Custom Budget/i }));
    fireEvent.click(screen.getByRole("button", { name: /Calculate Memory Footprint/i }));

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        ([u, init]) => String(u).endsWith("/api/estimator") && init?.method === "POST"
      );
      expect(postCalls.length).toBe(2);
      const customBody = JSON.parse(String(postCalls[1]?.[1]?.body));
      expect(customBody).toEqual({
        repo_id: "Qwen/Qwen2.5-7B-Instruct",
        config: {
          quantization: "q4_k_m",
          kv_cache_dtype: "fp16",
          context_length: 4096,
          batch_size: 1,
          runtime: "llama_cpp",
          gpu_count: 1,
          tensor_parallel_degree: 1,
        },
        hardware: {
          name: "16 GB Custom Memory",
          memory_bytes: 16 * 1024 * 1024 * 1024,
          kind: "gpu",
          reserved_memory_bytes: 0,
          is_preset: false,
        },
      });
    });
  });

  it("rejects empty repo_id and does not fabricate model objects for param-count-only mode", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => {
      return new Response(JSON.stringify([PRESET_GPU]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<EstimatorForm />);
    await waitFor(() => {
      expect(screen.getByText(/NVIDIA GeForce RTX 4090/)).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /Param Count/i }));
    fireEvent.click(screen.getByRole("button", { name: /Calculate Memory Footprint/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Parameter-count-only estimation is not supported/i)
      ).toBeDefined();
    });

    const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(postCalls.length).toBe(0);
  });
});
