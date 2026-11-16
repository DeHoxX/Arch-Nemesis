import React from "react";
import { render, screen } from "@testing-library/react";
import { Position, ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { normalizeColorToHex } from "@/test/helpers";
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

describe("BlockEdge component", () => {
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
    const removedStyle: React.CSSProperties = {
      stroke: "#f43f5e",
      strokeDasharray: "6 6",
      opacity: 0.6,
    };

    const { container } = renderBlockEdge({
      data: { pathD: "M 10 10 L 50 50" },
      style: removedStyle,
    });

    const pathElement = container.querySelector(".react-flow__edge-path") as SVGPathElement;
    expect(pathElement).not.toBeNull();
    expect(normalizeColorToHex(pathElement.style.stroke)).toBe("#f43f5e");
    expect(pathElement.style.strokeDasharray).toBe("6 6");
    expect(pathElement.style.opacity).toBe("0.6");
  });
});
