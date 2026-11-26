import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ModelsCatalogPage from "./page";

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

const PAGE_1 = {
  items: [
    {
      id: "org/model-1",
      author: "org",
      model_name: "model-1",
      pipeline_tag: "text-generation",
      downloads: 5000,
      likes: 100,
      is_supported: true,
    },
    {
      id: "org/model-2",
      author: "org",
      model_name: "model-2",
      pipeline_tag: "text-generation",
      downloads: 4000,
      likes: 80,
      is_supported: true,
    },
  ],
  next_cursor: "cursor-page-2",
  has_more: true,
};

const PAGE_2_WITH_DUPLICATE = {
  items: [
    {
      id: "org/model-2",
      author: "org",
      model_name: "model-2",
      pipeline_tag: "text-generation",
      downloads: 4000,
      likes: 80,
      is_supported: true,
    },
    {
      id: "org/model-3",
      author: "org",
      model_name: "model-3",
      pipeline_tag: "text-generation",
      downloads: 3000,
      likes: 60,
      is_supported: true,
    },
  ],
  next_cursor: null,
  has_more: false,
};

describe("ModelsCatalogPage cursor Load more pagination", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads next page on Load more click, deduplicates overlapping ids, and hides button when next_cursor is null", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (input) => {
      const url = String(input);
      if (url.includes("cursor=cursor-page-2")) {
        return new Response(JSON.stringify(PAGE_2_WITH_DUPLICATE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(PAGE_1), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithQuery(<ModelsCatalogPage />);

    await waitFor(() => {
      expect(screen.getByText("model-1")).toBeDefined();
      expect(screen.getByText("model-2")).toBeDefined();
    });

    const loadMoreBtn = screen.getByRole("button", { name: /Load more/i });
    expect(loadMoreBtn).toBeDefined();

    fireEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(screen.getByText("model-3")).toBeDefined();
    });

    // Overlapping org/model-2 must be deduplicated
    expect(screen.getAllByText("model-2").length).toBe(1);
    expect(screen.getAllByText("model-1").length).toBe(1);
    expect(screen.getAllByText("model-3").length).toBe(1);

    // Next cursor is null -> Load more button must be hidden
    expect(screen.queryByRole("button", { name: /Load more/i })).toBeNull();
  });
});
