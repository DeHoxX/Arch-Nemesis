import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import HistoryPage from "./page";
import { HISTORY_STORAGE_KEY } from "@/lib/history";

describe("History Page (/history)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders empty state when no history exists in localStorage", () => {
    render(<HistoryPage />);

    expect(screen.getByText("No past designs yet")).toBeDefined();
    expect(screen.getByRole("link", { name: "Create a Design" })).toBeDefined();
    expect(screen.getByRole("link", { name: /Back to Home/i })).toBeDefined();
  });

  it("renders list of past designs with links", () => {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify([
        {
          design_id: "design-abc-123",
          title: "E-commerce inventory tracker with Kafka",
          created_at: "2026-10-31T01:00:00.000Z",
        },
      ])
    );

    render(<HistoryPage />);

    const titleElement = screen.getByText("E-commerce inventory tracker with Kafka");
    expect(titleElement).toBeDefined();

    const linkElement = titleElement.closest("a");
    expect(linkElement).not.toBeNull();
    expect(linkElement?.getAttribute("href")).toBe("/design/design-abc-123");
  });

  it("renders hostile user strings safely as plain text without script execution", () => {
    const maliciousTitle = '<img src=x onerror=alert("xss")> Hostile Title';
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify([
        {
          design_id: "design-xss-999",
          title: maliciousTitle,
          created_at: "2026-10-31T01:00:00.000Z",
        },
      ])
    );

    render(<HistoryPage />);

    // Text is rendered literally, not parsed as HTML
    expect(screen.getByText(maliciousTitle)).toBeDefined();
    expect(document.querySelector("img")).toBeNull();
  });
});

