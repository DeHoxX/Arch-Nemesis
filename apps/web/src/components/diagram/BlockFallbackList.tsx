import React from "react";
import type { ArchitectureSpec, NodeSpec } from "@/lib/types";
import { cn } from "@/lib/utils";
import { computeBlockLayout, formatShortRole } from "./blockLayout";

export interface BlockFallbackListProps {
  spec: ArchitectureSpec;
  flowOrder?: string[] | null;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  className?: string;
}

/**
 * BlockFallbackList: Mobile fallback (under 768px) presenting architecture
 * components grouped by functional swimlane layer (Stage V3-4C, D-398).
 *
 * Requirements:
 * - Uses computeBlockLayout from blockLayout.ts to determine layer column order and node distribution.
 * - Old designs without layers: groups titled "Stage 1", "Stage 2"... (DAG depth fallback).
 * - Unassigned layer nodes: grouped under "Other parts" rightmost / last.
 * - Each group renders an <h3> with layer title and node count.
 * - Nodes within each group render in flow order with <h4> name, 1-line formatShortRole role,
 *   outgoing destination names, and Entry/Exit/AI pills only. Node type is NOT shown.
 * - Semantic dual-theme tokens only (never bare .light).
 * - All text rendered as plain React text (Rule 5).
 */
export function BlockFallbackList({
  spec,
  flowOrder,
  selectedNodeId,
  onSelectNode,
  className,
}: BlockFallbackListProps): React.ReactElement {
  const nodeMap = new Map<string, NodeSpec>(spec.nodes.map((n) => [n.id, n]));
  const nodeNameMap = new Map<string, string>(spec.nodes.map((n) => [n.id, n.name]));

  // Compute block layout to get layer ordering and column assignment
  const layout = computeBlockLayout(spec, flowOrder);

  // Filter columns that have at least one node
  const visibleColumns = layout.columns.filter((col) => col.nodeIds.length > 0);

  const entrySet = new Set(spec.entry_ids ?? []);
  const exitSet = new Set(spec.exit_ids ?? []);

  return (
    <section
      aria-label="Layered Component Breakdown"
      className={cn("w-full space-y-6", className)}
    >
      {visibleColumns.map((col) => {
        const columnNodes = col.nodeIds
          .map((id) => nodeMap.get(id))
          .filter((n): n is NodeSpec => Boolean(n));

        return (
          <div key={col.id} className="space-y-3">
            {/* Layer heading: <h3> with layer title and node count */}
            <h3 className="font-heading text-sm font-semibold tracking-tight text-foreground flex items-center justify-between border-b border-line pb-1.5 px-0.5">
              <span className="break-words">{col.name}</span>
              <span className="rounded-md border border-line bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-muted">
                {col.nodeIds.length} {col.nodeIds.length === 1 ? "part" : "parts"}
              </span>
            </h3>

            <ol className="space-y-2.5">
              {columnNodes.map((node) => {
                const sendsTo = (spec.edges ?? [])
                  .filter((e) => e.from === node.id)
                  .map((e) => {
                    const targetName = nodeNameMap.get(e.to) ?? e.to;
                    return e.condition ? `${targetName} (when: ${e.condition})` : targetName;
                  });

                const isSelected = selectedNodeId === node.id;
                const isEntry = entrySet.has(node.id);
                const isExit = exitSet.has(node.id);
                const hasAi = Boolean(node.needs_model);
                const shortRole = formatShortRole(node.role);

                return (
                  <li
                    key={node.id}
                    onClick={() => onSelectNode?.(node.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectNode?.(node.id);
                      }
                    }}
                    tabIndex={onSelectNode ? 0 : undefined}
                    role={onSelectNode ? "button" : undefined}
                    aria-pressed={onSelectNode ? isSelected : undefined}
                    className={cn(
                      "rounded-xl border border-line bg-surface dark:bg-card p-4 text-card-foreground shadow-sm transition-colors",
                      isSelected
                        ? "border-primary ring-1 ring-primary"
                        : "hover:border-foreground/30",
                      onSelectNode && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-base text-foreground break-words flex-1">
                        {node.name}
                      </h4>

                      {/* Entry / Exit / AI text pills only (type is omitted) */}
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        {isEntry && (
                          <span className="rounded border border-emerald-600/40 text-emerald-700 bg-emerald-50 dark:border-emerald-500/50 dark:text-emerald-400 dark:bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider">
                            Entry
                          </span>
                        )}
                        {isExit && (
                          <span className="rounded border border-violet-600/40 text-violet-700 bg-violet-50 dark:border-violet-500/50 dark:text-violet-400 dark:bg-violet-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider">
                            Exit
                          </span>
                        )}
                        {hasAi && (
                          <span className="rounded border border-amber-600/40 text-amber-700 bg-amber-50 dark:border-amber-500/50 dark:text-amber-400 dark:bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider">
                            AI model
                          </span>
                        )}
                      </div>
                    </div>

                    {shortRole ? (
                      <p
                        className="mt-1.5 text-sm text-text-muted break-words leading-relaxed"
                        title={node.role}
                      >
                        {shortRole}
                      </p>
                    ) : null}

                    <div className="mt-3 pt-2.5 border-t border-line text-xs">
                      <span className="font-mono text-text-muted uppercase tracking-wider text-[11px]">
                        Sends to:{" "}
                      </span>
                      {sendsTo.length > 0 ? (
                        <span className="text-foreground break-words font-medium">
                          {sendsTo.join(", ")}
                        </span>
                      ) : (
                        <span className="text-text-muted italic">None (exit node)</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </section>
  );
}
