import React from "react";
import { Lock, MessageSquare, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ArchitectureSpec, EdgeSpec, NodeSpec } from "@/lib/types";

export interface DetailPanelProps {
  node?: NodeSpec | null;
  edge?: EdgeSpec | null;
  spec: ArchitectureSpec;
  onClose?: () => void;
  onPrefillChat?: (text: string) => void;
  onSelectNode?: (nodeId: string) => void;
  disabledShortcuts?: boolean;
}

/**
 * Node & Edge Detail Panel.
 *
 * Requirements (BUILD_PLAN.md:441 & Revision 2; Stage 1B, D-325, D-326):
 * Node mode sections in this exact order:
 * 1. Name and type (in full)
 * 2. Role (in full)
 * 3. Connected from and Sends to (names from edges, not ids)
 * 4. Inputs (data labels)
 * 5. Outputs (data labels)
 * 6. "Suggestions (not verified)" for tech_options (hidden when empty)
 * 7. "Rules this part takes part in" with each rule's plain text and constraint icon
 *
 * Edge mode (D-325):
 * - <aside aria-label="Edge Details"> in identical docked slot
 * - Header: "Edge Details", Close button (aria-label="Close details")
 * - Sender & Receiver names with "Select node" actions
 * - Data flows (full text)
 * - Condition (only when non-empty after trim)
 *
 * Special notes:
 * - A needs_model node also shows "This part uses an AI model."
 * - No sizing button.
 * - Right column at 1024px or more, below diagram otherwise.
 * - All text rendered as plain React text (no dangerouslySetInnerHTML).
 */
export function DetailPanel({
  node,
  edge,
  spec,
  onClose,
  onPrefillChat,
  onSelectNode,
  disabledShortcuts = false,
}: DetailPanelProps): React.ReactElement | null {
  if (!node && !edge) {
    return null;
  }

  const nodeMap = new Map(spec.nodes.map((n) => [n.id, n.name]));

  // Edge mode (D-325)
  if (!node && edge) {
    const senderName = nodeMap.get(edge.from) ?? edge.from;
    const receiverName = nodeMap.get(edge.to) ?? edge.to;
    const condition = (edge.condition || "").trim();

    return (
      <aside
        aria-label="Edge Details"
        className="flex w-full flex-col rounded-xl border border-line bg-surface p-5 text-card-foreground shadow-sm lg:w-80 lg:shrink-0"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-lg text-foreground break-words">Edge Details</h3>
            <p className="font-mono text-xs text-muted-foreground break-words">Connection</p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <Separator className="my-4" />

        <div className="flex-1 space-y-4 text-sm overflow-y-auto">
          {/* Sender */}
          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Sender</h4>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-foreground font-medium break-words">{senderName}</span>
              {onSelectNode && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectNode(edge.from)}
                  className="h-7 text-xs font-mono text-muted-foreground hover:text-foreground"
                >
                  Select node
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Receiver */}
          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Receiver</h4>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-foreground font-medium break-words">{receiverName}</span>
              {onSelectNode && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectNode(edge.to)}
                  className="h-7 text-xs font-mono text-muted-foreground hover:text-foreground"
                >
                  Select node
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Data flows */}
          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Data flows</h4>
            <p className="mt-1 text-foreground leading-relaxed break-words">{edge.flows}</p>
          </div>

          {/* Condition (only rendered when non-empty after trim) */}
          {condition.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="font-mono text-xs uppercase tracking-wider text-amber-700 dark:text-amber-500">Condition</h4>
                <p className="mt-1 font-mono text-xs text-amber-700 dark:text-amber-500 leading-relaxed break-words">
                  {condition}
                </p>
              </div>
            </>
          )}
        </div>
      </aside>
    );
  }

  if (!node) {
    return null;
  }

  // 3. Connected from and Sends to (names from edges, not ids)
  const connectedFrom = spec.edges
    .filter((e) => e.to === node.id)
    .map((e) => nodeMap.get(e.from) ?? e.from);

  const sendsTo = spec.edges
    .filter((e) => e.from === node.id)
    .map((e) => ({
      name: nodeMap.get(e.to) ?? e.to,
      condition: e.condition,
    }));

  // 7. Rules this part takes part in (matching constraint lock logic)
  const participatingRules = spec.constraints.filter(
    (c) => c.node_id === node.id || c.a === node.id || c.b === node.id,
  );

  return (
    <aside
      aria-label="Node Details"
      className="flex w-full flex-col rounded-xl border border-line bg-surface p-5 text-card-foreground shadow-sm lg:w-80 lg:shrink-0"
    >
      {/* 1. Name and type */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-lg text-foreground break-words">{node.name}</h3>
          <p className="font-mono text-xs text-muted-foreground break-words">{node.type}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <Separator className="my-4" />

      <div className="flex-1 space-y-4 text-sm overflow-y-auto">
        {/* 2. Role */}
        <div>
          <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Role</h4>
          <p className="mt-1 text-foreground leading-relaxed break-words">{node.role}</p>
        </div>

        <Separator />

        {/* 3. Connected from and Sends to */}
        <div className="space-y-2">
          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Connected from
            </h4>
            {connectedFrom.length > 0 ? (
              <ul className="mt-1 list-disc list-inside text-foreground space-y-0.5">
                {connectedFrom.map((srcName, idx) => (
                  <li key={`${srcName}-${idx}`} className="break-words">
                    {srcName}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground italic">None (entry node)</p>
            )}
          </div>

          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Sends to
            </h4>
            {sendsTo.length > 0 ? (
              <ul className="mt-1 list-disc list-inside text-foreground space-y-0.5">
                {sendsTo.map((target, idx) => (
                  <li key={`${target.name}-${idx}`} className="break-words">
                    {target.name}
                    {target.condition && (
                      <span className="text-muted-foreground text-xs ml-1 font-mono">
                        (when: {target.condition})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground italic">None (exit node)</p>
            )}
          </div>
        </div>

        <Separator />

        {/* 4. Inputs */}
        <div>
          <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Inputs</h4>
          {node.inputs.length > 0 ? (
            <ul className="mt-1 list-disc list-inside text-foreground space-y-0.5">
              {node.inputs.map((inp, idx) => (
                <li key={`${inp}-${idx}`} className="break-words">
                  {inp}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground italic">None</p>
          )}
        </div>

        {/* 5. Outputs */}
        <div>
          <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Outputs</h4>
          {node.outputs.length > 0 ? (
            <ul className="mt-1 list-disc list-inside text-foreground space-y-0.5">
              {node.outputs.map((out, idx) => (
                <li key={`${out}-${idx}`} className="break-words">
                  {out}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground italic">None</p>
          )}
        </div>

        {/* 6. Suggestions (not verified) for tech_options (hidden when empty) */}
        {node.tech_options.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="font-mono text-xs uppercase tracking-wider text-amber-700 dark:text-amber-500">
                Suggestions (not verified)
              </h4>
              <ul className="mt-1 list-disc list-inside text-foreground space-y-0.5">
                {node.tech_options.map((opt, idx) => (
                  <li key={`${opt}-${idx}`} className="break-words">
                    {opt}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Tools (suggested) for agents */}
        {node.ai_role === "agent" && node.tools && node.tools.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Tools (suggested)
              </h4>
              <ul className="mt-1 list-disc list-inside text-foreground space-y-0.5">
                {node.tools.map((t, idx) => (
                  <li key={`${t}-${idx}`} className="break-words">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* 7. Rules this part takes part in */}
        {participatingRules.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center gap-1.5">
                <Lock className="size-3 text-amber-700 dark:text-amber-500 shrink-0" aria-label="Constraint" />
                <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Rules this part takes part in
                </h4>
              </div>
              <ul className="mt-1 list-disc list-inside text-foreground space-y-1">
                {participatingRules.map((r) => (
                  <li key={r.id} className="break-words">
                    {r.text}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* AI model statement */}
        {node.needs_model && (
          <>
            <Separator />
            <div className="rounded-md border border-amber-600/30 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 p-2.5 text-xs">
              This part uses an AI model.
            </div>
          </>
        )}

        {/* Node shortcuts (Phase 7D2, BUILD_PLAN.md:550) */}
        {onPrefillChat && (
          <>
            <Separator />
            <div className="space-y-2 pt-1" aria-label="Node chat shortcuts">
              <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Actions
              </h4>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const text = `Tell me about the '${node.name}' part: why is it needed and what could go wrong?`.slice(0, 1000);
                    onPrefillChat(text);
                    document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Refinement instruction input"]')?.focus();
                  }}
                  disabled={disabledShortcuts}
                  className="w-full justify-start text-xs h-8 text-foreground"
                >
                  <MessageSquare className="size-3.5 mr-1.5 text-muted-foreground" aria-hidden="true" />
                  Ask about this node
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const text = `Remove the '${node.name}' part and fix the connections around it`.slice(0, 1000);
                    onPrefillChat(text);
                    document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Refinement instruction input"]')?.focus();
                  }}
                  disabled={disabledShortcuts}
                  className="w-full justify-start text-xs h-8 text-foreground"
                >
                  <Trash2 className="size-3.5 mr-1.5 text-muted-foreground" aria-hidden="true" />
                  Remove this node
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
