import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { EstimatorForm } from "./EstimatorForm";
import { buildEstimateRequestPayload, estimateMemory } from "@/lib/modelfit/api";
import type { HardwareProfile } from "@/lib/modelfit/schemas";

const PRESET_GPU: HardwareProfile = {
  id: "hw-4090",
  name: "NVIDIA GeForce RTX 4090",
  kind: "gpu",
  memory_bytes: 25_769_803_776,
  reserved_memory_bytes: 1_073_741_824,
  is_preset: true,
};

const REAL_BACKEND_ESTIMATE_RESPONSE = {
  weights_bytes: 4_500_000_000,
  kv_cache_bytes: 1_000_000_000,
  activation_bytes: 300_000_000,
  runtime_overhead_bytes: 200_000_000,
  total_bytes: 6_000_000_000,
  per_device_bytes: 6_000_000_000,
  verdict: "fits" as const,
  headroom_bytes: 18_696_061_952,
  assumptions: ["Using Q4_K_M quantization"],
  warnings: [],
  unsupported_reasons: [],
  confidence: "high" as const,
  resolved_hardware: {
    name: "NVIDIA GeForce RTX 4090",
    usable_memory_bytes: 24_696_061_952,
    profile_type: "preset",
  },
};

const SEARCH_MODELS_RESPONSE = {
  items: [
    {
      id: "Qwen/Qwen2.5-7B-Instruct",
      author: "Qwen",
      model_name: "Qwen2.5-7B-Instruct",
      pipeline_tag: "text-generation",
      downloads: 120000,
      likes: 4500,
      is_supported: true,
      total_params: 7_600_000_000,
      gated: false,
      support_status: "supported_llm",
    },
    {
      id: "evil/<script>alert(1)</script>",
      author: "<img src=x onerror=alert(1)>",
      model_name: "<script>alert(1)</script>",
      pipeline_tag: "text-generation",
      downloads: 10,
      likes: 1,
      is_supported: true,
      total_params: 1_500_000_000,
      gated: false,
      support_status: "supported_llm",
    },
  ],
  next_cursor: null,
  has_more: false,
};

describe("buildEstimateRequestPayload, estimateMemory & EstimatorForm picker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("parses realistic unwrapped backend EstimationResult in estimateMemory", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => {
      return new Response(JSON.stringify(REAL_BACKEND_ESTIMATE_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = buildEstimateRequestPayload({
      repoId: "Qwen/Qwen2.5-7B-Instruct",
      quantization: "q4_k_m",
      contextLength: 4096,
      selectedHardware: PRESET_GPU,
      customMemoryGb: null,
    });
    const parsed = await estimateMemory(payload);

    expect(parsed.verdict).toBe("fits");
    expect(parsed.total_bytes).toBe(6_000_000_000);
    expect(parsed.runtime_overhead_bytes).toBe(200_000_000);
    expect(parsed.confidence).toBe("high");
    expect(parsed.resolved_hardware?.name).toBe("NVIDIA GeForce RTX 4090");
  });

  it("builds exact nested body for repo_id + hardware profile and custom memory GB", () => {
    const presetPayload = buildEstimateRequestPayload({
      repoId: "  Qwen/Qwen2.5-7B-Instruct  ",
      quantization: "Q4_K_M",
      contextLength: 4096,
      selectedHardware: PRESET_GPU,
      customMemoryGb: null,
    });

    expect(presetPayload).toEqual({
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

    const customPayload = buildEstimateRequestPayload({
      repoId: "meta-llama/Llama-3.1-8B",
      quantization: "fp16",
      contextLength: 8192,
      selectedHardware: null,
      customMemoryGb: 24,
    });

    expect(customPayload).toEqual({
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

  it("hides Param Count toggle, debounces search, renders hostile strings as text, selects repo_id, and submits nested payload", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/hardware") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify([PRESET_GPU]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/models") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify(SEARCH_MODELS_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/estimator") && init?.method === "POST") {
        return new Response(JSON.stringify(REAL_BACKEND_ESTIMATE_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<EstimatorForm />);

    // Param Count button must be hidden
    expect(screen.queryByRole("button", { name: /Param Count/i })).toBeNull();

    await waitFor(() => {
      expect(screen.getByText(/NVIDIA GeForce RTX 4090/)).toBeDefined();
    });

    vi.useFakeTimers();
    const searchInput = screen.getByRole("combobox", { name: /Model search/i });
    fireEvent.change(searchInput, { target: { value: "Qwen" } });

    expect(screen.getByText("Searching models...")).toBeDefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(310);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText("Qwen2.5-7B-Instruct")).toBeDefined();
      expect(screen.getByText("7.6B params")).toBeDefined();
      expect(screen.getByText("<script>alert(1)</script>")).toBeDefined();
      expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeDefined();
    });

    // Hostile strings must never inject script tags
    expect(container.querySelectorAll("script").length).toBe(0);

    const modelCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).includes("/api/models")
    );
    expect(modelCalls.length).toBe(1);
    expect(String(modelCalls[0]?.[0])).toContain("search=Qwen");

    // Keyboard select first item via Enter
    fireEvent.keyDown(searchInput, { key: "Enter" });
    expect(screen.getByText(/Selected:/)).toBeDefined();
    expect(screen.getByText("Qwen/Qwen2.5-7B-Instruct")).toBeDefined();

    // Submit form
    fireEvent.click(
      screen.getByRole("button", { name: /Calculate Memory Footprint/i })
    );

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([u, init]) => String(u).endsWith("/api/estimator") && init?.method === "POST"
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body).toEqual({
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

    // Clear button clears repo selection
    fireEvent.click(screen.getByRole("button", { name: /Clear/i }));
    expect(screen.queryByText(/Selected:/)).toBeNull();
  });

  it("renders plain-text empty and error states in model search", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/hardware") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify([PRESET_GPU]), { status: 200 });
      }
      if (url.includes("search=Empty")) {
        return new Response(
          JSON.stringify({ items: [], next_cursor: null, has_more: false }),
          { status: 200 }
        );
      }
      if (url.includes("search=Fail")) {
        return new Response("Upstream error", { status: 502 });
      }
      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<EstimatorForm />);
    await waitFor(() => {
      expect(screen.getByText(/NVIDIA GeForce RTX 4090/)).toBeDefined();
    });

    vi.useFakeTimers();
    const searchInput = screen.getByRole("combobox", { name: /Model search/i });
    fireEvent.change(searchInput, { target: { value: "Empty" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(310);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText("No matching models found.")).toBeDefined();
    });

    vi.useFakeTimers();
    fireEvent.change(searchInput, { target: { value: "Fail" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(310);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch models: 502/)).toBeDefined();
    });
  });
});
