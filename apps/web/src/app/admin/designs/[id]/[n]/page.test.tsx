import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminDesignInspectionPage from "./page";
import { AdminTokenProvider } from "../../../context";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "design-xyz-123", n: "1" }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getAdminDesignVersion: vi.fn(),
    postExplanation: vi.fn(),
  };
});

// Mock DiagramView to avoid canvas rendering complexities in jsdom
vi.mock("@/components/diagram/DiagramView", () => ({
  DiagramView: ({ spec }: { spec: { nodes: unknown[] } }) => (
    <div data-testid="mock-diagram-view">
      Diagram Canvas with {spec.nodes.length} nodes
    </div>
  ),
}));

const mockAdminVersionData = {
  brief: {
    summary: "Cloud Native Event Store",
    users: "Distributed Systems Engineers",
    data_involved: ["events", "snapshots"],
    domain_hint: "cloud",
    stated_constraints: [{ id: "bc1", text: "Zero data loss" }],
    unverifiable_requirements: [],
    numbers_given: [],
    assumptions: [],
  },
  spec: {
    nodes: [
      {
        id: "broker",
        name: "Message Broker",
        type: "queue",
        role: "Buffers incoming events",
        inputs: [],
        outputs: ["event_stream"],
        tech_options: ["Kafka"],
        needs_model: false,
      },
    ],
    edges: [],
    constraints: [],
    entry_ids: ["broker"],
    exit_ids: ["broker"],
  },
  warnings: ["No redundancy on broker"],
  flow_order: ["broker"],
  explanation: {
    overview: "This design provides an event store.",
    flow: [{ step: 1, node_id: "broker", node_name: "Broker", text: "Processes events" }],
    parts: [{ node_id: "broker", node_name: "Broker", text: "Kafka broker" }],
    checks: [],
    models: { nodes: [], text: "No models required" },
    source: "llm" as const,
  },
};

function renderPage(): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminTokenProvider>
        <AdminDesignInspectionPage />
      </AdminTokenProvider>
    </QueryClientProvider>
  );
}

describe("Admin Design Inspection Page (/admin/designs/[id]/[n])", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("direct load without token shows inline password prompt on that page without redirecting", () => {
    renderPage();

    expect(screen.getByLabelText(/Admin Secret Token/i)).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Unlock Design Version/i })
    ).toBeDefined();
  });

  it("handles 401 error: clears token and shows 'Not authorised.' with inline prompt", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getAdminDesignVersion).mockRejectedValueOnce(
      new ApiError("Not authorised.", "UNAUTHORIZED", 401)
    );

    renderPage();

    await user.type(screen.getByLabelText(/Admin Secret Token/i), "bad-token");
    await user.click(screen.getByRole("button", { name: /Unlock Design Version/i }));

    const errorMsg = await screen.findByText("Not authorised.");
    expect(errorMsg).toBeDefined();

    // Prompt remains inline on the page
    expect(screen.getByLabelText(/Admin Secret Token/i)).toBeDefined();

    // Token must not be stored in localStorage, sessionStorage, or URL
    expect(localStorage.getItem("admin_token")).toBeNull();
    expect(sessionStorage.getItem("admin_token")).toBeNull();
    expect(window.location.search).not.toContain("bad-token");
  });

  it("handles 404 error: displays 'Design version not found or admin disabled.'", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getAdminDesignVersion).mockRejectedValueOnce(
      new ApiError("Not found.", "NOT_FOUND", 404)
    );

    renderPage();

    await user.type(screen.getByLabelText(/Admin Secret Token/i), "any-token");
    await user.click(screen.getByRole("button", { name: /Unlock Design Version/i }));

    const errorMsg = await screen.findByText(
      "Design version not found or admin disabled."
    );
    expect(errorMsg).toBeDefined();
  });

  it("handles 500 error: displays clear incompatible format alert", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getAdminDesignVersion).mockRejectedValueOnce(
      new ApiError("Internal error", "INTERNAL_ERROR", 500)
    );

    renderPage();

    await user.type(screen.getByLabelText(/Admin Secret Token/i), "token");
    await user.click(screen.getByRole("button", { name: /Unlock Design Version/i }));

    const errorMsg = await screen.findByText(
      "Unable to load design version (backend internal error or incompatible data format)."
    );
    expect(errorMsg).toBeDefined();
  });

  it("renders diagram canvas with spec and walkthrough when successfully authenticated", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getAdminDesignVersion).mockResolvedValueOnce(mockAdminVersionData);

    renderPage();

    await user.type(screen.getByLabelText(/Admin Secret Token/i), "valid-token");
    await user.click(screen.getByRole("button", { name: /Unlock Design Version/i }));

    await waitFor(() => {
      expect(screen.getByText("Cloud Native Event Store")).toBeDefined();
    });

    expect(screen.getByTestId("mock-diagram-view")).toBeDefined();
    expect(screen.getByText(/Design ID: design-xyz-123 • Version 1/i)).toBeDefined();
  });

  it("displays 'No explanation generated yet.' when explanation is null", async () => {
    const user = userEvent.setup();
    const noExplanationData = {
      ...mockAdminVersionData,
      explanation: null,
    };
    vi.mocked(api.getAdminDesignVersion).mockResolvedValueOnce(noExplanationData);

    renderPage();

    await user.type(screen.getByLabelText(/Admin Secret Token/i), "valid-token");
    await user.click(screen.getByRole("button", { name: /Unlock Design Version/i }));

    await waitFor(() => {
      expect(screen.getByText("Cloud Native Event Store")).toBeDefined();
    });

    // Click Explanation tab
    const explanationTab = screen.getByRole("tab", {
      name: /Plain-Language Walkthrough/i,
    });
    await user.click(explanationTab);

    expect(
      screen.getByText("No explanation generated yet.")
    ).toBeDefined();
  });

  it("is strictly read-only and makes NO POST requests to explanation or LLM endpoints", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getAdminDesignVersion).mockResolvedValueOnce(mockAdminVersionData);

    renderPage();

    await user.type(screen.getByLabelText(/Admin Secret Token/i), "valid-token");
    await user.click(screen.getByRole("button", { name: /Unlock Design Version/i }));

    await waitFor(() => {
      expect(screen.getByText("Cloud Native Event Store")).toBeDefined();
    });

    // Switch tabs to explanation
    const explanationTab = screen.getByRole("tab", {
      name: /Plain-Language Walkthrough/i,
    });
    await user.click(explanationTab);

    // Verify postExplanation was never called
    expect(api.postExplanation).not.toHaveBeenCalled();
  });
});
