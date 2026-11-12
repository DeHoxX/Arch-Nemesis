import React from "react";
import {
  BaseEdge,
  type EdgeProps,
  getSmoothStepPath,
} from "@xyflow/react";

export type BlockEdgeData = {
  pathD?: string;
  [key: string]: unknown;
};

/**
 * BlockEdge: Simple, non-interactive edge for the Block Diagram view (Stage 1D, D-336).
 *
 * Requirements:
 * - Label-less: zero text, zero badges, zero tooltips.
 * - Non-interactive: no button, no selection/dimming/hover behavior.
 * - Uses pure layout pathD precomputed by computeLayout (computeEdgeLabelLayout).
 * - Falls back cleanly to getSmoothStepPath if pathD is absent.
 * - Renders BaseEdge with passed markerEnd and style (retaining removed-edge diff styles).
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
  const hasPathD = typeof data?.pathD === "string" && data.pathD.length > 0;

  let edgePath: string;
  if (hasPathD) {
    edgePath = data.pathD!;
  } else {
    const [fallbackPath] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 5,
    });
    edgePath = fallbackPath;
  }

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={style}
    />
  );
}
