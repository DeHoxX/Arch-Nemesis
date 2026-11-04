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
    const listItems = within(fallbackRegion).getAllByRole("listitem");
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
            json: async () => ({ messages: [] }),
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
            json: async () => ({ messages: [] }),
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
            json: async () => ({ messages: [] }),
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
            json: async () => ({ messages: [] }),
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
            json: async () => ({ messages: [] }),
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
            json: async () => ({ messages: [] }),
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
            json: async () => ({ messages: mockCappedMessages }),
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
            json: async () => ({ messages: [] }),
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
            json: async () => ({ messages: [] }),
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
  });
});
