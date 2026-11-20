import React from "react";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { EdgeSpec } from "@/lib/types";
import { cn } from "@/lib/utils";
import { classifyNodeShape } from "./classify";
import { DIAMOND_INNER_WIDTH } from "./layout";

export interface BlockNodeData {
  id: string;
  name: string;
  isEntry: boolean;
  isExit: boolean;
  needs_model?: boolean;
  ai_role?: "none" | "model" | "agent";
  edges?: EdgeSpec[];
  width?: number;
  height?: number;
  diffStatus?: "added" | "removed" | "edited" | "unchanged";
  [key: string]: unknown;
}

/**
 * BlockNode: Simple, non-interactive block diagram node.
 *
 * Requirements (Stage B4e1 & D-188 Fix):
 * - Fixed 240px width; content-computed height.
 * - Handles: Top (target) and Bottom (source) centered.
 * - Renders node name only + small [Entry] / [Exit] text marker.
 * - Shapes derived from structure:
 *   1. isEntry || isExit -> pill
 *   2. diamond decision -> diamond with centered inner box (DIAMOND_INNER_WIDTH = 112px)
 *   3. needs_model (or ai_role model/agent) -> hexagon
 *   4. otherwise -> rectangle
 * - One neutral style (border-border bg-card).
 * - No component type, no role, no badges, no lock icon.
 * - Non-interactive: no tabIndex, role="img", aria-label announcing name and entry/exit status.
 */
export function BlockNode({
  data,
}: NodeProps & { data: BlockNodeData }): React.ReactElement {
  const shape = classifyNodeShape(
    {
      id: data.id,
      needs_model: Boolean(data.needs_model),
      ai_role: data.ai_role,
    },
    {
      entry_ids: data.isEntry ? [data.id] : [],
      exit_ids: data.isExit ? [data.id] : [],
      edges: data.edges || [],
    },
  );

  const markerLabel = [
    data.isEntry ? "entry" : "",
    data.isExit ? "exit" : "",
  ]
    .filter(Boolean)
    .join(", ");

  const baseLabel = markerLabel
    ? `Block: ${data.name}, ${markerLabel}`
    : `Block: ${data.name}`;

  const accessibleLabel =
    data.diffStatus && data.diffStatus !== "unchanged"
      ? `${baseLabel}, ${data.diffStatus}`
      : baseLabel;

  const diffBadge =
    data.diffStatus === "added"
      ? "New"
      : data.diffStatus === "removed"
        ? "Removed"
        : data.diffStatus === "edited"
          ? "Edited"
          : null;

  const isHexagon = shape === "hexagon";
  const isDiamond = shape === "diamond";
  const isPill = shape === "pill";

  const width = typeof data.width === "number" ? data.width : 240;
  const height = typeof data.height === "number" ? data.height : (isDiamond ? 140 : 80);

  return (
    <div
      role="img"
      aria-label={accessibleLabel}
      style={{ width, height }}
      className={cn(
        "relative flex select-none flex-col items-center justify-center text-center text-card-foreground shadow-xs transition-all",
        !isHexagon && !isDiamond && "border border-line bg-surface dark:border-border/80 dark:bg-card",
        !isHexagon && !isDiamond && (isPill ? "rounded-full px-8 py-2" : "rounded-lg px-3 py-2"),
        isHexagon && "px-7 py-2.5",
        data.diffStatus === "added" && "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background",
        data.diffStatus === "removed" && "border-dashed ring-2 ring-rose-500 ring-offset-2 ring-offset-background opacity-70",
        data.diffStatus === "edited" && "ring-2 ring-sky-500 ring-offset-2 ring-offset-background",
        (isHexagon || isDiamond) && (data.diffStatus && data.diffStatus !== "unchanged") && "rounded-lg",
      )}
    >
      {/* Hexagon SVG background & neutral border outline */}
      {isHexagon && (
        <svg
          className="absolute inset-0 size-full pointer-events-none -z-10"
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon
            points={`18,1 ${width - 18},1 ${width - 1},${height / 2} ${width - 18},${height - 1} 18,${height - 1} 1,${height / 2}`}
            className="fill-surface stroke-line dark:fill-card dark:stroke-border/80"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* Diamond SVG background & neutral border outline */}
      {isDiamond && (
        <svg
          className="absolute inset-0 size-full pointer-events-none -z-10"
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon
            points={`${width / 2},1 ${width - 1},${height / 2} ${width / 2},${height - 1} 1,${height / 2}`}
            className="fill-surface stroke-line dark:fill-card dark:stroke-border/80"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )}

      <Handle
        type="target"
        position={Position.Left}
        className="size-1.5 border-none bg-muted-foreground/40 pointer-events-none"
        aria-hidden="true"
      />

      {isDiamond ? (
        /* Diamond centered inner box (D-188): strictly bounded to central rhombus region */
        <div
          style={{ width: DIAMOND_INNER_WIDTH, maxHeight: Math.round(height * 0.52) }}
          className="diamond-inner-box flex flex-col items-center justify-center text-center overflow-hidden gap-1 px-1 py-0.5 pointer-events-auto"
        >
          {/* Top marker */}
          {(diffBadge || data.isEntry || data.isExit) && (
            <div className="flex items-center justify-center gap-1 flex-wrap">
              {diffBadge && (
                <span
                  className={cn(
                    "font-mono text-[9px] font-semibold uppercase tracking-wider px-1 py-0 rounded border",
                    data.diffStatus === "added" && "border-emerald-600/40 text-emerald-700 bg-emerald-50 dark:border-emerald-500/50 dark:text-emerald-400 dark:bg-emerald-500/10",
                    data.diffStatus === "removed" && "border-rose-600/40 text-rose-700 bg-rose-50 dark:border-rose-500/50 dark:text-rose-400 dark:bg-rose-500/10",
                    data.diffStatus === "edited" && "border-sky-600/40 text-sky-700 bg-sky-50 dark:border-sky-500/50 dark:text-sky-400 dark:bg-sky-500/10",
                  )}
                >
                  {diffBadge}
                </span>
              )}
              {data.isEntry && (
                <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  [Entry]
                </span>
              )}
              {data.isExit && (
                <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                  [Exit]
                </span>
              )}
            </div>
          )}

          {/* Node Name */}
          <p
            className="line-clamp-2 break-words text-xs font-semibold text-foreground tracking-tight leading-snug text-center"
            title={data.name}
          >
            {data.name}
          </p>
        </div>
      ) : (
        /* Non-diamond standard layout - vertically and horizontally centered */
        <div className="flex flex-col items-center justify-center text-center w-full max-w-full overflow-hidden gap-1 pointer-events-auto">
          {/* Top marker */}
          {(diffBadge || data.isEntry || data.isExit) && (
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              {diffBadge && (
                <span
                  className={cn(
                    "font-mono text-[10px] font-semibold uppercase tracking-wider px-1 py-0 rounded border",
                    data.diffStatus === "added" && "border-emerald-600/40 text-emerald-700 bg-emerald-50 dark:border-emerald-500/50 dark:text-emerald-400 dark:bg-emerald-500/10",
                    data.diffStatus === "removed" && "border-rose-600/40 text-rose-700 bg-rose-50 dark:border-rose-500/50 dark:text-rose-400 dark:bg-rose-500/10",
                    data.diffStatus === "edited" && "border-sky-600/40 text-sky-700 bg-sky-50 dark:border-sky-500/50 dark:text-sky-400 dark:bg-sky-500/10",
                  )}
                >
                  {diffBadge}
                </span>
              )}
              {data.isEntry && (
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  [Entry]
                </span>
              )}
              {data.isExit && (
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                  [Exit]
                </span>
              )}
            </div>
          )}

          {/* Middle: Node Name */}
          <div className="min-w-0 overflow-hidden w-full flex items-center justify-center">
            <p
              className="line-clamp-2 break-words text-xs font-semibold text-foreground tracking-tight leading-snug text-center"
              title={data.name}
            >
              {data.name}
            </p>
          </div>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="size-1.5 border-none bg-muted-foreground/40 pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}
