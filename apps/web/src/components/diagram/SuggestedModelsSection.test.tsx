import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SuggestedModelsSection } from "./SuggestedModelsSection";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    postNodeModelSuggestions: vi.fn(),
  };
});

describe("SuggestedModelsSection component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders on-demand 'Suggest models' button initially", () => {
    render(
      <SuggestedModelsSection
        designId="design-123"
        versionNo={1}
        nodeId="node_ai"
      />
    );

    expect(
      screen.getByRole("button", { name: /Suggest models/i })
    ).toBeDefined();
    expect(screen.queryByText(/Suggesting models.../i)).toBeNull();
  });

  it("loads suggestions on click and renders status 'ok' items with links", async () => {
    const user = userEvent.setup();
    const mockPost = vi.mocked(api.postNodeModelSuggestions).mockResolvedValueOnce({
      status: "ok",
      task_tag: "text-generation",
      items: [
        {
          id: "meta-llama/Llama-3-8B-Instruct",
          author: "meta-llama",
          model_name: "Llama-3-8B-Instruct",
          task_tag: "text-generation",
          total_params: 8_030_000_000,
          size_band: "medium",
          downloads: 125000,
          likes: 4500,
          details_url: "/models/meta-llama/Llama-3-8B-Instruct",
          browse_url: "/models",
        },
        {
          id: "mistralai/Mistral-7B-v0.1",
          author: "mistralai",
          model_name: "Mistral-7B-v0.1",
          task_tag: "text-generation",
          total_params: 7_240_000_000,
          size_band: "medium",
          downloads: 89000,
          likes: 3100,
          details_url: "/models/mistralai/Mistral-7B-v0.1",
          browse_url: "/models",
        },
        {
          id: "custom/no-params-model",
          author: "custom",
          model_name: "no-params-model",
          task_tag: "text-generation",
          total_params: null,
          size_band: "unknown",
          downloads: 10,
          likes: 1,
          details_url: "/models/custom/no-params-model",
          browse_url: "/models",
        },
      ],
      message: null,
    });

    render(
      <SuggestedModelsSection
        designId="design-123"
        versionNo={1}
        nodeId="node_ai"
      />
    );

    const suggestBtn = screen.getByRole("button", { name: /Suggest models/i });
    await user.click(suggestBtn);

    expect(mockPost).toHaveBeenCalledWith("design-123", 1, "node_ai");

    await waitFor(() => {
      expect(screen.getByText("Llama-3-8B-Instruct")).toBeDefined();
    });

    expect(screen.getByText("Mistral-7B-v0.1")).toBeDefined();
    expect(screen.getByText("params: 8.0B")).toBeDefined();
    expect(screen.getByText("params: 7.2B")).toBeDefined();
    expect(screen.getByText("params: unknown")).toBeDefined();

    const llamaLink = screen.getByRole("link", { name: /Llama-3-8B-Instruct/i });
    expect(llamaLink.getAttribute("href")).toBe("/models/meta-llama/Llama-3-8B-Instruct");
  });

  it("handles status 'unavailable' with message and Retry button", async () => {
    const user = userEvent.setup();
    const mockPost = vi
      .mocked(api.postNodeModelSuggestions)
      .mockResolvedValueOnce({
        status: "unavailable",
        task_tag: null,
        items: [],
        message: "Hugging Face upstream catalog is currently unavailable.",
      })
      .mockResolvedValueOnce({
        status: "ok",
        task_tag: "text-generation",
        items: [
          {
            id: "org/model-retry",
            author: "org",
            model_name: "model-retry",
            task_tag: "text-generation",
            total_params: 1_000_000_000,
            size_band: "small",
            downloads: 100,
            likes: 10,
            details_url: "/models/org/model-retry",
            browse_url: "/models",
          },
        ],
        message: null,
      });

    render(
      <SuggestedModelsSection
        designId="design-123"
        versionNo={1}
        nodeId="node_ai"
      />
    );

    await user.click(screen.getByRole("button", { name: /Suggest models/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Hugging Face upstream catalog is currently unavailable.")
      ).toBeDefined();
    });

    const retryBtn = screen.getByRole("button", { name: /Retry/i });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText("model-retry")).toBeDefined();
    });

    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it("handles status 'empty' with appropriate message and Retry button", async () => {
    const user = userEvent.setup();
    vi.mocked(api.postNodeModelSuggestions).mockResolvedValueOnce({
      status: "empty",
      task_tag: "audio-classification",
      items: [],
      message: null,
    });

    render(
      <SuggestedModelsSection
        designId="design-123"
        versionNo={1}
        nodeId="node_ai"
      />
    );

    await user.click(screen.getByRole("button", { name: /Suggest models/i }));

    await waitFor(() => {
      expect(
        screen.getByText("No matching open-source models found for this node role.")
      ).toBeDefined();
    });

    expect(screen.getByRole("button", { name: /Retry/i })).toBeDefined();
  });

  it("renders hostile strings as plain text without execution or unescaped HTML", async () => {
    const user = userEvent.setup();
    const hostileModelName = "<script>alert('xss')</script>EvilModel";
    const hostileAuthor = "<img src=x onerror=alert(1)>evil-author";

    vi.mocked(api.postNodeModelSuggestions).mockResolvedValueOnce({
      status: "ok",
      task_tag: "text-generation",
      items: [
        {
          id: "evil/xss-model",
          author: hostileAuthor,
          model_name: hostileModelName,
          task_tag: "text-generation",
          total_params: 1_000_000_000,
          size_band: "small",
          downloads: 100,
          likes: 10,
          details_url: "/models/evil/xss-model",
          browse_url: "/models",
        },
      ],
      message: null,
    });

    const { container } = render(
      <SuggestedModelsSection
        designId="design-123"
        versionNo={1}
        nodeId="node_ai"
      />
    );

    await user.click(screen.getByRole("button", { name: /Suggest models/i }));

    await waitFor(() => {
      expect(screen.getByText(hostileModelName)).toBeDefined();
    });

    expect(screen.getByText(hostileAuthor)).toBeDefined();

    // Verify no script or img tags were created in the DOM
    expect(container.querySelectorAll("script").length).toBe(0);
    expect(container.querySelectorAll("img").length).toBe(0);
  });
});
