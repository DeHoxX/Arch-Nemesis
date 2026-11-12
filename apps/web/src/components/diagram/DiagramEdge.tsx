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
  selected?: boolean;
  playbackStepNumber?: number | null;
  onSelect?: (edgeId: string) => void;
  [key: string]: unknown;
};

/**
 * Custom Diagram Edge with truncated label (max 40 chars), condition badge, and hover/focus disclosure.
 *
 * Requirements (Stage B4e2, D-189; Stage B1a, D-295; Stage 1B, D-324, D-325):
 * - Uses pure layout pathD and labelX/labelY when computed by computeEdgeLabelLayout.
 * - Falls back cleanly to getSmoothStepPath if custom layout data is missing.
 * - Single merged opaque label (rounded-md, 1px border-border, bg-card):
 *   - Condition line on top (amber text, mono, only when condition is non-empty).
 *   - Flows text below (muted-foreground, mono).
 * - Edge label and condition truncated to 40 chars when longer.
 * - Native <button type="button"> with aria-pressed, Enter/Space selection.
 * - interactionWidth={20} on BaseEdge for clickable hit area.
 * - Selected stroke: var(--brand-accent, #b7c6c2), width 2.5, highlighted border.
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
  selected,
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
  const isSelected = Boolean(selected || data?.selected);
  const isDimmed = Boolean(data?.dimmed);

  const strokeDasharray = isRemoved ? "6 6" : hasCondition ? "5 4" : undefined;
  const strokeColor = isSelected
    ? "var(--brand-accent, #b7c6c2)"
    : isRemoved
      ? "#f43f5e"
      : "var(--muted-foreground, #94a3b8)";
  const strokeWidth = isSelected ? 2.5 : 1.5;
  const strokeOpacity = isRemoved ? 0.6 : 1;

  const playbackStepNumber = data?.playbackStepNumber;
  const showPlaybackBadge = typeof playbackStepNumber === "number" && playbackStepNumber > 0;

  const baseAriaLabel =
    hasCondition && flows
      ? `Condition: ${condition}, Flow: ${flows}`
      : hasCondition
        ? `Condition: ${condition}`
        : `Flow: ${flows}`;
  const edgeAriaLabel = showPlaybackBadge
    ? `Step ${playbackStepNumber}: ${baseAriaLabel}`
    : baseAriaLabel;

  const baseTitle =
    hasCondition && flows
      ? `Condition: ${condition}\nFlow: ${flows}`
      : hasCondition
        ? `Condition: ${condition}`
        : flows;
  const edgeTitle = showPlaybackBadge
    ? `Step ${playbackStepNumber}\n${baseTitle}`
    : baseTitle;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={20}
        style={{
          strokeWidth,
          stroke: strokeColor,
          strokeDasharray,
          opacity: isDimmed ? 0.25 : strokeOpacity,
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
              "nodrag nopan transition-opacity",
              isDimmed && "opacity-25 focus-within:opacity-100",
            )}
          >
            <button
              type="button"
              aria-pressed={isSelected}
              aria-label={edgeAriaLabel}
              title={edgeTitle}
              onClick={(e) => {
                e.stopPropagation();
                if (typeof data?.onSelect === "function") {
                  data.onSelect(id);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (typeof data?.onSelect === "function") {
                    data.onSelect(id);
                  }
                }
              }}
              className={cn(
                "group relative flex flex-col items-center justify-center cursor-pointer rounded-md border bg-card px-2 py-1 text-center shadow-xs transition-colors outline-none",
                isSelected
                  ? "border-[var(--brand-accent,#b7c6c2)] ring-1 ring-[var(--brand-accent,#b7c6c2)] text-foreground"
                  : "border-border hover:border-foreground/50 text-muted-foreground",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              )}
            >
              {showPlaybackBadge && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center rounded-xs font-mono text-[9px] font-bold px-1 py-0 mb-0.5 leading-none select-none",
                    isSelected
                      ? "bg-[var(--brand-accent,#b7c6c2)] text-[var(--brand-accent-ink,#111111)]"
                      : "bg-muted text-muted-foreground",
                  )}
                  aria-label={`Step ${playbackStepNumber}`}
                >
                  {playbackStepNumber}
                </span>
              )}
              {hasCondition && (
                <span
                  style={{ maxWidth: `${MAX_LABEL_TEXT_WIDTH}px` }}
                  className="block truncate font-mono text-[10px] text-amber-500 leading-tight select-none"
                >
                  {displayCondition}
                </span>
              )}
              {flows && (
                <span
                  style={{ maxWidth: `${MAX_LABEL_TEXT_WIDTH}px` }}
                  className="block truncate font-mono text-[11px] text-muted-foreground group-hover:text-foreground leading-tight select-none"
                >
                  {displayLabel}
                </span>
              )}

              {(isCondTruncated || isTruncated) && (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs text-popover-foreground shadow-lg group-hover:block group-focus:block group-focus-visible:block whitespace-normal max-w-xs break-words text-left"
                >
                  {hasCondition && (
                    <p className="font-mono text-[10px] text-amber-500 mb-0.5">
                      Condition: {condition}
                    </p>
                  )}
                  {flows && (
                    <p className="font-mono text-[11px] text-foreground">
                      Flow: {flows}
                    </p>
                  )}
                </div>
              )}
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
