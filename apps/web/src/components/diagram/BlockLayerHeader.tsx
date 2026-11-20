import React from "react";
import type { NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

export interface BlockLayerHeaderData {
  id: string;
  name: string;
  count: number;
  [key: string]: unknown;
}

/**
 * BlockLayerHeader: Swimlane column header band for the layered Block diagram view.
 *
 * Implements Stage V3-4B (D-396):
 * - Displays the layer title and total node count in a pill.
 * - Styled with semantic dual-theme tokens:
 *   - Container: bg-surface-elevated border-line
 *   - Title: text-foreground
 *   - Count badge: bg-surface border-line text-text-muted
 * - Non-interactive layout element.
 */
export function BlockLayerHeader({
  data,
}: NodeProps & { data: BlockLayerHeaderData }): React.ReactElement {
  return (
    <div
      role="group"
      aria-label={`Layer: ${data.name}, ${data.count} ${data.count === 1 ? "component" : "components"}`}
      className={cn(
        "flex h-11 w-[280px] select-none items-center justify-between rounded-lg border border-line bg-surface-elevated px-3 shadow-xs",
      )}
    >
      <span
        className="truncate text-xs font-semibold tracking-tight text-foreground"
        title={data.name}
      >
        {data.name}
      </span>
      <span
        className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-muted"
        aria-label={`${data.count} nodes`}
      >
        {data.count}
      </span>
    </div>
  );
}
