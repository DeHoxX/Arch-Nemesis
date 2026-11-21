import fs from "node:fs";
import path from "node:path";
import React from "react";
import { render, screen } from "@testing-library/react";
import { Position, ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BlockEdge, type BlockEdgeData } from "./BlockEdge";

function renderBlockEdge({
  id = "e-source-target-0",
  data,
  style,
}: {
  id?: string;
  data?: BlockEdgeData;
  style?: React.CSSProperties;
}) {
  return render(
    <ReactFlowProvider>
      <svg data-testid="edge-svg">
        <BlockEdge
          id={id}
          source="source"
          target="target"
          sourceX={100}
          sourceY={50}
          targetX={200}
          targetY={150}
          sourcePosition={Position.Right}
          targetPosition={Position.Left}
          data={data}
          style={style}
        />
      </svg>
    </ReactFlowProvider>,
  );
}

describe("BlockEdge component (Stage V3-4B)", () => {
  beforeEach(() => {
    document.documentElement.className = "dark";
  });

  afterEach(() => {
    document.documentElement.className = "";
  });

  it("renders pathD verbatim when provided in edge data", () => {
    const customPath = "M 100 50 L 100 100 Q 100 105 105 105 L 195 105 Q 200 105 200 110 L 200 150";
    const { container } = renderBlockEdge({
      data: { pathD: customPath },
    });

    const pathElement = container.querySelector(".react-flow__edge-path");
    expect(pathElement).not.toBeNull();
    expect(pathElement?.getAttribute("d")).toBe(customPath);
  });

  it("falls back to getSmoothStepPath when pathD is missing or empty", () => {
    const { container } = renderBlockEdge({
      data: {},
    });

    const pathElement = container.querySelector(".react-flow__edge-path");
    expect(pathElement).not.toBeNull();
    const d = pathElement?.getAttribute("d") ?? "";
    expect(d.length).toBeGreaterThan(0);
    expect(d.startsWith("M")).toBe(true);
  });

  it("renders stroke with CSS token var(--edge-stroke) by default", () => {
    const { container } = renderBlockEdge({
      data: {},
    });

    const pathElement = container.querySelector(".react-flow__edge-path") as SVGPathElement;
    expect(pathElement).not.toBeNull();
    expect(pathElement.style.stroke).toBe("var(--edge-stroke)");
  });

  it("renders backward edge with dashed stroke (strokeDasharray '6 6')", () => {
    const { container } = renderBlockEdge({
      data: { isBackward: true },
    });

    const pathElement = container.querySelector(".react-flow__edge-path") as SVGPathElement;
    expect(pathElement).not.toBeNull();
    expect(pathElement.style.strokeDasharray).toBe("6 6");
  });

  it("renders forward edge without dashed stroke", () => {
    const { container } = renderBlockEdge({
      data: { isBackward: false },
    });

    const pathElement = container.querySelector(".react-flow__edge-path") as SVGPathElement;
    expect(pathElement).not.toBeNull();
    expect(pathElement.style.strokeDasharray).toBeFalsy();
  });

  it("renders label-less and non-interactive with no button, text, or tooltips", () => {
    const { container } = renderBlockEdge({
      data: { pathD: "M 0 0 L 100 100" },
    });

    // Zero interactive buttons
    expect(screen.queryByRole("button")).toBeNull();
    // Zero SVG or HTML text elements
    expect(container.querySelectorAll("text")).toHaveLength(0);
    expect(container.querySelectorAll("p")).toHaveLength(0);
    expect(container.querySelectorAll("span")).toHaveLength(0);
    // Container text content is completely empty
    expect(container.textContent?.trim()).toBe("");
  });

  it("preserves removed-edge diff styling with dashed rose stroke and 0.6 opacity", () => {
    const { container } = renderBlockEdge({
      data: { diffStatus: "removed" },
    });

    const pathElement = container.querySelector(".react-flow__edge-path") as SVGPathElement;
    expect(pathElement).not.toBeNull();
    expect(pathElement.style.stroke).toBe("var(--block-edge-removed, #f43f5e)");
    expect(pathElement.style.strokeDasharray).toBe("6 6");
    expect(pathElement.style.opacity).toBe("0.6");
  });

  describe("globals.css CSS tokens", () => {
    it("defines --block-edge-highlight and --block-edge-removed in :root and .dark with exact dark values and overrides only under html.light", () => {
      const globalsCss = fs.readFileSync(
        path.resolve(__dirname, "../../app/globals.css"),
        "utf8",
      );

      // Verify :root tokens
      const rootMatch = globalsCss.match(/:root\s*\{([^}]+)\}/);
      expect(rootMatch).not.toBeNull();
      const rootBody = rootMatch![1]!;
      expect(rootBody).toContain("--block-edge-highlight: #2dd4bf;");
      expect(rootBody).toContain("--block-edge-removed: #f43f5e;");

      // Verify .dark tokens
      const darkMatch = globalsCss.match(/\.dark\s*\{([^}]+)\}/);
      expect(darkMatch).not.toBeNull();
      const darkBody = darkMatch![1]!;
      expect(darkBody).toContain("--block-edge-highlight: #2dd4bf;");
      expect(darkBody).toContain("--block-edge-removed: #f43f5e;");

      // Verify html.light overrides
      const lightMatch = globalsCss.match(/html\.light\s*\{([^}]+)\}/);
      expect(lightMatch).not.toBeNull();
      const lightBody = lightMatch![1]!;
      expect(lightBody).toContain("--block-edge-highlight: #0d9488;");
      expect(lightBody).toContain("--block-edge-removed: #e11d48;");

      // Enforce no bare .light selector
      expect(globalsCss).not.toMatch(/(^|\n)\.light\s*\{/);
    });
  });
});
