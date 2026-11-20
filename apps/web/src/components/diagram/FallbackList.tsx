import React from "react";
import type { ArchitectureSpec, NodeSpec } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface FallbackListProps {
  spec: ArchitectureSpec;
  flowOrder: string[];
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  className?: string;
}

/**
 * FallbackList: mobile fallback (under 768px) presenting architecture parts in flow_order.
 *
 * Requirements (BUILD_PLAN.md:434 & User Decisions):
 * - Items in flow_order showing:
 *   - name
 *   - type
 *   - role
 *   - the names it sends to (derived from outgoing edges, not IDs)
 * - Accessible list presentation, selectable when interactive.
 * - All text rendered as plain React text (no dangerouslySetInnerHTML).
 */
export function FallbackList({
  spec,
  flowOrder,
  selectedNodeId,
  onSelectNode,
  className,
}: FallbackListProps): React.ReactElement {
  const nodeMap = new Map<string, NodeSpec>(spec.nodes.map((n) => [n.id, n]));
  const nodeNameMap = new Map<string, string>(spec.nodes.map((n) => [n.id, n.name]));

  // Order nodes by flowOrder, with any unlisted nodes appended deterministically
  const orderedNodes: NodeSpec[] = [];
  const seenIds = new Set<string>();

  for (const id of flowOrder) {
    const node = nodeMap.get(id);
    if (node && !seenIds.has(id)) {
      orderedNodes.push(node);
      seenIds.add(id);
    }
  }

  for (const node of spec.nodes) {
    if (!seenIds.has(node.id)) {
      orderedNodes.push(node);
      seenIds.add(node.id);
    }
  }

  return (
    <section
      aria-label="Component Flow Order"
      className={cn("w-full space-y-3", className)}
    >
      <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground px-1">
        Components (Flow Order)
      </h3>
      <ol className="space-y-2.5">
        {orderedNodes.map((node, index) => {
          const sendsTo = spec.edges
            .filter((e) => e.from === node.id)
            .map((e) => {
              const targetName = nodeNameMap.get(e.to) ?? e.to;
              return e.condition ? `${targetName} (when: ${e.condition})` : targetName;
            });

          const isSelected = selectedNodeId === node.id;

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
                "rounded-xl border border-line bg-surface dark:border-border dark:bg-card p-4 text-card-foreground shadow-sm transition-colors",
                isSelected
                  ? "border-primary ring-1 ring-primary"
                  : "hover:border-foreground/30",
                onSelectNode && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground/70">
                      {index + 1}.
                    </span>
                    <h4 className="font-semibold text-base text-foreground break-words">
                      {node.name}
                    </h4>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground mt-0.5 break-words">
                    {node.type}
                  </p>
                </div>
                {node.needs_model && (
                  <span className="shrink-0 rounded bg-amber-50 text-amber-700 border border-amber-600/30 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30 px-1.5 py-0.5 font-mono text-[10px]">
                    AI model
                  </span>
                )}
              </div>

              <p className="mt-2 text-sm text-foreground/90 break-words leading-relaxed">
                {node.role}
              </p>

              <div className="mt-3 pt-2.5 border-t border-border/50 text-xs">
                <span className="font-mono text-muted-foreground uppercase tracking-wider text-[11px]">
                  Sends to:{" "}
                </span>
                {sendsTo.length > 0 ? (
                  <span className="text-foreground break-words font-medium">
                    {sendsTo.join(", ")}
                  </span>
                ) : (
                  <span className="text-muted-foreground italic">None (exit node)</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

