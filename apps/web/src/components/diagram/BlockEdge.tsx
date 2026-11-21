import React from "react";
import {
  BaseEdge,
  type EdgeProps,
  getSmoothStepPath,
} from "@xyflow/react";
import { GUTTER_LANE_GAP_X } from "./blockRouting";

/** Edge hit path stroke width must not exceed the gutter lane gap */
export const EDGE_HIT_STROKE_WIDTH = GUTTER_LANE_GAP_X;

export type BlockEdgeData = {
  pathD?: string;
  isBackward?: boolean;
  isHighlighted?: boolean;
  isSelected?: boolean;
  isDimmed?: boolean;
  diffStatus?: "added" | "removed" | "edited" | "unchanged";
  onSelect?: (edgeId: string) => void;
  [key: string]: unknown;
};

/**
 * BlockEdge: Edge for the Block Diagram view (Stage V3-4B, V3-4B2, V3-4D1; D-396, D-397, D-399).
 *
 * Requirements:
 * - Smooth-step path with fallback to precomputed pathD if provided.
 * - Stroke: var(--edge-stroke), highlighted/selected with var(--block-edge-highlight).
 * - Backward edges (isBackward): dashed (strokeDasharray="6 6").
 * - Removed edges (diffStatus="removed"): var(--block-edge-removed).
 * - Invisible hit-area path with strokeWidth <= GUTTER_LANE_GAP_X (8px) for effortless clicking.
 * - Label-less on canvas (flow details inspectable in BlockDetailPanel).
 */
export function BlockEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
}: EdgeProps & { data?: BlockEdgeData }): React.ReactElement {
  const isBackward = Boolean(data?.isBackward);
  const isSelected = Boolean(data?.isSelected);
  const isHighlighted = Boolean(data?.isHighlighted);
  const isDimmed = Boolean(data?.isDimmed);
  const isRemoved = data?.diffStatus === "removed";

  let edgePath: string;
  if (typeof data?.pathD === "string" && data.pathD.length > 0) {
    edgePath = data.pathD;
  } else {
    const [smoothPath] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 8,
    });
    edgePath = smoothPath;
  }

  const defaultStroke = isRemoved ? "var(--block-edge-removed, #f43f5e)" : "var(--edge-stroke)";
  const strokeColor = isSelected || isHighlighted
    ? "var(--block-edge-highlight, var(--brand-accent, #2dd4bf))"
    : defaultStroke;
  const strokeWidth = isSelected ? 2.5 : isHighlighted ? 2 : 1.5;
  const opacity = isRemoved ? (isDimmed ? 0.3 : 0.6) : isDimmed ? 0.2 : 1;

  const mergedStyle: React.CSSProperties = {
    stroke: strokeColor,
    strokeWidth,
    strokeDasharray: isRemoved ? "6 6" : isBackward ? "6 6" : undefined,
    opacity,
    transition: "stroke 0.15s ease, opacity 0.15s ease, stroke-width 0.15s ease",
    ...style,
  };

  const handleEdgeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    data?.onSelect?.(id);
  };

  return (
    <g
      className="react-flow__edge"
      data-selected={isSelected ? "true" : "false"}
      data-dimmed={isDimmed ? "true" : "false"}
      data-highlighted={isHighlighted ? "true" : "false"}
    >
      {/* Invisible wider hit-target path: strokeWidth = EDGE_HIT_STROKE_WIDTH <= GUTTER_LANE_GAP_X */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={EDGE_HIT_STROKE_WIDTH}
        className="cursor-pointer"
        style={{ pointerEvents: "stroke" }}
        onClick={handleEdgeClick}
        aria-hidden="true"
      />
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={mergedStyle}
      />
    </g>
  );
}
