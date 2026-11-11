import React from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
} from "@xyflow/react";
import { cn } from "@/lib/utils";
import { MAX_LABEL_TEXT_WIDTH } from "./layout";

export type DiagramEdgeData = {
  flows: string;
  condition?: string | null;
  pathD?: string;
  labelX?: number;
  labelY?: number;
  labelWidth?: number;
  labelHeight?: number;
  diffStatus?: "added" | "removed" | "edited" | "unchanged";
  dimmed?: boolean;
  [key: string]: unknown;
};

/**
 * Custom Diagram Edge with truncated label (max 40 chars), condition badge, and hover/focus disclosure.
 *
 * Requirements (Stage B4e2, D-189; Stage B1a, D-295):
 * - Uses pure layout pathD and labelX/labelY when computed by computeEdgeLabelLayout.
 * - Falls back cleanly to getSmoothStepPath if custom layout data is missing.
 * - Condition badge rendered above flows label (plain text, max 40 chars truncated, full on hover/focus).
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
  // Use precomputed layout path and label coordinates if available
  const hasCustomLayout =
    typeof data?.pathD === "string" &&
    data.pathD.length > 0 &&
    typeof data?.labelX === "number" &&
    typeof data?.labelY === "number";

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (hasCustomLayout && data) {
    edgePath = data.pathD!;
    labelX = data.labelX!;
    labelY = data.labelY!;
  } else {
    // Fallback for legacy specs or standalone test rendering
    const [fallbackPath, fallbackX, fallbackY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 5,
    });
    edgePath = fallbackPath;
    labelX = fallbackX;
    labelY = fallbackY;
  }

  const flows = data?.flows || "";
  const isTruncated = flows.length > 40;
  const displayLabel = isTruncated ? `${flows.slice(0, 40)}…` : flows;

  const condition = (data?.condition || "").trim();
  const isCondTruncated = condition.length > 40;
  const displayCondition = isCondTruncated ? `${condition.slice(0, 40)}…` : condition;

  const hasLabel = Boolean(flows || condition);
  const isRemoved = data?.diffStatus === "removed";
  const hasCondition = condition.length > 0;

  const strokeDasharray = isRemoved ? "6 6" : hasCondition ? "5 4" : undefined;
  const strokeColor = isRemoved ? "#f43f5e" : "var(--muted-foreground, #94a3b8)";
  const strokeOpacity = isRemoved ? 0.6 : 1;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          strokeWidth: 1.5,
          stroke: strokeColor,
          strokeDasharray,
          opacity: data?.dimmed ? 0.25 : strokeOpacity,
          ...style,
        }}
      />
      {hasLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              zIndex: 1001,
            }}
            className={cn(
              "nodrag nopan flex flex-col items-center gap-1.5 transition-opacity",
              data?.dimmed && "opacity-30 focus-within:opacity-100",
            )}
          >
            {condition && (
              <div
                tabIndex={0}
                role="note"
                aria-label={`Condition: ${condition}`}
                title={condition}
                className={cn(
                  "group relative cursor-help rounded-sm border border-amber-500/40 bg-card px-1.5 py-0.5 text-[10px] font-mono text-amber-500 transition-colors",
                  "hover:border-amber-500 hover:text-amber-400",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:text-amber-400",
                )}
              >
                <span
                  style={{ maxWidth: `${MAX_LABEL_TEXT_WIDTH}px` }}
                  className="block truncate select-none leading-none"
                >
                  {displayCondition}
                </span>

                {isCondTruncated && (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs text-popover-foreground shadow-lg group-hover:block group-focus:block group-focus-visible:block whitespace-normal max-w-xs break-words"
                  >
                    {condition}
                  </div>
                )}
              </div>
            )}

            {flows && (
              <div
                tabIndex={0}
                role="note"
                aria-label={`Flow: ${flows}`}
                title={flows}
                className={cn(
                  "group relative cursor-help rounded-xl border border-border/80 bg-background px-2 py-0.5 text-[11px] font-mono text-muted-foreground shadow-sm transition-colors",
                  "hover:border-foreground/50 hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:text-foreground",
                )}
              >
                <span
                  style={{ maxWidth: `${MAX_LABEL_TEXT_WIDTH}px` }}
                  className="block truncate select-none"
                >
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
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
