import React from "react";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  BLOCK_NODE_HEIGHT,
  BLOCK_NODE_WIDTH,
  formatShortRole,
} from "./blockLayout";

export interface BlockNodeData {
  id: string;
  name: string;
  role?: string;
  layer?: string;
  isEntry?: boolean;
  isExit?: boolean;
  needs_model?: boolean;
  ai_role?: "none" | "model" | "agent";
  diffStatus?: "added" | "removed" | "edited" | "unchanged";
  width?: number;
  height?: number;
  [key: string]: unknown;
}

/**
 * BlockNode: Compact rectangular card for the layered Block diagram view.
 *
 * Implements Stage V3-4B (D-396):
 * - Fixed 240x92px compact rectangle card (no SVG polygon shapes).
 * - Card classes: border border-line bg-surface dark:bg-card.
 * - Displays:
 *   1. Node name (up to 2 lines, text-xs font-semibold text-foreground)
 *   2. Single role line via formatShortRole (11px, text-text-muted)
 *   3. Badge pills row: Entry (emerald), Exit (violet), AI model (amber)
 * - Retains accessibility: role="img", aria-label="Node: <name>, Layer: <layer>".
 * - Left (target) and Right (source) handles for horizontal swimlane flow.
 */
export function BlockNode({
  data,
}: NodeProps & { data: BlockNodeData }): React.ReactElement {
  const layerName = data.layer && data.layer.trim().length > 0 ? data.layer : "Other parts";
  const baseLabel = `Node: ${data.name}, Layer: ${layerName}`;
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

  const hasAi = Boolean(
    data.needs_model || data.ai_role === "model" || data.ai_role === "agent",
  );
  const aiBadgeLabel = data.ai_role === "agent" ? "Agent" : "AI";

  const formattedRole = formatShortRole(data.role);

  const width = typeof data.width === "number" ? data.width : BLOCK_NODE_WIDTH;
  const height = typeof data.height === "number" ? data.height : BLOCK_NODE_HEIGHT;

  return (
    <div
      role="img"
      aria-label={accessibleLabel}
      style={{ width, height }}
      className={cn(
        "relative flex select-none flex-col justify-between rounded-lg border border-line bg-surface dark:bg-card px-3 py-2 text-card-foreground shadow-xs transition-all",
        data.diffStatus === "added" &&
          "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background",
        data.diffStatus === "removed" &&
          "border-dashed ring-2 ring-rose-500 ring-offset-2 ring-offset-background opacity-70",
        data.diffStatus === "edited" &&
          "ring-2 ring-sky-500 ring-offset-2 ring-offset-background",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="size-1.5 border-none bg-muted-foreground/40 pointer-events-none"
        aria-hidden="true"
      />

      {/* Top: Node Name (max 2 lines) */}
      <div className="min-w-0 overflow-hidden w-full flex items-center justify-center">
        <p
          className="line-clamp-2 break-words text-xs font-semibold text-foreground tracking-tight leading-snug text-center"
          title={data.name}
        >
          {data.name}
        </p>
      </div>

      {/* Middle: Role line (1 line via formatShortRole, 11px text-text-muted) */}
      {formattedRole ? (
        <div className="min-w-0 overflow-hidden w-full flex items-center justify-center">
          <p
            className="line-clamp-1 truncate text-[11px] text-text-muted text-center leading-tight"
            title={data.role}
          >
            {formattedRole}
          </p>
        </div>
      ) : null}

      {/* Bottom: Badge Pills Row (Entry, Exit, AI model, Diff) */}
      <div className="flex items-center justify-center gap-1.5 flex-wrap min-h-[18px]">
        {diffBadge && (
          <span
            className={cn(
              "font-mono text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border",
              data.diffStatus === "added" &&
                "border-emerald-600/40 text-emerald-700 bg-emerald-50 dark:border-emerald-500/50 dark:text-emerald-400 dark:bg-emerald-500/10",
              data.diffStatus === "removed" &&
                "border-rose-600/40 text-rose-700 bg-rose-50 dark:border-rose-500/50 dark:text-rose-400 dark:bg-rose-500/10",
              data.diffStatus === "edited" &&
                "border-sky-600/40 text-sky-700 bg-sky-50 dark:border-sky-500/50 dark:text-sky-400 dark:bg-sky-500/10",
            )}
          >
            {diffBadge}
          </span>
        )}
        {data.isEntry && (
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border border-emerald-600/40 text-emerald-700 bg-emerald-50 dark:border-emerald-500/50 dark:text-emerald-400 dark:bg-emerald-500/10">
            Entry
          </span>
        )}
        {data.isExit && (
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border border-violet-600/40 text-violet-700 bg-violet-50 dark:border-violet-500/50 dark:text-violet-400 dark:bg-violet-500/10">
            Exit
          </span>
        )}
        {hasAi && (
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-600/40 text-amber-700 bg-amber-50 dark:border-amber-500/50 dark:text-amber-400 dark:bg-amber-500/10">
            {aiBadgeLabel}
          </span>
        )}
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
