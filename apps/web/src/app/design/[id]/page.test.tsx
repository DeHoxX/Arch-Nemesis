import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DesignPage from "./page";

let mockId = "design_test_123";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: mockId }),
  useRouter: () => ({ push: vi.fn() }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

const mockValidDesign = {
  id: "design_test_123",
  intake_session_id: "session_123",
  current_version: 1,
  brief: {
    summary: "Telemetry pipeline",
    users: "Engineers",
    data_involved: ["metrics", "logs"],
    domain_hint: "cloud",
    stated_constraints: [
      { id: "c1", text: "Must process within cluster" },
    ],
    unverifiable_requirements: ["Sub-millisecond SLA required"],
    numbers_given: [],
    assumptions: [],
  },
  spec: {
    // Array order is node_b, node_a (differs from flow_order)
    nodes: [
      {
        id: "node_b",
        name: "Buffer Node",
        type: "queue",
        role: "Buffers metrics",
        inputs: ["metrics_raw"],
        outputs: ["metrics_buffered"],
        tech_options: ["Kafka"],
        needs_model: false,
      },
      {
        id: "node_a",
        name: "Ingest Node",
        type: "api_gateway",
        role: "Ingests raw telemetry",
        inputs: [],
        outputs: ["metrics_raw"],
        tech_options: [],
        needs_model: false,
      },
    ],
    edges: [
      { from: "node_a", to: "node_b", flows: "Raw metrics stream" },
    ],
    constraints: [
      {
        id: "c1",
        text: "Must process within cluster",
        kind: "must_pass_through",
        node_id: "node_b",
        a: null,
        b: null,
        covers: ["c1"],
      },
    ],
    entry_ids: ["node_a"],
    exit_ids: ["node_b"],
  },
  warnings: ["High fanout warning on ingress"],
  flow_order: ["node_a", "node_b"],
  prompt_version: "architect_v1",
};

describe("DesignPage Component (/design/[id])", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockId = "design_test_123";

    // Default matchMedia mock for desktop (>= 768px)
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it("renders exact Banner text, tabs, and triggers Explanation loading", async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      if (String(url).includes("/explanation")) {
        return new Promise(() => {});
      }
      return {
        ok: true,
        status: 200,
        json: async () => mockValidDesign,
      } as unknown as Response;
    });

    renderWithClient(<DesignPage />);

    // Success load
    await waitFor(() => {
      expect(screen.getByText(/Design design_test_123/)).toBeDefined();
    });

    // Results print wrapper container present for scoped print CSS
    expect(document.querySelector(".results-print-wrapper")).not.toBeNull();

    // Export buttons present next to Contact button
    expect(
      screen.getByRole("button", { name: "Download diagram (PNG)" })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Download explanation (.md)" })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Print or save as PDF" })
    ).toBeDefined();

    // Exact Banner text above tabs
    const exactBanner =
      "Structurally checked, not guaranteed to be the best design. This is not a compliance claim.";
    expect(screen.getByText(exactBanner)).toBeDefined();

    // Tabs "Diagram" and "Explanation"
    const diagramTab = screen.getByRole("tab", { name: "Diagram" });
    const explanationTab = screen.getByRole("tab", { name: "Explanation" });
    expect(diagramTab).toBeDefined();
    expect(explanationTab).toBeDefined();

    // Click Explanation tab
    await user.click(explanationTab);
    await waitFor(() => {
      expect(screen.getByText("Writing the explanation...")).toBeDefined();
    });
  });

  it("mounts canvas and hides FallbackList when width >= 768px", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockValidDesign,
    } as unknown as Response);

    renderWithClient(<DesignPage />);

    await waitFor(() => {
      expect(screen.getByText(/Design design_test_123/)).toBeDefined();
    });

    // FallbackList region is not mounted
    expect(screen.queryByRole("region", { name: "Component Flow Order" })).toBeNull();
  });

  it("mounts FallbackList in flow_order and unmounts canvas when width < 768px", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false, // mobile viewport
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockValidDesign,
    } as unknown as Response);

    renderWithClient(<DesignPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("region", { name: "Component Flow Order" })
      ).toBeDefined();
    });

    // FallbackList items follow flow_order: node_a ("Ingest Node") before node_b ("Buffer Node")
    const fallbackRegion = screen.getByRole("region", { name: "Component Flow Order" });
    const listItems = within(fallbackRegion).getAllByRole("button");
    expect(listItems.length).toBe(2);
    expect(listItems[0]?.textContent).toContain("Ingest Node");
    expect(listItems[1]?.textContent).toContain("Buffer Node");
  });

  it("selecting a node shows DetailPanel, and Escape / close clears selection", async () => {
    const user = userEvent.setup();

    // Use mobile viewport so we can easily click a node listitem
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockValidDesign,
    } as unknown as Response);

    renderWithClient(<DesignPage />);

    const fallbackRegion = await screen.findByRole("region", {
      name: "Component Flow Order",
    });

    const ingestButton = within(fallbackRegion).getByRole("button", {
      name: /^1\.\s+Ingest Node/,
    });
    expect(ingestButton).toBeDefined();

    // DetailPanel is initially not rendered
    expect(screen.queryByRole("complementary", { name: "Node Details" })).toBeNull();

    // Click Ingest Node to select
    await user.click(ingestButton);

    // DetailPanel opens
    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Node Details" })).toBeDefined();
      const detailPanel = screen.getByRole("complementary", { name: "Node Details" });
      expect(within(detailPanel).getByText("Ingests raw telemetry")).toBeDefined();
    });

    // Press Escape key
    fireEvent.keyDown(window, { key: "Escape" });

    // DetailPanel is cleared
    await waitFor(() => {
      expect(screen.queryByRole("complementary", { name: "Node Details" })).toBeNull();
    });

    // Select Buffer Node and test close button
    const bufferButton = within(fallbackRegion).getByRole("button", {
      name: /^2\.\s+Buffer Node/,
    });
    await user.click(bufferButton);
    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Node Details" })).toBeDefined();
    });

    const closeButton = screen.getByRole("button", { name: "Close details" });
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByRole("complementary", { name: "Node Details" })).toBeNull();
    });
  });

  it("displays friendly message and link home on 404 NOT_FOUND", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: {
          code: "NOT_FOUND",
          message: "We could not find that.",
        },
      }),
    } as unknown as Response);

    renderWithClient(<DesignPage />);

    await waitFor(() => {
      expect(screen.getByText("Design Not Found")).toBeDefined();
      expect(screen.getByText("We could not find that design.")).toBeDefined();
      expect(screen.getByRole("link", { name: "Back to home" })).toBeDefined();
    });
  });

  it("displays error message and Retry button on 503 LLM service error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: {
          code: "LLM_UNAVAILABLE",
          message: "The AI service is busy right now. Please try again in a minute.",
        },
      }),
    } as unknown as Response);

    renderWithClient(<DesignPage />);

    await waitFor(() => {
      expect(screen.getByText("Error Loading Design")).toBeDefined();
      expect(
        screen.getByText("The AI service is busy right now. Please try again in a minute.")
      ).toBeDefined();
      expect(screen.getByRole("button", { name: /retry/i })).toBeDefined();
    });
  });

  it("handles invalid payload (missing field) with error alert without crashing", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "design_test_123",
        // missing spec, brief, flow_order
      }),
    } as unknown as Response);

    renderWithClient(<DesignPage />);

    await waitFor(() => {
      expect(screen.getByText("Error Loading Design")).toBeDefined();
      expect(screen.getByRole("button", { name: /retry/i })).toBeDefined();
    });
  });

  it("renders hostile node strings literally without executing scripts", async () => {
    const hostileDesign = {
      ...mockValidDesign,
      spec: {
        ...mockValidDesign.spec,
        nodes: [
          {
            id: "hostile_node",
            name: "<script>alert(1)</script>",
            type: "api_gateway",
            role: "**bold** role",
            inputs: ["x".repeat(500)],
            outputs: [],
            tech_options: [],
            needs_model: false,
          },
        ],
        edges: [],
        constraints: [],
        entry_ids: ["hostile_node"],
        exit_ids: ["hostile_node"],
      },
      flow_order: ["hostile_node"],
    };

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false, // mobile list view
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => hostileDesign,
    } as unknown as Response);

    renderWithClient(<DesignPage />);

    await waitFor(() => {
      expect(screen.getByText("<script>alert(1)</script>")).toBeDefined();
      expect(screen.getByText("**bold** role")).toBeDefined();
    });

    // Assert literal text, no actual <script> tag injected in DOM
    const scripts = document.querySelectorAll("script");
    const scriptTexts = Array.from(scripts).map((s) => s.textContent);
    expect(scriptTexts.some((t) => t?.includes("alert(1)"))).toBe(false);
  });

  it("shows Notes and Not verified by checks for non-empty warnings and unverifiable requirements", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockValidDesign,
    } as unknown as Response);

    renderWithClient(<DesignPage />);

    await waitFor(() => {
      expect(screen.getByText("Notes")).toBeDefined();
      expect(screen.getByText("High fanout warning on ingress")).toBeDefined();
      expect(screen.getByText("Not verified by checks")).toBeDefined();
      expect(screen.getByText("Sub-millisecond SLA required")).toBeDefined();
    });
  });

  it("opens Explanation tab and fetches explanation once via POST", async () => {
    const mockExplanation = {
      overview: "Fetched explanation overview.",
      flow: [{ step: 1, node_id: "node_a", node_name: "Ingest Node", text: "Ingests data." }],
      parts: [{ node_id: "node_a", node_name: "Ingest Node", text: "Part A." }],
      checks: [{ constraint_id: "c1", text: "Check text." }],
      models: { nodes: [], text: "No part is marked as using an AI model." },
      source: "llm",
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("/explanation")) {
        return {
          ok: true,
          status: 200,
          json: async () => mockExplanation,
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => mockValidDesign,
      } as unknown as Response;
    });
    global.fetch = fetchMock;

    const user = userEvent.setup();
    renderWithClient(<DesignPage />);

    await waitFor(() => {
      expect(screen.getByText("Ingest Node")).toBeDefined();
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/explanation"))).toBe(false);

    // Click Explanation tab
    const explanationTab = screen.getByRole("tab", { name: /Explanation/i });
    await user.click(explanationTab);

    // Explanation is fetched and rendered
    await waitFor(() => {
      expect(screen.getByText("Fetched explanation overview.")).toBeDefined();
    });

    // Check that POST /explanation was called exactly once
    const explanationCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/explanation")
    );
    expect(explanationCalls.length).toBe(1);
    const callInit = explanationCalls[0]?.[1] as RequestInit | undefined;
    expect(callInit?.method).toBe("POST");
  });

  it("does not fetch explanation when DesignResponse already contains it", async () => {
    const existingExplanation = {
      overview: "Existing cached explanation.",
      flow: [{ step: 1, node_id: "node_a", node_name: "Ingest Node", text: "Ingests data." }],
      parts: [{ node_id: "node_a", node_name: "Ingest Node", text: "Part A." }],
      checks: [{ constraint_id: "c1", text: "Check text." }],
      models: { nodes: [], text: "No part is marked as using an AI model." },
      source: "llm",
    };

    const designWithExplanation = {
      ...mockValidDesign,
      explanation: existingExplanation,
    };

    const fetchMock = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => designWithExplanation,
      } as unknown as Response;
    });
    global.fetch = fetchMock;

    const user = userEvent.setup();
    renderWithClient(<DesignPage />);

    await waitFor(() => {
      expect(screen.getByText("Ingest Node")).toBeDefined();
    });

    // Click Explanation tab
    const explanationTab = screen.getByRole("tab", { name: /Explanation/i });
    await user.click(explanationTab);

    // Existing explanation is displayed immediately
    await waitFor(() => {
      expect(screen.getByText("Existing cached explanation.")).toBeDefined();
    });

    // Zero calls to /explanation POST
    const explanationCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/explanation")
    );
    expect(explanationCalls.length).toBe(0);
  });
});
