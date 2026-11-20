import React from "react";
import {
  BaseEdge,
  type EdgeProps,
  getSmoothStepPath,
} from "@xyflow/react";

export type BlockEdgeData = {
  pathD?: string;
  isBackward?: boolean;
  diffStatus?: "added" | "removed" | "edited" | "unchanged";
  [key: string]: unknown;
};

/**
 * BlockEdge: Simple, non-interactive edge for the Block Diagram view (Stage V3-4B, D-396).
 *
 * Requirements:
 * - Smooth-step path with fallback to precomputed pathD if provided.
 * - Stroke: var(--edge-stroke).
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

  const mergedStyle: React.CSSProperties = {
    stroke: isRemoved ? "#f43f5e" : "var(--edge-stroke)",
    strokeWidth: 1.5,
    strokeDasharray: isRemoved ? "6 6" : isBackward ? "6 6" : undefined,
    opacity: isRemoved ? 0.6 : 1,
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
