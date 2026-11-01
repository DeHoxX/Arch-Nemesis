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

  const accessibleLabel = markerLabel
    ? `Block: ${data.name}, ${markerLabel}`
    : `Block: ${data.name}`;

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
        "relative flex select-none flex-col text-card-foreground shadow-xs transition-all",
        isDiamond ? "items-center justify-center" : "justify-between",
        !isHexagon && !isDiamond && "border border-border/80 bg-card",
        !isHexagon && !isDiamond && (isPill ? "rounded-full px-8 py-2" : "rounded-lg px-3 py-2"),
        isHexagon && "px-7 py-2.5",
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
            className="fill-card stroke-border/80"
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
            className="fill-card stroke-border/80"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )}

      <Handle
        type="target"
        position={Position.Top}
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
          <div className="flex items-center justify-center gap-1 h-3">
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

          {/* Node Name */}
          <p
            className="line-clamp-2 break-words text-xs font-semibold text-foreground tracking-tight leading-snug"
            title={data.name}
          >
            {data.name}
          </p>
        </div>
      ) : (
        /* Non-diamond standard layout */
        <>
          {/* Top row: [Entry] / [Exit] text marker (or empty spacer) */}
          <div className="flex items-center gap-1.5 h-3.5">
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

          {/* Middle/Bottom: Node Name */}
          <div className="min-w-0 overflow-hidden w-full">
            <p
              className="line-clamp-2 break-words text-xs font-semibold text-foreground tracking-tight leading-snug"
              title={data.name}
            >
              {data.name}
            </p>
          </div>
        </>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="size-1.5 border-none bg-muted-foreground/40 pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}
