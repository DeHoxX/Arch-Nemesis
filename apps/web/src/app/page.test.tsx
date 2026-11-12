import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";
import { AppShell } from "../components/shell/AppShell";
import { INTAKE_STORAGE_KEY } from "../lib/intakeStorage";

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/",
}));

// jsdom does not implement WebGL2; mock Waves component cleanly
vi.mock("../components/studio/Waves", () => ({
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
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("HomePage Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.innerWidth = 1024;
    mockPush.mockClear();
    mockReplace.mockClear();
    mockSearchParams = new URLSearchParams();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("renders exact heading, placeholder, capsule tag, corner circuits, waves, and Send button (D-347, D-349, D-351)", async () => {
    renderWithClient(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: "What are we building today?",
        level: 1,
      }),
    ).toBeDefined();

    expect(screen.getByText("SYSTEM DESIGN STUDIO")).toBeDefined();
    expect(screen.getByText(/Start with an idea/)).toBeDefined();

    const expectedPlaceholder = "Describe the system you have in mind...";
    expect(screen.getByPlaceholderText(expectedPlaceholder)).toBeDefined();

    expect(screen.getByRole("button", { name: "Send" })).toBeDefined();
    expect(screen.getByText("Plain language · Up to 4,000 characters")).toBeDefined();
    expect(screen.getByText("NEED A STARTING POINT?")).toBeDefined();
    expect(screen.getByText("DESCRIBE → CLARIFY → GENERATE")).toBeDefined();

    // Corner circuits element present with aria-hidden, pointer-events-none, and z-0 (D-349)
    const circuits = screen.getByTestId("studio-corner-circuits");
    expect(circuits.getAttribute("aria-hidden")).toBe("true");
    expect(circuits.className).toContain("pointer-events-none");
    expect(circuits.className).toContain("z-0");
    expect(circuits.className).not.toContain("-z-10");

    // Waves layer mounted on desktop when reduced-motion is not set (D-351)
    await waitFor(() => {
      const wavesLayer = screen.getByTestId("home-waves-layer");
      expect(wavesLayer.getAttribute("aria-hidden")).toBe("true");
      expect(wavesLayer.className).toContain("pointer-events-none");
      expect(wavesLayer.className).toContain("z-0");
      expect(screen.getByTestId("waves-mock")).toBeDefined();
    });

    // 3 starter buttons populated post-mount in horizontal grid
    await waitFor(() => {
      const starterButtons = screen.getAllByRole("button").filter((btn) =>
        btn.querySelector(".lucide-arrow-up-right"),
      );
      expect(starterButtons).toHaveLength(3);
    });
  });

  it("does NOT render Waves layer when prefers-reduced-motion: reduce is active (D-351)", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion") || query.includes("min-width: 768px"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    renderWithClient(<HomePage />);

    // Heading and composer still render normally
    expect(screen.getByRole("heading", { name: "What are we building today?" })).toBeDefined();
    expect(screen.getByPlaceholderText(/Describe the system/)).toBeDefined();

    // Waves layer must remain absent
    expect(screen.queryByTestId("home-waves-layer")).toBeNull();
    expect(screen.queryByTestId("waves-mock")).toBeNull();
  });

  it("does NOT render Waves layer below 768px viewport width (D-351)", async () => {
    window.innerWidth = 500;
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    renderWithClient(<HomePage />);

    expect(screen.getByRole("heading", { name: "What are we building today?" })).toBeDefined();
    expect(screen.getByPlaceholderText(/Describe the system/)).toBeDefined();

    expect(screen.queryByTestId("home-waves-layer")).toBeNull();
    expect(screen.queryByTestId("waves-mock")).toBeNull();
  });

  it("handles intake turn non-optimistically and displays follow-up questions in message stream", async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "needs_info",
        session_id: "session_abc",
        round: 1,
        questions: [
          "Who are the primary internal users?",
          "What databases or external APIs are connected?",
        ],
        brief: null,
      }),
    } as unknown as Response);

    renderWithClient(<HomePage />);

    const textarea = screen.getByPlaceholderText(/Describe the system/);
    await user.type(textarea, "I need a customer support bot.");

    const sendButton = screen.getByRole("button", { name: /send/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText("Who are the primary internal users?")).toBeDefined();
      expect(
        screen.getByText("What databases or external APIs are connected?"),
      ).toBeDefined();
      // Committed user message present after success
      expect(screen.getByText("I need a customer support bot.")).toBeDefined();
    });
  });

  it("displays brief card with real fields and hides empty sections", async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "ready",
        session_id: "session_ready_1",
        round: 2,
        questions: [],
        brief: {
          summary: "Automated legal precedent search system",
          users: "Licensed paralegals and attorneys",
          data_involved: ["Court filings", "Statutory databases"],
          domain_hint: "legal",
          stated_constraints: [
            { id: "bc1", text: "All drafts must be approved by counsel" },
          ],
          assumptions: ["Documents are stored as PDFs"],
          numbers_given: [
            { label: "Daily queries", value: "2500", unit: "searches" },
          ],
          unverifiable_requirements: ["99.99% system availability"],
        },
      }),
    } as unknown as Response);

    renderWithClient(<HomePage />);

    const textarea = screen.getByPlaceholderText(/Describe the system/);
    await user.type(textarea, "Build a legal precedent search engine.");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText("Requirement Brief")).toBeDefined();
      expect(screen.getByText("Automated legal precedent search system")).toBeDefined();
      expect(screen.getByText("Licensed paralegals and attorneys")).toBeDefined();
      expect(screen.getByText("Court filings")).toBeDefined();
      expect(
        screen.getByText("All drafts must be approved by counsel"),
      ).toBeDefined();
      expect(screen.getByText("Documents are stored as PDFs")).toBeDefined();
      expect(screen.getByText("Daily queries:")).toBeDefined();
      expect(screen.getByText("2500 searches")).toBeDefined();
      expect(screen.getByText("Not verified by checks")).toBeDefined();
      expect(screen.getByText("99.99% system availability")).toBeDefined();
    });
  });

  it("renders hostile strings literally without executing scripts or injecting HTML", async () => {
    const user = userEvent.setup();

    const hostileSummary = "<script>alert('xss')</script>";
    const hostileConstraint = "**bold text** with <img src=x onerror=alert(1)>";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "ready",
        session_id: "session_hostile",
        round: 1,
        questions: [],
        brief: {
          summary: hostileSummary,
          users: "Auditors",
          data_involved: [],
          domain_hint: "",
          stated_constraints: [{ id: "bc1", text: hostileConstraint }],
          assumptions: [],
          numbers_given: [],
          unverifiable_requirements: [],
        },
      }),
    } as unknown as Response);

    const { container } = renderWithClient(<HomePage />);

    const textarea = screen.getByPlaceholderText(/Describe the system/);
    await user.type(textarea, "Testing XSS resistance");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(hostileSummary)).toBeDefined();
      expect(screen.getByText(hostileConstraint)).toBeDefined();
    });

    // Ensure no <script> or <img> tags were injected
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();

    // Verify empty sections are hidden
    expect(screen.queryByText("Data Involved")).toBeNull();
    expect(screen.queryByText("Assumptions")).toBeNull();
    expect(screen.queryByText("Numbers Given")).toBeNull();
    expect(screen.queryByText("Not verified by checks")).toBeNull();
  });

  it("navigates to /design/{id} on successful design generation", async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/intake/turn") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "ready",
            session_id: "session_gen_success",
            round: 1,
            questions: [],
            brief: {
              summary: "Telemetry Pipeline",
              users: "Ops engineers",
              data_involved: [],
              domain_hint: "",
              stated_constraints: [],
              assumptions: [],
              numbers_given: [],
              unverifiable_requirements: [],
            },
          }),
        } as unknown as Response;
      }

      if (url === "/api/designs") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "design_abc_123",
            intake_session_id: "session_gen_success",
            title: "Telemetry Pipeline",
            current_version: 1,
            brief: {
              summary: "Telemetry Pipeline",
              users: "Ops engineers",
              data_involved: [],
              domain_hint: "",
              stated_constraints: [],
              assumptions: [],
              numbers_given: [],
              unverifiable_requirements: [],
            },
            spec: {
              nodes: [
                {
                  id: "n1",
                  name: "Ingest",
                  type: "gateway",
                  role: "Ingests metrics",
                  inputs: [],
                  outputs: [],
                  tech_options: [],
                  needs_model: false,
                },
              ],
              edges: [],
              constraints: [],
              entry_ids: ["n1"],
              exit_ids: ["n1"],
            },
            warnings: [],
            flow_order: ["n1"],
            prompt_version: "architect_v1",
          }),
        } as unknown as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithClient(<HomePage />);

    const textarea = screen.getByPlaceholderText(/Describe the system/);
    await user.type(textarea, "Need a telemetry ingestion system");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate design" })).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Generate design" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/design/design_abc_123");
    });
  });

  it("displays API message, issues, and Retry button on 422 DESIGN_FAILED", async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/intake/turn") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "ready",
            session_id: "session_failed_design",
            round: 1,
            questions: [],
            brief: {
              summary: "Edge computing cluster",
              users: "IoT devices",
              data_involved: [],
              domain_hint: "",
              stated_constraints: [],
              assumptions: [],
              numbers_given: [],
              unverifiable_requirements: [],
            },
          }),
        } as unknown as Response;
      }

      if (url === "/api/designs") {
        return {
          ok: false,
          status: 422,
          json: async () => ({
            error: {
              code: "DESIGN_FAILED",
              message:
                "I could not produce a design that passes all checks. Please rephrase your need or try again.",
              issues: [
                "Cycle detected in component flow",
                "Node count exceeds maximum limit",
              ],
            },
          }),
        } as unknown as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithClient(<HomePage />);

    const textarea = screen.getByPlaceholderText(/Describe the system/);
    await user.type(textarea, "Create edge cluster");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate design" })).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Generate design" }));

    await waitFor(() => {
      expect(screen.getByText("Generation Failed")).toBeDefined();
      expect(
        screen.getByText(
          "I could not produce a design that passes all checks. Please rephrase your need or try again.",
        ),
      ).toBeDefined();
      expect(
        screen.getByText("Cycle detected in component flow"),
      ).toBeDefined();
      expect(
        screen.getByText("Node count exceeds maximum limit"),
      ).toBeDefined();
      expect(screen.getByRole("button", { name: /retry/i })).toBeDefined();
    });
  });

  it("displays friendly error message and Retry button on design LLM service error", async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "/api/intake/turn") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "ready",
            session_id: "session_llm_error",
            round: 1,
            questions: [],
            brief: {
              summary: "Financial pipeline",
              users: "Brokers",
              data_involved: [],
              domain_hint: "",
              stated_constraints: [],
              assumptions: [],
              numbers_given: [],
              unverifiable_requirements: [],
            },
          }),
        } as unknown as Response;
      }

      if (url === "/api/designs") {
        return {
          ok: false,
          status: 503,
          json: async () => ({
            error: {
              code: "LLM_UNAVAILABLE",
              message:
                "LLM service is currently unavailable. Please try again shortly.",
            },
          }),
        } as unknown as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithClient(<HomePage />);

    const textarea = screen.getByPlaceholderText(/Describe the system/);
    await user.type(textarea, "Financial trading system");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate design" })).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Generate design" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "LLM service is currently unavailable. Please try again shortly.",
        ),
      ).toBeDefined();
      expect(screen.getByRole("button", { name: /retry/i })).toBeDefined();
    });
  });

  it("non-optimistic intake failure: keeps inputText, shows live error and Retry, commits zero bubbles (D-348)", async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: {
          code: "LLM_UNAVAILABLE",
          message: "LLM service is currently unavailable. Please try again shortly.",
        },
      }),
    } as unknown as Response);

    renderWithClient(<HomePage />);

    const textarea = screen.getByPlaceholderText(/Describe the system/) as HTMLTextAreaElement;
    await user.type(textarea, "Telemetry logging pipeline");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(
        screen.getByText("LLM service is currently unavailable. Please try again shortly."),
      ).toBeDefined();
      expect(screen.getByRole("button", { name: /retry/i })).toBeDefined();
    });

    expect(textarea.value).toBe("Telemetry logging pipeline");
    expect(screen.queryByText("System Architect Session")).toBeNull();
    expect(screen.queryByText("You")).toBeNull();

    const stored = JSON.parse(window.sessionStorage.getItem(INTAKE_STORAGE_KEY) || "{}");
    expect(stored.failedRequest?.kind).toBe("intake");
    expect(stored.failedRequest?.message).toBe(
      "LLM service is currently unavailable. Please try again shortly.",
    );
  });

  it("refresh after intake failure shows exact 'The last request failed. Please retry.' and Retry resubmits (D-348)", async () => {
    const user = userEvent.setup();

    window.sessionStorage.setItem(
      INTAKE_STORAGE_KEY,
      JSON.stringify({
        version: "v1",
        sessionId: null,
        inputText: "Saved failed requirement text",
        messages: [],
        brief: null,
        failedRequest: {
          kind: "intake",
          message: "Original backend error message",
          text: "Saved failed requirement text",
        },
      }),
    );

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "ready",
        session_id: "sess_recovered_1",
        round: 1,
        questions: [],
        brief: {
          summary: "Recovered System",
          users: "Ops",
          data_involved: [],
          domain_hint: "",
          stated_constraints: [],
          assumptions: [],
          numbers_given: [],
          unverifiable_requirements: [],
        },
      }),
    } as unknown as Response);

    renderWithClient(<HomePage />);

    const textarea = screen.getByPlaceholderText(/Describe the system/) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Saved failed requirement text");

    expect(screen.getByText("The last request failed. Please retry.")).toBeDefined();

    const retryBtn = screen.getByRole("button", { name: /retry/i });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Requirement Brief")).toBeDefined();
      expect(screen.getByText("Recovered System")).toBeDefined();
    });

    const stored = JSON.parse(window.sessionStorage.getItem(INTAKE_STORAGE_KEY) || "{}");
    expect(stored.failedRequest).toBeNull();
  });

  it("409 SESSION_CLOSED shows guidance and does NOT render Retry button (D-348)", async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: "SESSION_CLOSED",
          message: "Session is finished.",
        },
      }),
    } as unknown as Response);

    renderWithClient(<HomePage />);

    const textarea = screen.getByPlaceholderText(/Describe the system/);
    await user.type(textarea, "Post closure inquiry");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "This design request is finished. Use New architecture to start another.",
        ),
      ).toBeDefined();
      expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    });
  });

  it("enforces 4000 character input limit and displays validation error", async () => {
    const user = userEvent.setup();

    renderWithClient(<HomePage />);

    const textarea = screen.getByPlaceholderText(/Describe the system/);
    const longInput = "a".repeat(4001);

    fireEvent.change(textarea, { target: { value: longInput } });
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(
      screen.getByText("Input must not exceed 4000 characters."),
    ).toBeDefined();
  });

  it("home page without fresh-start flag keeps existing state and does not call router.replace", () => {
    mockSearchParams = new URLSearchParams();

    renderWithClient(<HomePage />);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "What are we building today?" })).toBeDefined();
  });

  it("home page with new=1 fresh-start flag clears state and cleans URL with router.replace", async () => {
    mockSearchParams = new URLSearchParams("new=1");

    renderWithClient(<HomePage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/", { scroll: false });
    });
    const textarea = screen.getByPlaceholderText(/Describe the system/);
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("restores chat messages, session ID, and brief card from sessionStorage on mount", async () => {
    window.sessionStorage.setItem(
      INTAKE_STORAGE_KEY,
      JSON.stringify({
        version: "v1",
        sessionId: "session_restored_1",
        inputText: "Restored draft prompt",
        messages: [
          { id: "m-user-1", sender: "user", text: "Claims processing pipeline" },
          {
            id: "m-asst-1",
            sender: "assistant",
            questions: ["What is the expected throughput?"],
          },
        ],
        brief: {
          summary: "Automated Claims Validation Pipeline",
          users: "Claims adjusters",
          data_involved: ["claims", "documents"],
          domain_hint: "insurance",
          stated_constraints: [{ id: "c1", text: "Must enforce data privacy" }],
          unverifiable_requirements: [],
          numbers_given: [],
          assumptions: [],
        },
      }),
    );

    renderWithClient(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText("Claims processing pipeline")).toBeDefined();
      expect(screen.getByText("What is the expected throughput?")).toBeDefined();
      expect(screen.getByText("Automated Claims Validation Pipeline")).toBeDefined();
      expect(screen.getByRole("button", { name: "Generate design" })).toBeDefined();
      const textarea = screen.getByPlaceholderText(/Describe the system/);
      expect(textarea).toBeDefined();
      expect(textarea.getAttribute("disabled")).toBeNull();
    });
  });

  it("restores draft input text and chat messages from sessionStorage when brief is not yet ready", async () => {
    window.sessionStorage.setItem(
      INTAKE_STORAGE_KEY,
      JSON.stringify({
        version: "v1",
        sessionId: "session_restored_draft",
        inputText: "Restored draft requirement text",
        messages: [
          { id: "m-user-draft", sender: "user", text: "Claims processing pipeline" },
        ],
        brief: null,
      }),
    );

    renderWithClient(<HomePage />);

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/Describe the system/);
      expect((textarea as HTMLTextAreaElement).value).toBe("Restored draft requirement text");
      expect(screen.getByText("Claims processing pipeline")).toBeDefined();
      expect(screen.queryByRole("button", { name: "Generate design" })).toBeNull();
    });
  });

  it("clears sessionStorage and starts clean when navigated with ?new=1", async () => {
    window.sessionStorage.setItem(
      INTAKE_STORAGE_KEY,
      JSON.stringify({
        version: "v1",
        sessionId: "session_old_1",
        inputText: "Old text that must be cleared",
        messages: [{ id: "m1", sender: "user", text: "Old message" }],
        brief: null,
      }),
    );
    mockSearchParams = new URLSearchParams("new=1");

    renderWithClient(<HomePage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/", { scroll: false });
    });

    const textarea = screen.getByPlaceholderText(/Describe the system/);
    expect((textarea as HTMLTextAreaElement).value).toBe("");
    expect(window.sessionStorage.getItem(INTAKE_STORAGE_KEY)).toBeNull();
  });

  it("gracefully ignores corrupt JSON or invalid schema in sessionStorage", () => {
    window.sessionStorage.setItem(INTAKE_STORAGE_KEY, "not-valid-json{{{");

    renderWithClient(<HomePage />);

    const textarea = screen.getByPlaceholderText(/Describe the system/);
    expect((textarea as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByText("not-valid-json")).toBeNull();
  });

  it("navigates to existing design when Generate design is clicked on restored brief", async () => {
    const user = userEvent.setup();

    window.sessionStorage.setItem(
      INTAKE_STORAGE_KEY,
      JSON.stringify({
        version: "v1",
        sessionId: "session_ready_existing",
        inputText: "",
        messages: [],
        brief: {
          summary: "Pre-existing Claim Architecture",
          users: "Claims adjusters",
          data_involved: ["claims"],
          domain_hint: "insurance",
          stated_constraints: [],
          unverifiable_requirements: [],
          numbers_given: [],
          assumptions: [],
        },
      }),
    );

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/designs")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "design_existing_456",
            intake_session_id: "session_ready_existing",
            title: "Pre-existing Claim Architecture",
            current_version: 1,
            brief: {
              summary: "Pre-existing Claim Architecture",
              users: "Claims adjusters",
              data_involved: ["claims"],
              domain_hint: "insurance",
              stated_constraints: [],
              unverifiable_requirements: [],
              numbers_given: [],
              assumptions: [],
            },
            spec: {
              nodes: [
                {
                  id: "entry_node",
                  name: "Ingress",
                  type: "gateway",
                  role: "entry",
                  inputs: [],
                  outputs: ["sink_node"],
                  tech_options: ["fastapi"],
                  needs_model: false,
                },
                {
                  id: "sink_node",
                  name: "Database",
                  type: "database",
                  role: "storage",
                  inputs: ["entry_node"],
                  outputs: [],
                  tech_options: ["postgres"],
                  needs_model: false,
                },
              ],
              edges: [
                {
                  from: "entry_node",
                  to: "sink_node",
                  flows: "records",
                },
              ],
              constraints: [],
              entry_ids: ["entry_node"],
              exit_ids: ["sink_node"],
            },
            warnings: [],
            flow_order: ["entry_node", "sink_node"],
            prompt_version: "architect_v4",
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithClient(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate design" })).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Generate design" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/design/design_existing_456");
    });
  });

  it("preserves hostile input strings as literal text without execution", async () => {
    const hostileDraft = "<script>alert('textarea-xss')</script>";
    const hostileMessage = "<img src=x onerror=alert('message-xss') />";
    window.sessionStorage.setItem(
      INTAKE_STORAGE_KEY,
      JSON.stringify({
        version: "v1",
        sessionId: "session_xss",
        inputText: hostileDraft,
        messages: [{ id: "m-xss", sender: "user", text: hostileMessage }],
        brief: null,
      }),
    );

    renderWithClient(<HomePage />);

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/Describe the system/);
      expect((textarea as HTMLTextAreaElement).value).toBe(hostileDraft);
      expect(screen.getByText(hostileMessage)).toBeDefined();
    });
  });

  it("never logs user prompt or messages to console during restore", async () => {
    const sensitiveDraft = "Very secret confidential input draft text";
    const sensitiveMessage = "Proprietary classified architectural specification message";
    window.sessionStorage.setItem(
      INTAKE_STORAGE_KEY,
      JSON.stringify({
        version: "v1",
        sessionId: "session_confidential",
        inputText: sensitiveDraft,
        messages: [{ id: "m-sec", sender: "user", text: sensitiveMessage }],
        brief: null,
      }),
    );

    const logSpy = vi.spyOn(console, "log");
    const warnSpy = vi.spyOn(console, "warn");
    const errorSpy = vi.spyOn(console, "error");

    renderWithClient(<HomePage />);

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/Describe the system/);
      expect((textarea as HTMLTextAreaElement).value).toBe(sensitiveDraft);
      expect(screen.getByText(sensitiveMessage)).toBeDefined();
    });

    const calls = [
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
    ].flat();

    expect(logSpy).toHaveBeenCalledTimes(0);
    expect(warnSpy).toHaveBeenCalledTimes(0);
    expect(errorSpy).toHaveBeenCalledTimes(0);

    for (const arg of calls) {
      if (typeof arg === "string") {
        expect(arg).not.toContain(sensitiveDraft);
        expect(arg).not.toContain(sensitiveMessage);
      }
    }
  });

  describe("Stage 2: Bottom-docked chat layout and session management", () => {
    it("omits home page's own 'Past designs' and 'New design' buttons (sidebar handles them)", () => {
      renderWithClient(<HomePage />);

      expect(screen.queryByRole("button", { name: "New design" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Past designs" })).toBeNull();
      expect(
        screen.getByRole("heading", {
          name: "What are we building today?",
          level: 1,
        }),
      ).toBeDefined();
      expect(
        screen.getByPlaceholderText("Describe the system you have in mind..."),
      ).toBeDefined();
    });

    it("sends message on Enter without Shift, but Shift+Enter inserts newline without sending", async () => {
      const user = userEvent.setup();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: "needs_info",
          session_id: "sess_enter_test",
          round: 1,
          questions: ["What database is used?"],
          brief: null,
        }),
      } as unknown as Response);

      renderWithClient(<HomePage />);

      const textarea = screen.getByPlaceholderText(/Describe the system/);

      await user.type(textarea, "Line 1{Shift>}{Enter}{/Shift}Line 2");
      expect(global.fetch).not.toHaveBeenCalled();

      await user.type(textarea, "{Enter}");
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });
      expect(
        screen.getByText(
          (_, el) =>
            el?.tagName.toLowerCase() === "p" &&
            el.textContent === "Line 1\nLine 2",
        ),
      ).toBeDefined();
    });

    it("does not send when input is empty, whitespace only, or exceeds 4000 chars", async () => {
      const user = userEvent.setup();
      global.fetch = vi.fn();

      renderWithClient(<HomePage />);

      const sendBtn = screen.getByRole("button", { name: /send/i });
      expect(sendBtn.getAttribute("disabled")).toBeDefined();

      const textarea = screen.getByPlaceholderText(/Describe the system/);
      await user.type(textarea, "   ");
      await user.click(sendBtn);
      expect(global.fetch).not.toHaveBeenCalled();

      fireEvent.change(textarea, { target: { value: "a".repeat(4001) } });
      await user.click(sendBtn);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(screen.getByText("Input must not exceed 4000 characters.")).toBeDefined();
    });

    it("renders messages in order and renders BriefCard inline while keeping input enabled", () => {
      window.sessionStorage.setItem(
        INTAKE_STORAGE_KEY,
        JSON.stringify({
          version: "v1",
          sessionId: "sess_brief_ready",
          inputText: "",
          messages: [
            { id: "m1", sender: "user", text: "First requirement" },
            { id: "m2", sender: "assistant", questions: ["Clarification 1?"] },
            { id: "m3", sender: "user", text: "Clarification reply" },
          ],
          brief: {
            summary: "Inline Synthesized System",
            users: "Auditors",
            data_involved: ["Logs"],
            domain_hint: "Security",
            stated_constraints: [],
            unverifiable_requirements: [],
            numbers_given: [],
            assumptions: [],
          },
        }),
      );

      renderWithClient(<HomePage />);

      expect(screen.getByText("First requirement")).toBeDefined();
      expect(screen.getByText("Clarification 1?")).toBeDefined();
      expect(screen.getByText("Clarification reply")).toBeDefined();

      expect(screen.getByText("Inline Synthesized System")).toBeDefined();
      expect(screen.getByRole("button", { name: "Generate design" })).toBeDefined();

      const textarea = screen.getByPlaceholderText(/Describe the system/);
      expect(textarea.getAttribute("disabled")).toBeNull();
    });

    it("restores intake dialogue from sessionStorage, and ?new=1 resets state", () => {
      window.sessionStorage.setItem(
        INTAKE_STORAGE_KEY,
        JSON.stringify({
          version: "v1",
          sessionId: "sess_restore_test",
          inputText: "Saved input text",
          messages: [
            { id: "m1", sender: "user", text: "Restored dialogue prompt" },
          ],
          brief: null,
        }),
      );

      const { unmount } = renderWithClient(<HomePage />);
      expect(screen.getByText("Restored dialogue prompt")).toBeDefined();
      expect(
        (screen.getByPlaceholderText(/Describe the system/) as HTMLTextAreaElement)
          .value,
      ).toBe("Saved input text");
      unmount();

      mockSearchParams = new URLSearchParams("new=1");
      renderWithClient(<HomePage />);

      expect(screen.queryByText("Restored dialogue prompt")).toBeNull();
      expect(
        (screen.getByPlaceholderText(/Describe the system/) as HTMLTextAreaElement)
          .value,
      ).toBe("");
      expect(window.sessionStorage.getItem(INTAKE_STORAGE_KEY)).toBeNull();
      expect(mockReplace).toHaveBeenCalledWith("/", { scroll: false });
    });

    it("renders hostile user strings strictly as plain text", () => {
      const hostileText = "<script>alert('xss')</script>";
      window.sessionStorage.setItem(
        INTAKE_STORAGE_KEY,
        JSON.stringify({
          version: "v1",
          sessionId: "sess_hostile",
          inputText: "",
          messages: [
            { id: "m_xss", sender: "user", text: hostileText },
          ],
          brief: null,
        }),
      );

      renderWithClient(<HomePage />);

      expect(screen.getByText(hostileText)).toBeDefined();
      expect(document.querySelector("script[src*='alert']")).toBeNull();
    });

    it("clicking an example starter button fills textarea, moves focus to textarea, and makes 0 fetch calls (D-346)", async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.spyOn(global, "fetch");

      renderWithClient(<HomePage />);

      await waitFor(() => {
        const starters = screen.getAllByRole("button").filter((btn) =>
          btn.querySelector(".lucide-arrow-up-right"),
        );
        expect(starters.length).toBe(3);
      });

      const starters = screen.getAllByRole("button").filter((btn) =>
        btn.querySelector(".lucide-arrow-up-right"),
      );
      await user.click(starters[0]!);

      const textarea = screen.getByPlaceholderText(/Describe the system/) as HTMLTextAreaElement;
      expect(textarea.value.length).toBeGreaterThan(20);
      expect(document.activeElement).toBe(textarea);

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("displays static counter at rest and appends live counter when input length >= 3200", () => {
      renderWithClient(<HomePage />);

      expect(screen.getByText("Plain language · Up to 4,000 characters")).toBeDefined();

      const textarea = screen.getByPlaceholderText(/Describe the system/);
      const nearLimitInput = "x".repeat(3250);
      fireEvent.change(textarea, { target: { value: nearLimitInput } });

      expect(screen.getByText(/Plain language · Up to 4,000 characters · 3,250 \/ 4,000/)).toBeDefined();
    });

    it("toggling desktop sidebar on '/' does not trigger 'Cannot update a component' console.error (D-352)", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");
      const user = userEvent.setup();

      renderWithClient(
        <AppShell>
          <HomePage />
        </AppShell>,
      );

      const toggleBtn = screen.getByRole("button", { name: "Toggle navigation sidebar" });
      expect(toggleBtn).toBeDefined();
      expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");

      await user.click(toggleBtn);

      // Non-empty guard: assert sidebar actually toggled open on desktop
      const collapseBtn = screen.getByRole("button", { name: "Collapse sidebar" });
      expect(collapseBtn).toBeDefined();
      expect(toggleBtn.getAttribute("aria-expanded")).toBe("true");

      // Assert console.error was never called with cross-component update error
      const hasComponentUpdateError = consoleErrorSpy.mock.calls.some((args) =>
        args.some((arg) => typeof arg === "string" && arg.includes("Cannot update a component")),
      );
      expect(hasComponentUpdateError).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it("renders zero <img> elements and preserves dark studio background classes & z-0/z-10 isolation post-mount (D-353)", async () => {
      const { container } = renderWithClient(
        <AppShell>
          <HomePage />
        </AppShell>,
      );

      // Non-empty guard: main element and primary heading must be present
      const mainEl = container.querySelector("main");
      expect(mainEl).not.toBeNull();
      expect(screen.getByRole("heading", { name: "What are we building today?", level: 1 })).toBeDefined();

      // Main preserves dark studio classes and stacking isolation
      expect(mainEl?.className).toContain("bg-page-bg");
      expect(mainEl?.className).toContain("studio-grid-bg");
      expect(mainEl?.className).toContain("isolate");
      expect(mainEl?.className).not.toContain("bg-white");

      // Post-mount Waves layer remains z-0 and pointer-events-none without white inline background
      await waitFor(() => {
        const wavesLayer = screen.getByTestId("home-waves-layer");
        expect(wavesLayer.className).toContain("z-0");
        expect(wavesLayer.className).toContain("pointer-events-none");
        expect(wavesLayer.style.backgroundColor).not.toBe("white");
        expect(wavesLayer.style.backgroundColor).not.toBe("#ffffff");
      });

      // Content wrapper sits above background layers at z-10
      const contentLayer = container.querySelector("main > div.z-10");
      expect(contentLayer).not.toBeNull();

      // Zero <img> tags anywhere on home "/"
      expect(container.querySelectorAll("img")).toHaveLength(0);
    });
  });
});
