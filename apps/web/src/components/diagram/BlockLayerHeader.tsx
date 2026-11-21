import React from "react";
import type { NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

export interface BlockLayerHeaderData {
  id: string;
  name: string;
  count: number;
  selected?: boolean;
  dimmed?: boolean;
  onSelect?: (layerName: string) => void;
  [key: string]: unknown;
}

/**
 * BlockLayerHeader: Swimlane column header band for the layered Block diagram view.
 *
 * Implements Stage V3-4B, V3-4D1 (D-396, D-399):
 * - Displays the layer title and total node count in a pill.
 * - Interactive: tabIndex={0}, role="button", aria-pressed, keyboard Enter/Space.
 * - Reuses Architecture view selection ring: ring-2 ring-[var(--brand-accent,#b7c6c2)].
 * - Styled with semantic dual-theme tokens:
 *   - Container: bg-surface-elevated border-line
 *   - Title: text-foreground
 *   - Count badge: bg-surface border-line text-text-muted
 */
export function BlockLayerHeader({
  data,
}: NodeProps & { data: BlockLayerHeaderData }): React.ReactElement {
  const isSelected = Boolean(data.selected);

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`Layer: ${data.name}, ${data.count} ${data.count === 1 ? "component" : "components"}`}
      aria-pressed={isSelected}
      data-selected={isSelected ? "true" : "false"}
      data-dimmed={Boolean(data.dimmed) ? "true" : "false"}
      onClick={() => data.onSelect?.(data.name)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          data.onSelect?.(data.name);
        }
      }}
      className={cn(
        "flex h-11 w-[280px] select-none items-center justify-between rounded-lg border border-line bg-surface-elevated px-3 shadow-xs cursor-pointer outline-none transition-all",
        isSelected
          ? "ring-2 ring-[var(--brand-accent,#b7c6c2)] ring-offset-2 ring-offset-background border-transparent"
          : "hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
