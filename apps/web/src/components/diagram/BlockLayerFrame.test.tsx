import React from "react";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BlockLayerFrame, type BlockLayerFrameData } from "./BlockLayerFrame";

function renderBlockLayerFrame(dataOverrides: Partial<BlockLayerFrameData> = {}) {
  const data: BlockLayerFrameData = {
    id: "layer_ingest",
    name: "Ingest Stage",
    count: 3,
    width: 280,
    height: 340,
    ...dataOverrides,
  };

  return render(
    <ReactFlowProvider>
      <BlockLayerFrame
        id={`frame-${data.id}`}
        data={data}
        type="blockLayerFrame"
        selected={false}
        zIndex={-1}
        isConnectable={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
        draggable={false}
        deletable={false}
        selectable={false}
        parentId=""
      />
    </ReactFlowProvider>,
  );
}

describe("BlockLayerFrame component (Stage V3-4B2)", () => {
  beforeEach(() => {
    document.documentElement.className = "dark";
  });

  afterEach(() => {
    document.documentElement.className = "";
  });

  it("renders frame with dashed border class and pointer-events-none non-interactive attribute", () => {
    const { container } = renderBlockLayerFrame();
    const frameEl = container.firstElementChild as HTMLElement;

    expect(frameEl).not.toBeNull();
    expect(frameEl.classList.contains("border-dashed")).toBe(true);
    expect(frameEl.classList.contains("border-line")).toBe(true);
    expect(frameEl.classList.contains("pointer-events-none")).toBe(true);
  });

  it("asserts real geometry dimensions (width: 280px, height: 340px)", () => {
    const { container } = renderBlockLayerFrame({ width: 280, height: 340 });
    const frameEl = container.firstElementChild as HTMLElement;

    expect(frameEl.style.width).toBe("280px");
    expect(frameEl.style.height).toBe("340px");
  });

  it("renders layer title and count pill inside the frame", () => {
    renderBlockLayerFrame({ name: "Processing", count: 5 });

    expect(screen.getByText("Processing")).toBeDefined();
    expect(screen.getByText("5")).toBeDefined();
  });

  it("renders hostile strings safely as literal text without HTML injection", () => {
    const hostileName = "<script>alert('frame')</script>";
    renderBlockLayerFrame({ name: hostileName });

    expect(screen.getByText(hostileName)).toBeDefined();
    expect(document.querySelector("script")).toBeNull();
  });

  it("applies dual-theme token classes for light and dark", () => {
    const { container } = renderBlockLayerFrame();
    const frameEl = container.firstElementChild as HTMLElement;

    expect(frameEl.classList.contains("bg-surface/40")).toBe(true);
    expect(frameEl.classList.contains("dark:bg-card/25")).toBe(true);
  });
});
