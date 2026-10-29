import React from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
} from "@xyflow/react";
import { cn } from "@/lib/utils";

export type DiagramEdgeData = {
  flows: string;
  [key: string]: unknown;
};

/**
 * Custom Diagram Edge with truncated label (max 40 chars) and hover/focus disclosure.
 *
 * Requirements (BUILD_PLAN.md:436-439 & User Decisions):
 * - Renders curved or smooth bezier path.
 * - Edge label truncated to 40 chars when longer.
 * - Shows full text on hover and keyboard focus (tabIndex={0}).
 * - All text rendered as plain React text (no dangerouslySetInnerHTML).
 */
export function DiagramEdge({
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
}: EdgeProps & { data?: DiagramEdgeData }): React.ReactElement {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const flows = data?.flows || "";
  const isTruncated = flows.length > 40;
  const displayLabel = isTruncated ? `${flows.slice(0, 40)}…` : flows;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          strokeWidth: 1.5,
          stroke: "var(--border, #64748b)",
          ...style,
        }}
      />
      {flows && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
          >
            <div
              tabIndex={0}
              role="note"
              aria-label={`Flow: ${flows}`}
              title={flows}
              className={cn(
                "group relative cursor-help rounded-md border border-border/80 bg-background/95 px-2 py-0.5 text-[11px] font-mono text-muted-foreground shadow-sm transition-colors",
                "hover:border-foreground/50 hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:text-foreground",
              )}
            >
              <span className="block max-w-[150px] truncate select-none">
                {displayLabel}
              </span>

              {isTruncated && (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs text-popover-foreground shadow-lg group-hover:block group-focus:block group-focus-visible:block whitespace-normal max-w-xs break-words"
                >
                  {flows}
                </div>
              )}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
