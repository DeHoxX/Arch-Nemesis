import React from "react";
import { Handle, type NodeProps, Position } from "@xyflow/react";

export interface BlockNodeData {
  id: string;
  name: string;
  isEntry: boolean;
  isExit: boolean;
  [key: string]: unknown;
}

/**
 * BlockNode: Simple, non-interactive block diagram node.
 *
 * Requirements (Stage A & User Decisions):
 * - Renders node name only + small [Entry] / [Exit] text marker.
 * - One neutral style (border-border bg-card).
 * - No component type, no role, no badges, no lock icon.
 * - Non-interactive: no tabIndex, role="img", aria-label announcing name and entry/exit status.
 * - Fixed 220 by 72 pixels.
 */
export function BlockNode({
  data,
}: NodeProps & { data: BlockNodeData }): React.ReactElement {
  const markerLabel = [
    data.isEntry ? "entry" : "",
    data.isExit ? "exit" : "",
  ]
    .filter(Boolean)
    .join(", ");

  const accessibleLabel = markerLabel
    ? `Block: ${data.name}, ${markerLabel}`
    : `Block: ${data.name}`;

  return (
    <div
      role="img"
      aria-label={accessibleLabel}
      className="relative flex h-[72px] w-[220px] select-none flex-col justify-between overflow-hidden rounded-lg border border-border/80 bg-card p-3 text-card-foreground shadow-xs"
    >
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

