import React from "react";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { EdgeSpec } from "@/lib/types";
import { cn } from "@/lib/utils";
import { classifyNodeShape } from "./classify";

export interface BlockNodeData {
  id: string;
  name: string;
  isEntry: boolean;
  isExit: boolean;
  needs_model?: boolean;
  ai_role?: "none" | "model" | "agent";
  edges?: EdgeSpec[];
  [key: string]: unknown;
}

/**
 * BlockNode: Simple, non-interactive block diagram node.
 *
 * Requirements (Stage A, B4a & B4b Decisions):
 * - Renders node name only + small [Entry] / [Exit] text marker.
 * - Shapes derived from structure:
 *   1. isEntry || isExit -> pill
 *   2. diamond decision -> diamond
 *   3. needs_model (or ai_role model/agent) -> hexagon
 *   4. otherwise -> rectangle
 * - One neutral style (border-border bg-card).
 * - No component type, no role, no badges, no lock icon.
 * - Non-interactive: no tabIndex, role="img", aria-label announcing name and entry/exit status.
 * - Fixed 220 by 72 pixels.
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

  return (
    <div
      role="img"
      aria-label={accessibleLabel}
      className={cn(
        "relative flex h-[72px] w-[220px] select-none flex-col justify-between text-card-foreground shadow-xs",
        !isHexagon && !isDiamond && "border border-border/80 bg-card p-3",
        !isHexagon && !isDiamond && (isPill ? "rounded-full px-5" : "rounded-lg"),
        isHexagon && "px-6 py-3",
        isDiamond && "px-7 py-3",
      )}
    >
      {/* Hexagon SVG background & neutral border outline */}
      {isHexagon && (
        <svg
          className="absolute inset-0 size-full pointer-events-none -z-10"
          viewBox="0 0 220 72"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon
            points="18,1 202,1 219,36 202,71 18,71 1,36"
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
          viewBox="0 0 220 72"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon
            points="110,1 219,36 110,71 1,36"
            className="fill-card stroke-border/80"
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
      <div className="min-w-0 overflow-hidden">
        <p
          className="truncate text-xs font-semibold text-foreground tracking-tight"
          title={data.name}
        >
          {data.name}
        </p>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="size-1.5 border-none bg-muted-foreground/40 pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}
