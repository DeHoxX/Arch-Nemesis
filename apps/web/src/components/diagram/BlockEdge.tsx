import React from "react";
import {
  BaseEdge,
  type EdgeProps,
  getSmoothStepPath,
} from "@xyflow/react";

export type BlockEdgeData = {
  pathD?: string;
  isBackward?: boolean;
  isHighlighted?: boolean;
  isDimmed?: boolean;
  diffStatus?: "added" | "removed" | "edited" | "unchanged";
  [key: string]: unknown;
};

/**
 * BlockEdge: Simple, non-interactive edge for the Block Diagram view (Stage V3-4B, D-396, D-397).
 *
 * Requirements:
 * - Smooth-step path with fallback to precomputed pathD if provided.
 * - Stroke: var(--edge-stroke), highlighted with bright accent on hover.
 * - Backward edges (isBackward): dashed (strokeDasharray="6 6").
 * - Label-less: zero text, zero badges, zero buttons.
 * - Non-interactive.
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

  const defaultStroke = isRemoved ? "#f43f5e" : "var(--edge-stroke)";
  const strokeColor = isHighlighted ? "var(--brand-accent, #2dd4bf)" : defaultStroke;
  const strokeWidth = isHighlighted ? 2.5 : 1.5;
  const opacity = isRemoved ? (isDimmed ? 0.3 : 0.6) : isDimmed ? 0.2 : 1;

  const mergedStyle: React.CSSProperties = {
    stroke: strokeColor,
    strokeWidth,
    strokeDasharray: isRemoved ? "6 6" : isBackward ? "6 6" : undefined,
    opacity,
    transition: "stroke 0.15s ease, opacity 0.15s ease, stroke-width 0.15s ease",
    ...style,
  };

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={mergedStyle}
    />
  );
}
