import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";
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
    mockPush.mockClear();
    mockReplace.mockClear();
    mockSearchParams = new URLSearchParams();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("renders exact heading, placeholder, and Send button from the Build Plan", () => {
    renderWithClient(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: "Describe the system you need",
        level: 1,
      }),
    ).toBeDefined();

    const expectedPlaceholder =
      "For example: a support assistant that answers customers from our help articles and hands hard cases to a person.";
    expect(screen.getByPlaceholderText(expectedPlaceholder)).toBeDefined();

    expect(screen.getByRole("button", { name: /send/i })).toBeDefined();
  });

  it("handles intake turn and displays follow-up questions in the message stream", async () => {
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

    const textarea = screen.getByPlaceholderText(/For example: a support assistant/);
    await user.type(textarea, "I need a customer support bot.");

    const sendButton = screen.getByRole("button", { name: /send/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText("Who are the primary internal users?")).toBeDefined();
      expect(
        screen.getByText("What databases or external APIs are connected?"),
      ).toBeDefined();
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

    const textarea = screen.getByPlaceholderText(/For example: a support assistant/);
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

    const textarea = screen.getByPlaceholderText(/For example: a support assistant/);
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

    // Step 1: Submit intake turn to get ready brief
    const textarea = screen.getByPlaceholderText(/For example: a support assistant/);
    await user.type(textarea, "Need a telemetry ingestion system");
    await user.click(screen.getByRole("button", { name: /send/i }));

    // Step 2: Click "Generate design" button on brief card
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Generate design" })).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Generate design" }));

    // Step 3: Assert router.push was invoked with /design/design_abc_123
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

    const textarea = screen.getByPlaceholderText(/For example: a support assistant/);
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

  it("displays friendly error message and Retry button on LLM service error", async () => {
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

    const textarea = screen.getByPlaceholderText(/For example: a support assistant/);
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

  it("enforces 4000 character input limit and displays validation error", async () => {
    const user = userEvent.setup();

    renderWithClient(<HomePage />);

    const textarea = screen.getByPlaceholderText(/For example: a support assistant/);
    const longInput = "a".repeat(4001);

    fireEvent.change(textarea, { target: { value: longInput } });
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(
      screen.getByText("Input must not exceed 4000 characters."),
    ).toBeDefined();
  });

  it("home page without fresh-start flag keeps existing state and does not call router.replace", () => {
    mockSearchParams = new URLSearchParams(); // empty / no flag

    renderWithClient(<HomePage />);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Describe the system you need" })).toBeDefined();
  });

  it("home page with new=1 fresh-start flag clears state and cleans URL with router.replace", async () => {
    mockSearchParams = new URLSearchParams("new=1");

    renderWithClient(<HomePage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/", { scroll: false });
    });
    const textarea = screen.getByPlaceholderText(/For example: a support assistant/);
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("restores chat messages, session ID, and brief card from sessionStorage on mount, hiding textarea", async () => {
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
      expect(screen.queryByPlaceholderText(/For example: a support assistant/)).toBeNull();
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
      const textarea = screen.getByPlaceholderText(/For example: a support assistant/);
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

    const textarea = screen.getByPlaceholderText(/For example: a support assistant/);
    expect((textarea as HTMLTextAreaElement).value).toBe("");
    expect(window.sessionStorage.getItem(INTAKE_STORAGE_KEY)).toBeNull();
  });

  it("gracefully ignores corrupt JSON or invalid schema in sessionStorage", async () => {
    window.sessionStorage.setItem(INTAKE_STORAGE_KEY, "not-valid-json{{{");

    renderWithClient(<HomePage />);

    const textarea = screen.getByPlaceholderText(/For example: a support assistant/);
    expect((textarea as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByText("not-valid-json")).toBeNull();
  });

  it("displays friendly guidance when intake turn returns 409 SESSION_CLOSED", async () => {
    const user = userEvent.setup();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: "SESSION_CLOSED",
          message: "Session 'session_closed_1' is already ready.",
        },
      }),
    } as unknown as Response);

    renderWithClient(<HomePage />);

    const textarea = screen.getByPlaceholderText(/For example: a support assistant/);
    await user.type(textarea, "Another query after closure");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "This design request is finished. Use New design to start another.",
        ),
      ).toBeDefined();
    });
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
      const textarea = screen.getByPlaceholderText(/For example: a support assistant/);
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
      const textarea = screen.getByPlaceholderText(/For example: a support assistant/);
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
});
