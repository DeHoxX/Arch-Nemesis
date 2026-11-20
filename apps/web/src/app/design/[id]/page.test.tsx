import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DesignPage from "./page";
import { BANNER_TEXT } from "@/components/Banner";
import * as exportLib from "@/lib/export";

let mockId = "design_test_123";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: mockId }),
  useRouter: () => ({ push: vi.fn() }),
}));

// jsdom does not implement WebGL2; mock Waves component cleanly
vi.mock("@/components/studio/Waves", () => ({
  default: (props: Record<string, unknown>) => (
    <div
      data-testid="waves-mock"
      aria-hidden="true"
      data-line-color={String(props.lineColor ?? "")}
      data-accent-color={String(props.accentColor ?? "")}
      data-line-style={String(props.lineStyle ?? "")}
    />
  ),
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
  title: "Telemetry Pipeline",
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

    // Default matchMedia mock for desktop (>= 768px) and standard motion
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width: 768px"),
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

    // Export buttons present next to Contact button (PNG and Markdown, no Print button)
    expect(
      screen.getByRole("button", { name: "Download diagram (PNG)" })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Download explanation (.md)" })
    ).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Print or save as PDF" })
    ).toBeNull();

    // Exact Banner text above tabs
    const exactBanner =
      "Structurally checked, not guaranteed to be the best design. This is not a compliance claim.";
    expect(screen.getByText(exactBanner)).toBeDefined();

    // Tabs "Block diagram", "Architecture", and "Explanation"
    const blockTab = screen.getByRole("tab", { name: "Block diagram" });
    const archTab = screen.getByRole("tab", { name: "Architecture" });
    const explanationTab = screen.getByRole("tab", { name: "Explanation" });
    expect(blockTab).toBeDefined();
    expect(archTab).toBeDefined();
    expect(explanationTab).toBeDefined();
    expect(blockTab.getAttribute("data-state")).toBe("active");

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

  it("mounts BlockFallbackList in flow_order and unmounts canvas when width < 768px", async () => {
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
        screen.getByRole("region", { name: "Layered Component Breakdown" })
      ).toBeDefined();
    });

    // BlockFallbackList items follow flow_order: node_a ("Ingest Node") before node_b ("Buffer Node")
    const fallbackRegion = screen.getByRole("region", { name: "Layered Component Breakdown" });
    const listItems = within(fallbackRegion).getAllByRole("listitem");
    expect(listItems.length).toBe(2);
    expect(listItems[0]?.textContent).toContain("Ingest Node");
    expect(listItems[1]?.textContent).toContain("Buffer Node");
  });

  it("mounts flat FallbackList in Component Flow Order region when Architecture tab is active on mobile (<768px)", async () => {
    const user = userEvent.setup();

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

    // Switch to Architecture tab
    const archTab = await screen.findByRole("tab", { name: "Architecture" });
    await user.click(archTab);

    // On mobile Architecture tab renders flat FallbackList in Component Flow Order region
    const fallbackSection = await screen.findByRole("region", {
      name: "Component Flow Order",
    });
    expect(fallbackSection).toBeDefined();

    // Verify flat flow order items (interactive FallbackList items have role="button")
    const listItems = within(fallbackSection).getAllByRole("button");
    expect(listItems.length).toBe(2);
    expect(listItems[0]?.textContent).toContain("Ingest Node");
    expect(listItems[0]?.textContent).toContain("Buffer Node");
    expect(listItems[1]?.textContent).toContain("Buffer Node");
    expect(listItems[1]?.textContent).toContain("None (exit node)");
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

    // Switch to Architecture tab to test interactive node selection and DetailPanel
    const archTab = await screen.findByRole("tab", { name: "Architecture" });
    await user.click(archTab);

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

  it("renders New design button in the header linking to /?new=1", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockValidDesign,
    } as unknown as Response);

    renderWithClient(<DesignPage />);

    await waitFor(() => {
      expect(screen.getByText("Ingest Node")).toBeDefined();
    });

    const newDesignLink = screen.getByRole("link", { name: "New design" });
    expect(newDesignLink).toBeDefined();
    expect(newDesignLink.getAttribute("href")).toBe("/?new=1");
  });

  describe("Phase 7C3b Refinement UI Integration", () => {
    const mockPatchSummary = {
      id: "patch_001",
      status: "proposed" as const,
      ops_count: 2,
      diff: {
        added_nodes: ["cache_node"],
        removed_nodes: [],
        changed_nodes: [],
        added_edges: [{ from: "node_a", to: "cache_node", flows: "cached payload" }],
        removed_edges: [],
        changed_edges: [],
        added_constraints: [],
        removed_constraints: [],
        changed_constraints: [],
        entry_changed: false,
        exit_changed: false,
      },
      issues: [],
      preview_spec: {
        ...mockValidDesign.spec,
        nodes: [
          ...mockValidDesign.spec.nodes,
          {
            id: "cache_node",
            name: "Cache Service",
            type: "cache",
            role: "Caches telemetry",
            inputs: ["metrics_raw"],
            outputs: ["cached payload"],
            tech_options: ["Redis"],
            needs_model: false,
          },
        ],
      },
    };

    const mockRefinedDesign = {
      ...mockValidDesign,
      current_version: 2,
      explanation: null,
    };

    const mockHistoricalDesign = {
      ...mockValidDesign,
      current_version: 1,
      explanation: null,
    };

    it("renders PatchCard and locks input when chat turn returns a patch", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.endsWith("/chat") && opts?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              message_id: "msg_turn_1",
              reply: "I added a cache service between ingest and buffer.",
              patch: mockPatchSummary,
            }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/messages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ messages: [], turns_used: 0, max_turns: 20 }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/versions")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              versions: [{ version_no: 1, created_at: "2026-11-01T00:00:00Z", change_note: "Initial version" }],
            }),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockValidDesign,
        } as unknown as Response);
      });
      global.fetch = fetchMock;

      renderWithClient(<DesignPage />);

      await waitFor(() => {
        expect(screen.getByText("Ingest Node")).toBeDefined();
      });

      const input = screen.getByLabelText("Refinement instruction input") as HTMLTextAreaElement;
      expect(input.disabled).toBe(false);

      await user.type(input, "Add a cache node");
      const sendButton = screen.getByLabelText("Send refinement request");
      await user.click(sendButton);

      // PatchCard is rendered
      await waitFor(() => {
        expect(screen.getByText("Proposed Change")).toBeDefined();
        expect(screen.getByText(/Added 1 node: cache_node/)).toBeDefined();
      });

      // Chat input is locked while patch is pending
      expect(input.disabled).toBe(true);
    });

    it("clears PatchCard and re-enables input when Reject is clicked", async () => {
      const user = userEvent.setup();
      let hasRejected = false;

      const fetchMock = vi.fn().mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes("/patches/patch_001/reject") && opts?.method === "POST") {
          hasRejected = true;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ id: "patch_001", status: "rejected" }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/chat") && opts?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              message_id: "msg_turn_1",
              reply: "Proposed cache addition.",
              patch: mockPatchSummary,
            }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/messages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ messages: [], turns_used: 0, max_turns: 20 }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/versions")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              versions: [{ version_no: 1, created_at: "2026-11-01T00:00:00Z", change_note: "Initial version" }],
            }),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockValidDesign,
        } as unknown as Response);
      });
      global.fetch = fetchMock;

      renderWithClient(<DesignPage />);

      await waitFor(() => {
        expect(screen.getByText("Ingest Node")).toBeDefined();
      });

      const input = screen.getByLabelText("Refinement instruction input") as HTMLTextAreaElement;
      await user.type(input, "Add cache");
      await user.click(screen.getByLabelText("Send refinement request"));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Reject proposed patch" })).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: "Reject proposed patch" }));

      await waitFor(() => {
        expect(screen.queryByText("Proposed Change")).toBeNull();
      });
      expect(hasRejected).toBe(true);
      expect(input.disabled).toBe(false);
    });

    it("opens ConfirmDropModal on needs_confirmation patch and sends confirm_drop: true on Accept", async () => {
      const user = userEvent.setup();
      let acceptPayload: { confirm_drop?: boolean } | null = null;

      const needsConfirmationPatch = {
        ...mockPatchSummary,
        status: "needs_confirmation" as const,
        issues: [
          {
            code: "E_BRIEF_CONSTRAINT_UNCOVERED",
            message: "Must process within cluster is no longer verified.",
            severity: "error" as const,
            ids: ["c1"],
          },
        ],
      };

      const fetchMock = vi.fn().mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes("/accept") && opts?.method === "POST") {
          acceptPayload = JSON.parse(opts.body as string);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockRefinedDesign,
          } as unknown as Response);
        }
        if (urlStr.endsWith("/chat") && opts?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              message_id: "msg_turn_drop",
              reply: "This drops an existing requirement check.",
              patch: needsConfirmationPatch,
            }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/messages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ messages: [], turns_used: 0, max_turns: 20 }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/versions")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              versions: [
                { version_no: 1, created_at: "2026-11-01T00:00:00Z", change_note: "Initial version" },
              ],
            }),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockValidDesign,
        } as unknown as Response);
      });
      global.fetch = fetchMock;

      renderWithClient(<DesignPage />);

      await waitFor(() => {
        expect(screen.getByText("Ingest Node")).toBeDefined();
      });

      const input = screen.getByLabelText("Refinement instruction input");
      await user.type(input, "Remove cluster constraint");
      await user.click(screen.getByLabelText("Send refinement request"));

      await waitFor(() => {
        expect(screen.getByText("Requires Confirmation")).toBeDefined();
      });

      // Click Accept on patch card -> triggers confirmation modal
      await user.click(screen.getByRole("button", { name: "Accept proposed patch" }));

      await waitFor(() => {
        expect(screen.getByText("Requirement Check Removal")).toBeDefined();
        expect(screen.getByText("Must process within cluster is no longer verified.")).toBeDefined();
      });

      const confirmButton = screen.getByRole("button", { name: "Confirm & Accept" }) as HTMLButtonElement;
      expect(confirmButton.disabled).toBe(true);

      // Check acknowledgment checkbox
      const checkbox = screen.getByLabelText("I understand this requirement will no longer be checked.");
      await user.click(checkbox);
      expect(confirmButton.disabled).toBe(false);

      // Confirm drop
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.queryByText("Requirement Check Removal")).toBeNull();
      });
      expect(acceptPayload).toEqual({ confirm_drop: true });
    });

    it("handles 409 STALE_PATCH by clearing pending patch and refetching design", async () => {
      const user = userEvent.setup();
      let designFetchCount = 0;

      const fetchMock = vi.fn().mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes("/accept") && opts?.method === "POST") {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({
              error: {
                code: "STALE_PATCH",
                message: "Patch was computed against an earlier version.",
              },
            }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/chat") && opts?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              message_id: "msg_stale",
              reply: "Candidate patch.",
              patch: mockPatchSummary,
            }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/messages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ messages: [], turns_used: 0, max_turns: 20 }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/versions")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ versions: [] }),
          } as unknown as Response);
        }
        designFetchCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockValidDesign,
        } as unknown as Response);
      });
      global.fetch = fetchMock;

      renderWithClient(<DesignPage />);

      await waitFor(() => {
        expect(screen.getByText("Ingest Node")).toBeDefined();
      });

      const initialFetchCount = designFetchCount;

      const input = screen.getByLabelText("Refinement instruction input");
      await user.type(input, "Change architecture");
      await user.click(screen.getByLabelText("Send refinement request"));

      await waitFor(() => {
        expect(screen.getByText("Proposed Change")).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: "Accept proposed patch" }));

      // PatchCard is cleared on STALE_PATCH and design is invalidated
      await waitFor(() => {
        expect(screen.queryByText("Proposed Change")).toBeNull();
        expect(designFetchCount).toBeGreaterThan(initialFetchCount);
      });
    });

    it("handles 409 PATCH_BLOCKED by transitioning PatchCard to blocked state with issues", async () => {
      const user = userEvent.setup();

      const fetchMock = vi.fn().mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes("/accept") && opts?.method === "POST") {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({
              error: {
                code: "PATCH_BLOCKED",
                message: "Patch violates validation rules.",
                issues: ["Cycle detected between node_a and node_b"],
              },
            }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/chat") && opts?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              message_id: "msg_blocked_turn",
              reply: "Candidate patch.",
              patch: mockPatchSummary,
            }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/messages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ messages: [], turns_used: 0, max_turns: 20 }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/versions")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ versions: [] }),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockValidDesign,
        } as unknown as Response);
      });
      global.fetch = fetchMock;

      renderWithClient(<DesignPage />);

      await waitFor(() => {
        expect(screen.getByText("Ingest Node")).toBeDefined();
      });

      const input = screen.getByLabelText("Refinement instruction input");
      await user.type(input, "Add cycle");
      await user.click(screen.getByLabelText("Send refinement request"));

      await waitFor(() => {
        expect(screen.getByText("Proposed Change")).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: "Accept proposed patch" }));

      // Transitions to Blocked by Rules with issues and Dismiss button only
      await waitFor(() => {
        expect(screen.getByText("Blocked by Rules")).toBeDefined();
        expect(screen.getByText("Cycle detected between node_a and node_b")).toBeDefined();
        expect(screen.getByRole("button", { name: "Dismiss blocked patch" })).toBeDefined();
      });
      expect(screen.queryByRole("button", { name: "Accept proposed patch" })).toBeNull();
    });

    it("handles 409 CONFIRMATION_REQUIRED by reopening ConfirmDropModal", async () => {
      const user = userEvent.setup();

      const fetchMock = vi.fn().mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes("/accept") && opts?.method === "POST") {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({
              error: {
                code: "CONFIRMATION_REQUIRED",
                message: "Dropping coverage requires explicit user confirmation.",
              },
            }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/chat") && opts?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              message_id: "msg_conf_req",
              reply: "Candidate proposal.",
              patch: mockPatchSummary,
            }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/messages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ messages: [], turns_used: 0, max_turns: 20 }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/versions")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ versions: [] }),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockValidDesign,
        } as unknown as Response);
      });
      global.fetch = fetchMock;

      renderWithClient(<DesignPage />);

      await waitFor(() => {
        expect(screen.getByText("Ingest Node")).toBeDefined();
      });

      const input = screen.getByLabelText("Refinement instruction input");
      await user.type(input, "Drop constraint");
      await user.click(screen.getByLabelText("Send refinement request"));

      await waitFor(() => {
        expect(screen.getByText("Proposed Change")).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: "Accept proposed patch" }));

      // Modal reopens on 409 CONFIRMATION_REQUIRED
      await waitFor(() => {
        expect(screen.getByText("Requirement Check Removal")).toBeDefined();
      });
    });

    it("renders CAP_TURNS and CAP_VERSIONS banners exclusively in RefinePanel", async () => {
      // 20 messages used (cap reached)
      const mockCappedMessages = Array.from({ length: 20 }, (_, i) => ({
        id: `m_${i}`,
        role: "user" as const,
        text: `Request ${i + 1}`,
        created_at: "2026-11-01T00:00:00Z",
      }));

      // 15 versions (cap reached)
      const mockCappedVersions = Array.from({ length: 15 }, (_, i) => ({
        version_no: i + 1,
        created_at: "2026-11-01T00:00:00Z",
        change_note: `Version ${i + 1}`,
      }));

      const fetchMock = vi.fn().mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.endsWith("/messages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ messages: mockCappedMessages, turns_used: 20, max_turns: 20 }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/versions")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ versions: mockCappedVersions }),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ...mockValidDesign, current_version: 15 }),
        } as unknown as Response);
      });
      global.fetch = fetchMock;

      renderWithClient(<DesignPage />);

      await waitFor(() => {
        expect(screen.getByText("Ingest Node")).toBeDefined();
      });

      // Assert CAP_TURNS banner appears exactly once on page (in RefinePanel)
      await waitFor(() => {
        const turnsBanners = screen.getAllByText(
          "This design has reached the limit of 20 change requests. Please contact our team to continue."
        );
        expect(turnsBanners.length).toBe(1);
      });

      // Restore buttons in VersionsPanel are disabled at cap 15
      await waitFor(() => {
        const restoreButtons = screen.queryAllByRole("button", { name: /Restore version/ });
        expect(restoreButtons.length).toBeGreaterThan(0);
        expect(restoreButtons.every((btn) => (btn as HTMLButtonElement).disabled)).toBe(true);
      });
    });

    it("disables chat in historical version view and restores past version via dialog", async () => {
      const user = userEvent.setup();
      let restorePayload: { version_no?: number } | null = null;

      const fetchMock = vi.fn().mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.endsWith("/restore") && opts?.method === "POST") {
          restorePayload = JSON.parse(opts.body as string);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ ...mockValidDesign, current_version: 3 }),
          } as unknown as Response);
        }
        if (urlStr.includes("/versions/1")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockHistoricalDesign,
          } as unknown as Response);
        }
        if (urlStr.endsWith("/messages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ messages: [], turns_used: 0, max_turns: 20 }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/versions")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              versions: [
                { version_no: 2, created_at: "2026-11-02T00:00:00Z", change_note: "v2 update" },
                { version_no: 1, created_at: "2026-11-01T00:00:00Z", change_note: "v1 baseline" },
              ],
            }),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ...mockValidDesign, current_version: 2 }),
        } as unknown as Response);
      });
      global.fetch = fetchMock;

      renderWithClient(<DesignPage />);

      await waitFor(() => {
        expect(screen.getByText("Ingest Node")).toBeDefined();
      });

      // Click "View" on historical version 1
      const viewV1Btn = await screen.findByRole("button", { name: "View version 1" });
      await user.click(viewV1Btn);

      // Header indicates historical view
      await waitFor(() => {
        expect(screen.getByText(/historical view/)).toBeDefined();
      });

      // RefinePanel alerts historical view and disables chat
      expect(screen.getByText("Refinement is only available on the latest version.")).toBeDefined();
      const input = screen.getByLabelText("Refinement instruction input") as HTMLTextAreaElement;
      expect(input.disabled).toBe(true);

      // Click "Restore" on version 1
      const restoreV1Btn = await screen.findByRole("button", { name: "Restore version 1" });
      await user.click(restoreV1Btn);

      // Restore confirmation dialog opens
      await waitFor(() => {
        expect(screen.getByText("Restore Design Version")).toBeDefined();
        expect(
          screen.getByText(
            "Are you sure you want to restore v1? This counts as a new version toward the maximum of 15."
          )
        ).toBeDefined();
      });

      // Confirm restore
      await user.click(screen.getByRole("button", { name: "Confirm Restore v1" }));

      await waitFor(() => {
        expect(screen.queryByText("Restore Design Version")).toBeNull();
      });
      expect(restorePayload).toEqual({ version_no: 1 });
    });

    it("displays contextual note on PatchCard when Explanation tab is active", async () => {
      const user = userEvent.setup();

      const fetchMock = vi.fn().mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.endsWith("/chat") && opts?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              message_id: "msg_note_test",
              reply: "Candidate patch.",
              patch: mockPatchSummary,
            }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/messages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ messages: [], turns_used: 0, max_turns: 20 }),
          } as unknown as Response);
        }
        if (urlStr.endsWith("/versions")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ versions: [] }),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockValidDesign,
        } as unknown as Response);
      });
      global.fetch = fetchMock;

      renderWithClient(<DesignPage />);

      await waitFor(() => {
        expect(screen.getByText("Ingest Node")).toBeDefined();
      });

      const input = screen.getByLabelText("Refinement instruction input");
      await user.type(input, "Propose change");
      await user.click(screen.getByLabelText("Send refinement request"));

      await waitFor(() => {
        expect(screen.getByText("Proposed Change")).toBeDefined();
      });

      // Switch to Explanation tab
      const explanationTab = screen.getByRole("tab", { name: /Explanation/i });
      await user.click(explanationTab);

      // Note appears on PatchCard
      await waitFor(() => {
        expect(
          screen.getByText("Switch to Block diagram or Architecture tab to review the visual diff.")
        ).toBeDefined();
      });
    });

    it("fetches suggestions on 'What can we add or remove?', applies suggestion to set pending patch, displays PatchCard with Accept, and locks chat input", async () => {
      const user = userEvent.setup();
      const mockSuggestion = {
        patch_id: "sugg_101",
        title: "Add telemetry monitor",
        reason: "Tracks health status",
        status: "proposed" as const,
        diff: {
          added_nodes: ["monitor_node"],
          removed_nodes: [],
          changed_nodes: [],
          added_edges: [],
          removed_edges: [],
          changed_edges: [],
          added_constraints: [],
          removed_constraints: [],
          changed_constraints: [],
          entry_changed: false,
          exit_changed: false,
        },
        preview_spec: {
          ...mockValidDesign.spec,
          nodes: [
            ...mockValidDesign.spec.nodes,
            {
              id: "monitor_node",
              name: "Monitor Node",
              type: "service",
              role: "Tracks health",
              inputs: [],
              outputs: [],
              tech_options: [],
              needs_model: false,
            },
          ],
        },
        issues: [],
      };

      const fetchMock = vi.fn().mockImplementation((url) => {
        if (url.includes("/suggestions")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              suggestions: [mockSuggestion],
              discarded_count: 0,
              discarded_issue_codes: [],
            }),
          } as unknown as Response);
        }
        if (url.includes("/messages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ messages: [], turns_used: 0, max_turns: 20 }),
          } as unknown as Response);
        }
        if (url.includes("/versions")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ versions: [] }),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockValidDesign,
        } as unknown as Response);
      });
      global.fetch = fetchMock;

      renderWithClient(<DesignPage />);

      await waitFor(() => {
        expect(screen.getByText("Ingest Node")).toBeDefined();
      });

      // 1. Click 'What can we add or remove?'
      const askSuggestionsBtn = screen.getByRole("button", {
        name: "Request architectural suggestions",
      });
      expect(askSuggestionsBtn).toBeDefined();
      await user.click(askSuggestionsBtn);

      // 2. Suggestion card rendered with plain text and badge
      await waitFor(() => {
        expect(screen.getByText("Add telemetry monitor")).toBeDefined();
      });
      expect(screen.getByText("Suggestion (opinion, not verified)")).toBeDefined();
      expect(screen.getByText("Tracks health status")).toBeDefined();

      // 3. Click 'Apply' on the suggestion
      const applyBtn = screen.getByRole("button", {
        name: "Apply suggestion: Add telemetry monitor",
      });
      await user.click(applyBtn);

      // 4. pendingPatch is set: PatchCard appears with 'Proposed Change' and 'Accept proposed patch'
      await waitFor(() => {
        expect(screen.getByText("Proposed Change")).toBeDefined();
      });
      expect(screen.getByRole("button", { name: "Accept proposed patch" })).toBeDefined();

      // 5. Chat input is locked while patch is pending
      const chatInput = screen.getByLabelText("Refinement instruction input") as HTMLTextAreaElement;
      expect(chatInput.disabled).toBe(true);

      // 6. Clicking 'Reject proposed patch' clears the pending patch
      const rejectBtn = screen.getByRole("button", { name: "Reject proposed patch" });
      await user.click(rejectBtn);

      await waitFor(() => {
        expect(screen.queryByText("Proposed Change")).toBeNull();
      });
      expect(chatInput.disabled).toBe(false);
    });

    it("fills chat draft on node shortcut click without sending chat request, and disables shortcuts when patch is pending", async () => {
      const user = userEvent.setup();
      const chatCalls: string[] = [];

      // Use mobile viewport so node selection uses FallbackList and avoids jsdom d3-zoom mouse event errors
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

      const fetchMock = vi.fn().mockImplementation((url, opts) => {
        if (url.includes("/chat")) {
          chatCalls.push(opts?.body);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              message_id: "m_1",
              reply: "Chat response",
              patch: null,
            }),
          } as unknown as Response);
        }
        if (url.includes("/messages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ messages: [], turns_used: 0, max_turns: 20 }),
          } as unknown as Response);
        }
        if (url.includes("/versions")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ versions: [] }),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockValidDesign,
        } as unknown as Response);
      });
      global.fetch = fetchMock;

      renderWithClient(<DesignPage />);

      await waitFor(() => {
        expect(screen.getByText("Ingest Node")).toBeDefined();
      });

      // Switch to Architecture tab
      const archTab = await screen.findByRole("tab", { name: /Architecture/i });
      await user.click(archTab);

      // Select Ingest Node via FallbackList
      const fallbackRegion = await screen.findByRole("region", {
        name: "Component Flow Order",
      });
      const ingestButton = within(fallbackRegion).getByRole("button", {
        name: /^1\.\s+Ingest Node/,
      });
      await user.click(ingestButton);

      // DetailPanel opens with shortcut buttons
      const askBtn = await screen.findByRole("button", { name: "Ask about this node" });
      const removeBtn = await screen.findByRole("button", { name: "Remove this node" });
      expect(askBtn).toBeDefined();
      expect(removeBtn).toBeDefined();

      // Click 'Ask about this node'
      await user.click(askBtn);

      // Chat input is filled with exact template
      const chatInput = screen.getByLabelText("Refinement instruction input") as HTMLTextAreaElement;
      expect(chatInput.value).toBe(
        "Tell me about the 'Ingest Node' part: why is it needed and what could go wrong?",
      );

      // Zero chat network calls made (NEVER auto-sends)
      expect(chatCalls).toHaveLength(0);

      // Click 'Remove this node'
      await user.click(removeBtn);
      expect(chatInput.value).toBe(
        "Remove the 'Ingest Node' part and fix the connections around it",
      );
      expect(chatCalls).toHaveLength(0);

      // Propose a change to make a patch pending
      await user.type(chatInput, "Add cache");
      const sendBtn = screen.getByLabelText("Send refinement request");

      fetchMock.mockImplementationOnce((url) => {
        if (url.includes("/chat")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              message_id: "m_2",
              reply: "Proposed cache node",
              patch: mockPatchSummary,
            }),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockValidDesign,
        } as unknown as Response);
      });

      await user.click(sendBtn);

      await waitFor(() => {
        expect(screen.getByText("Proposed Change")).toBeDefined();
      });

      // Shortcut buttons are now disabled because a patch is pending
      expect((screen.getByRole("button", { name: "Ask about this node" }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: "Remove this node" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("opens Edge Details panel when an edge label is clicked, mutually exclusive with node details, and clears on export (Stage 1B, D-325)", async () => {
      let edgeDetailsVisibleAtExportCall: boolean | null = null;
      let nodeDetailsVisibleAtExportCall: boolean | null = null;

      const exportPngSpy = vi
        .spyOn(exportLib, "exportDiagramToPng")
        .mockImplementation(async () => {
          // Capture DOM state at the exact moment exportDiagramToPng is invoked
          edgeDetailsVisibleAtExportCall =
            screen.queryByRole("complementary", { name: "Edge Details" }) !== null;
          nodeDetailsVisibleAtExportCall =
            screen.queryByRole("complementary", { name: "Node Details" }) !== null;
        });

      global.fetch = vi.fn().mockImplementation((url: RequestInfo | URL) => {
        if (String(url).includes("/versions")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [{ version_no: 1, created_at: "2026-03-30T10:00:00Z" }],
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockValidDesign,
        } as unknown as Response);
      });

      const user = userEvent.setup();
      renderWithClient(<DesignPage />);

      await waitFor(() => {
        const titleEl = screen.getByText(/Design design_test_123/);
        expect(titleEl).toBeDefined();
        expect(titleEl.textContent?.trim().length).toBeGreaterThan(0);
      });

      // Switch to Architecture tab (Radix UI tab requires userEvent)
      const archTab = await screen.findByRole("tab", { name: "Architecture" });
      expect(archTab).toBeDefined();
      await user.click(archTab);

      // Select node_a (use fireEvent to avoid d3-zoom mousedown in jsdom)
      const nodeBtn = await screen.findByRole("button", { name: /Node: Ingest Node/ });
      expect(nodeBtn).toBeDefined();
      fireEvent.click(nodeBtn);

      await waitFor(() => {
        const nodePanel = screen.getByRole("complementary", { name: "Node Details" });
        expect(nodePanel).toBeDefined();
        expect(nodePanel.textContent?.trim().length).toBeGreaterThan(0);
      });

      // Now click edge label button (use fireEvent to avoid d3-zoom mousedown in jsdom)
      const edgeBtn = await screen.findByRole("button", { name: /Flow: Raw metrics stream/ });
      expect(edgeBtn).toBeDefined();
      fireEvent.click(edgeBtn);

      await waitFor(() => {
        const edgePanel = screen.getByRole("complementary", { name: "Edge Details" });
        expect(edgePanel).toBeDefined();
        expect(edgePanel.textContent?.trim().length).toBeGreaterThan(0);
        expect(screen.queryByRole("complementary", { name: "Node Details" })).toBeNull();
      });

      // Export PNG clears edge selection so diagram is not exported in dimmed state
      const exportPngBtn = screen.getByRole("button", { name: "Download diagram (PNG)" });
      expect(exportPngBtn).toBeDefined();
      fireEvent.click(exportPngBtn);

      // Verify exportDiagramToPng was invoked and that selections were cleared BEFORE invocation
      await waitFor(() => {
        expect(exportPngSpy).toHaveBeenCalledTimes(1);
      });

      expect(edgeDetailsVisibleAtExportCall).toBe(false);
      expect(nodeDetailsVisibleAtExportCall).toBe(false);
      expect(screen.queryByRole("complementary", { name: "Edge Details" })).toBeNull();
      expect(screen.queryByRole("complementary", { name: "Node Details" })).toBeNull();
    });

    it("renders FlowPlaybackBar in Architecture tab, omits it in Block diagram tab, and clears playback on PNG export (Stage 1C, D-328..D-331)", async () => {
      let playbackActiveAtExportCall: boolean | null = null;
      const exportPngSpy = vi
        .spyOn(exportLib, "exportDiagramToPng")
        .mockImplementation(async () => {
          // Verify playback counter is cleared when export is invoked
          playbackActiveAtExportCall = screen.queryByText(/Step \d+ of/) !== null;
        });

      global.fetch = vi.fn().mockImplementation((url: RequestInfo | URL) => {
        if (String(url).includes("/versions")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [{ version_no: 1, created_at: "2026-03-30T10:00:00Z" }],
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockValidDesign,
        } as unknown as Response);
      });

      const user = userEvent.setup();
      renderWithClient(<DesignPage />);

      await waitFor(() => {
        expect(screen.getByText(/Design design_test_123/)).toBeDefined();
      });

      // 1. In default Block diagram tab, FlowPlaybackBar is NOT present
      expect(screen.queryByRole("contentinfo", { name: "Flow playback controls" })).toBeNull();
      expect(screen.queryByText(/Ready · \d+ flow/)).toBeNull();

      // 2. Switch to Architecture tab
      const archTab = await screen.findByRole("tab", { name: "Architecture" });
      await user.click(archTab);

      // Playback bar is now mounted
      const playbackBar = await screen.findByRole("contentinfo", { name: "Flow playback controls" });
      expect(playbackBar).toBeDefined();
      expect(screen.getByText("1 flow")).toBeDefined();

      // Open Flow panel
      const flowToggle = screen.getByRole("button", { name: /toggle flow playback/i });
      fireEvent.click(flowToggle);

      // Start playback (click Next)
      const nextBtn = screen.getByRole("button", { name: "Start flow playback" });
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText("Step 1 of 1")).toBeDefined();
      });

      // 3. Export PNG clears playback state
      const exportPngBtn = screen.getByRole("button", { name: "Download diagram (PNG)" });
      fireEvent.click(exportPngBtn);

      await waitFor(() => {
        expect(exportPngSpy).toHaveBeenCalledTimes(1);
      });

      // Captured state during exportDiagramToPng call must show playback was not active
      expect(playbackActiveAtExportCall).toBe(false);
      expect(screen.queryByText("Step 1 of 1")).toBeNull();
    });

    it("renders Full screen button in both Block diagram and Architecture tabs and preserves exact Banner text (Stage 1C+, D-333)", async () => {
      const user = userEvent.setup();

      const originalFullscreenEnabled = document.fullscreenEnabled;
      const originalRequestFullscreen = HTMLElement.prototype.requestFullscreen;

      try {
        // Ensure desktop viewport
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

        // Mock Fullscreen API
        Object.defineProperty(document, "fullscreenEnabled", {
          writable: true,
          configurable: true,
          value: true,
        });

        const requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
        HTMLElement.prototype.requestFullscreen = requestFullscreenMock;

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => mockValidDesign,
        } as unknown as Response);

        renderWithClient(<DesignPage />);

        // Verify Banner text is exact, waiting for query to resolve and page to load
        const bannerElement = await screen.findByText(BANNER_TEXT);
        expect(bannerElement).toBeDefined();
        expect(bannerElement.textContent?.trim().length).toBeGreaterThan(0);

        // 1. In Block diagram tab, Full screen button is present
        const fsBtnBlock = await screen.findByRole("button", { name: "Full screen" });
        expect(fsBtnBlock).toBeDefined();

        // Click Full screen
        fireEvent.click(fsBtnBlock);
        expect(requestFullscreenMock).toHaveBeenCalled();

        // 2. In Architecture tab, Full screen button is present
        const archTab = await screen.findByRole("tab", { name: "Architecture" });
        await user.click(archTab);

        const fsBtnArch = await screen.findByRole("button", { name: "Full screen" });
        expect(fsBtnArch).toBeDefined();

        // 3. In Explanation tab, Full screen button is NOT present
        const explanationTab = await screen.findByRole("tab", { name: "Explanation" });
        await user.click(explanationTab);

        expect(screen.queryByRole("button", { name: "Full screen" })).toBeNull();
      } finally {
        Object.defineProperty(document, "fullscreenEnabled", {
          writable: true,
          configurable: true,
          value: originalFullscreenEnabled,
        });
        HTMLElement.prototype.requestFullscreen = originalRequestFullscreen;
      }
    });

    it("applies grid-rows-1 and items-stretch to architecture grid container in fullscreen (D-359)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockValidDesign,
      } as unknown as Response);

      const user = userEvent.setup();
      const originalFullscreenEnabled = document.fullscreenEnabled;
      const originalRequestFullscreen = HTMLElement.prototype.requestFullscreen;

      try {
        // Ensure desktop viewport
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

        Object.defineProperty(document, "fullscreenEnabled", {
          writable: true,
          configurable: true,
          value: true,
        });

        const requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
        HTMLElement.prototype.requestFullscreen = requestFullscreenMock;

        const { container } = renderWithClient(<DesignPage />);
        await screen.findByText(BANNER_TEXT);

        // Switch to architecture tab
        const archTab = await screen.findByRole("tab", { name: "Architecture" });
        await user.click(archTab);

        const archTabContent = await screen.findByRole("tabpanel", { name: "Architecture" });
        const fullscreenWrapper = archTabContent.parentElement;
        expect(fullscreenWrapper).not.toBeNull();

        // Enter fullscreen
        const fsBtnArch = await screen.findByRole("button", { name: "Full screen" });
        await user.click(fsBtnArch);

        expect(requestFullscreenMock).toHaveBeenCalled();

        // Simulate fullscreenchange event with the actual fullscreen wrapper element
        act(() => {
          Object.defineProperty(document, "fullscreenElement", {
            writable: true,
            configurable: true,
            value: fullscreenWrapper,
          });
          document.dispatchEvent(new Event("fullscreenchange"));
        });

        await waitFor(() => {
          const wrapperInFullscreen = container.querySelector(".fixed.inset-0.z-50");
          expect(wrapperInFullscreen).not.toBeNull();
          expect(wrapperInFullscreen).toBe(fullscreenWrapper);

          const grid = container.querySelector(".grid-rows-1");
          expect(grid).not.toBeNull();
          expect(grid?.className).toContain("items-stretch");
          expect(grid?.className).toContain("flex-1");
          expect(grid?.className).toContain("min-h-0");
        });
      } finally {
        Object.defineProperty(document, "fullscreenEnabled", {
          writable: true,
          configurable: true,
          value: originalFullscreenEnabled,
        });
        HTMLElement.prototype.requestFullscreen = originalRequestFullscreen;
        Object.defineProperty(document, "fullscreenElement", {
          writable: true,
          configurable: true,
          value: null,
        });
      }
    });
  });

  describe("Studio Styling & Waves Gating on Design Page (D-356)", () => {
    it("renders dark studio background classes (studio-grid-bg, isolate), circuits, and zero <img> tags on ready view", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockValidDesign,
      } as unknown as Response);

      const { container } = renderWithClient(<DesignPage />);

      await screen.findByText(BANNER_TEXT);

      const mainEl = container.querySelector("main");
      expect(mainEl).not.toBeNull();
      expect(mainEl?.className).toContain("studio-grid-bg");
      expect(mainEl?.className).toContain("isolate");
      expect(mainEl?.className).toContain("bg-page-bg");
      expect(mainEl?.className).not.toContain("bg-white");

      const circuits = screen.getByTestId("studio-corner-circuits");
      expect(circuits).toBeDefined();
      expect(circuits.className).toContain("z-0");

      expect(container.querySelectorAll("img")).toHaveLength(0);
    });

    it("renders header-band Waves layer on desktop when reduced-motion is false", async () => {
      vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
        matches: query.includes("min-width: 768px"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockValidDesign,
      } as unknown as Response);

      renderWithClient(<DesignPage />);

      await screen.findByText(BANNER_TEXT);

      await waitFor(() => {
        const wavesLayer = screen.getByTestId("design-waves-layer");
        expect(wavesLayer).toBeDefined();
        expect(wavesLayer.className).toContain("z-0");
        expect(wavesLayer.className).toContain("pointer-events-none");
        expect(wavesLayer.className).toContain("inset-x-0");
        expect(wavesLayer.className).toContain("top-0");
        expect(wavesLayer.className).toContain("h-[260px]");
        expect(wavesLayer.className).not.toContain("inset-0");
      });
    });

    it("does not render design-waves-layer when prefers-reduced-motion is true", async () => {
      vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockValidDesign,
      } as unknown as Response);

      renderWithClient(<DesignPage />);

      await screen.findByText(BANNER_TEXT);

      expect(screen.queryByTestId("design-waves-layer")).toBeNull();
    });

    it("does not render design-waves-layer on mobile (<768px)", async () => {
      vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
        matches: query !== "(min-width: 768px)" && query !== "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockValidDesign,
      } as unknown as Response);

      renderWithClient(<DesignPage />);

      // On mobile BlockFallbackList is rendered in Layered Component Breakdown region
      const fallbackSection = await screen.findByRole("region", {
        name: "Layered Component Breakdown",
      });
      expect(within(fallbackSection).getByRole("heading", { name: "Buffer Node" })).toBeDefined();
      expect(screen.queryByTestId("design-waves-layer")).toBeNull();
    });
  });
});
