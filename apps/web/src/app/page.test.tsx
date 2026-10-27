import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HomePage from "./page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("HomePage Health Card", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders healthy status when API returns ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ok",
        llm_configured: true,
        database: "ok",
      }),
    } as unknown as Response);

    renderWithClient(<HomePage />);

    expect(screen.getByTestId("status-loading")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("API healthy")).toBeDefined();
      expect(screen.getByText("Configured")).toBeDefined();
    });
  });

  it("renders error status when API is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network Error"));

    renderWithClient(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText("API not reachable")).toBeDefined();
    });
  });

  it("hides stale data and shows only error state when refetch fails after initial success", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            status: "ok",
            llm_configured: true,
            database: "ok",
          }),
        } as unknown as Response;
      }
      throw new Error("Backend connection lost");
    });

    renderWithClient(<HomePage />);

    // First call succeeds
    await waitFor(() => {
      expect(screen.getByText("API healthy")).toBeDefined();
    });

    // Trigger refetch by clicking the refresh button
    const refreshButton = screen.getByRole("button", { name: /refresh status/i });
    refreshButton.click();

    // Now error should be shown and old data hidden
    await waitFor(() => {
      expect(screen.getByText("API not reachable")).toBeDefined();
    });

    expect(screen.queryByText("API healthy")).toBeNull();
    expect(screen.queryByTestId("status-healthy")).toBeNull();
  });
});
