import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExportButtons } from "./ExportButtons";
import * as exportLib from "@/lib/export";
import type { Explanation } from "@/lib/types";

const mockExplanation: Explanation = {
  overview: "Analytics pipeline overview",
  flow: [
    {
      step: 1,
      node_id: "ingest",
      node_name: "Ingest",
      text: "Ingests data",
    },
  ],
  parts: [
    {
      node_id: "ingest",
      node_name: "Ingest",
      text: "Gateway component",
    },
  ],
  checks: [],
  models: { nodes: [], text: "No model used" },
  source: "llm",
};

describe("ExportButtons Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders exactly two export buttons with exact mandated labels and no print button", () => {
    render(
      <ExportButtons
        designId="design-123"
        versionNo={1}
        explanation={mockExplanation}
      />
    );

    expect(
      screen.getByRole("button", { name: "Download diagram (PNG)" })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Download explanation (.md)" })
    ).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Print or save as PDF" })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /print/i })).toBeNull();

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
  });

  it("triggers Markdown download on 'Download explanation (.md)' click without network requests", async () => {
    const user = userEvent.setup();
    const downloadSpy = vi.spyOn(exportLib, "downloadFile").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(global, "fetch");

    render(
      <ExportButtons
        designId="design-123"
        versionNo={1}
        explanation={mockExplanation}
      />
    );

    const mdBtn = screen.getByRole("button", { name: "Download explanation (.md)" });
    await user.click(mdBtn);

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    const [content, filename, mimeType] = downloadSpy.mock.calls[0]!;
    expect(filename).toBe("arch-nemesis-design-123-v1.md");
    expect(mimeType).toBe("text/markdown;charset=utf-8");
    expect(typeof content).toBe("string");
    expect(content).toContain("# Design design-123 (Version 1)");

    // Strict privacy: no network calls
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("triggers PNG export on 'Download diagram (PNG)' click without network requests", async () => {
    const user = userEvent.setup();
    const exportPngSpy = vi
      .spyOn(exportLib, "exportDiagramToPng")
      .mockResolvedValueOnce(undefined);
    const fetchSpy = vi.spyOn(global, "fetch");

    // Create a mock DOM node for the diagram container
    const mockDiagramDiv = document.createElement("div");
    mockDiagramDiv.className = "react-flow";
    document.body.appendChild(mockDiagramDiv);

    render(
      <ExportButtons
        designId="design-123"
        versionNo={2}
        explanation={mockExplanation}
      />
    );

    const pngBtn = screen.getByRole("button", { name: "Download diagram (PNG)" });
    await user.click(pngBtn);

    expect(exportPngSpy).toHaveBeenCalledTimes(1);
    expect(exportPngSpy.mock.calls[0]![1]).toBe("design-123");
    expect(exportPngSpy.mock.calls[0]![2]).toBe(2);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    document.body.removeChild(mockDiagramDiv);
  });

  it("displays exact error message on PNG export failure without crashing", async () => {
    const user = userEvent.setup();
    vi.spyOn(exportLib, "exportDiagramToPng").mockRejectedValueOnce(
      new Error("Canvas tainted")
    );

    const mockDiagramDiv = document.createElement("div");
    mockDiagramDiv.className = "react-flow";
    document.body.appendChild(mockDiagramDiv);

    render(
      <ExportButtons
        designId="design-123"
        versionNo={1}
        explanation={mockExplanation}
      />
    );

    const pngBtn = screen.getByRole("button", { name: "Download diagram (PNG)" });
    await user.click(pngBtn);

    const alert = await screen.findByText(
      "Failed to export diagram image. Please try again."
    );
    expect(alert).toBeDefined();

    document.body.removeChild(mockDiagramDiv);
  });

  it("uses 'design' fallback in filename when designId is empty", async () => {
    const user = userEvent.setup();
    const downloadSpy = vi.spyOn(exportLib, "downloadFile").mockImplementation(() => {});

    render(
      <ExportButtons
        designId=""
        versionNo={1}
        explanation={mockExplanation}
      />
    );

    const mdBtn = screen.getByRole("button", { name: "Download explanation (.md)" });
    await user.click(mdBtn);

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    const [, filename] = downloadSpy.mock.calls[0]!;
    expect(filename).toBe("arch-nemesis-design-v1.md");
  });
});
