import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminLeadsPage from "./page";
import { AdminTokenProvider } from "./context";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getAdminLeads: vi.fn(),
  };
});

function renderWithAdminContext(): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminTokenProvider>
        <AdminLeadsPage />
      </AdminTokenProvider>
    </QueryClientProvider>
  );
}

describe("Admin Leads Page (/admin)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders password input and View Leads button when unauthenticated", () => {
    renderWithAdminContext();

    expect(screen.getByLabelText(/Admin Secret Token/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /View Leads/i })).toBeDefined();
  });

  it("handles 401 error: clears token and displays exact 'Not authorised.' message", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getAdminLeads).mockRejectedValueOnce(
      new ApiError("Not authorised.", "UNAUTHORIZED", 401)
    );

    renderWithAdminContext();

    const input = screen.getByLabelText(/Admin Secret Token/i);
    await user.type(input, "bad-token");
    await user.click(screen.getByRole("button", { name: /View Leads/i }));

    const errorAlert = await screen.findByText("Not authorised.");
    expect(errorAlert).toBeDefined();

    // Password input field remains available for retry
    expect(screen.getByLabelText(/Admin Secret Token/i)).toBeDefined();

    // Token must not be stored in localStorage, sessionStorage, or URL
    expect(localStorage.getItem("admin_token")).toBeNull();
    expect(sessionStorage.getItem("admin_token")).toBeNull();
    expect(window.location.search).not.toContain("bad-token");
  });

  it("handles 404 error: displays 'Admin access is disabled on this server.'", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getAdminLeads).mockRejectedValueOnce(
      new ApiError("Not found.", "NOT_FOUND", 404)
    );

    renderWithAdminContext();

    const input = screen.getByLabelText(/Admin Secret Token/i);
    await user.type(input, "any-token");
    await user.click(screen.getByRole("button", { name: /View Leads/i }));

    const errorAlert = await screen.findByText(
      "Admin access is disabled on this server."
    );
    expect(errorAlert).toBeDefined();
  });

  it("handles network error gracefully and keeps token input for retry", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getAdminLeads).mockRejectedValueOnce(
      new Error("Failed to fetch")
    );

    renderWithAdminContext();

    const input = screen.getByLabelText(/Admin Secret Token/i);
    await user.type(input, "my-token");
    await user.click(screen.getByRole("button", { name: /View Leads/i }));

    const errorAlert = await screen.findByText("Failed to fetch");
    expect(errorAlert).toBeDefined();
  });

  it("renders leads table with required fields and links to design inspection", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getAdminLeads).mockResolvedValueOnce([
      {
        id: "lead-abc-001",
        created_at: "2026-10-31T01:15:00.000Z",
        name: "Alice Smith",
        email: "alice@example.com",
        note: "Need high availability in eu-west-1",
        design_id: "design-xyz-999",
        version_no: 2,
      },
    ]);

    renderWithAdminContext();

    const input = screen.getByLabelText(/Admin Secret Token/i);
    await user.type(input, "secret-token-123");
    await user.click(screen.getByRole("button", { name: /View Leads/i }));

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeDefined();
    });

    expect(screen.getByText("alice@example.com")).toBeDefined();
    expect(screen.getByText("Need high availability in eu-west-1")).toBeDefined();

    const designLink = screen.getByRole("link", {
      name: /v2 \(design\)/i,
    });
    expect(designLink).toBeDefined();
    expect(designLink.getAttribute("href")).toBe(
      "/admin/designs/design-xyz-999/2"
    );
  });

  it("renders lead notes in full with plain text", async () => {
    const user = userEvent.setup();
    const fullNote =
      "This is a complete note detailing the client requirements without being cut off or truncated with an ellipsis.";
    vi.mocked(api.getAdminLeads).mockResolvedValueOnce([
      {
        id: "lead-002",
        created_at: "2026-10-31T01:20:00.000Z",
        name: "Bob Jones",
        email: "bob@example.com",
        note: fullNote,
        design_id: "design-002",
        version_no: 1,
      },
    ]);

    renderWithAdminContext();

    await user.type(screen.getByLabelText(/Admin Secret Token/i), "secret");
    await user.click(screen.getByRole("button", { name: /View Leads/i }));

    await waitFor(() => {
      expect(screen.getByText(fullNote)).toBeDefined();
    });
  });

  it("renders hostile user strings safely as plain text without script execution", async () => {
    const user = userEvent.setup();
    const hostileName = '<b id="evil-name">Evil</b>';
    const hostileNote = '<script id="evil-script">alert(1)</script>';
    vi.mocked(api.getAdminLeads).mockResolvedValueOnce([
      {
        id: "lead-003",
        created_at: "2026-10-31T01:25:00.000Z",
        name: hostileName,
        email: "attacker@example.com",
        note: hostileNote,
        design_id: "design-003",
        version_no: 1,
      },
    ]);

    renderWithAdminContext();

    await user.type(screen.getByLabelText(/Admin Secret Token/i), "secret");
    await user.click(screen.getByRole("button", { name: /View Leads/i }));

    await waitFor(() => {
      expect(screen.getByText(hostileName)).toBeDefined();
    });

    expect(screen.getByText(hostileNote)).toBeDefined();
    expect(document.getElementById("evil-name")).toBeNull();
    expect(document.getElementById("evil-script")).toBeNull();
  });

  it("never writes admin token to localStorage, sessionStorage, or URL query", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getAdminLeads).mockResolvedValueOnce([]);

    renderWithAdminContext();

    const sensitiveToken = "super-secret-admin-token-777";
    await user.type(screen.getByLabelText(/Admin Secret Token/i), sensitiveToken);
    await user.click(screen.getByRole("button", { name: /View Leads/i }));

    await waitFor(() => {
      expect(screen.getByText("No leads received yet")).toBeDefined();
    });

    expect(localStorage.getItem("admin_token")).toBeNull();
    expect(sessionStorage.getItem("admin_token")).toBeNull();
    expect(window.location.search).not.toContain(sensitiveToken);
  });
});
