import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
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
});
