import React from "react";
import { X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import type { ArchitectureSpec, NodeSpec } from "@/lib/types";

export interface DetailPanelProps {
  node: NodeSpec | null;
  spec: ArchitectureSpec;
  onClose?: () => void;
}

/**
 * Node Detail Panel.
 *
 * Requirements (BUILD_PLAN.md:441 & Revision 2):
 * Sections in this exact order:
 * 1. Name and type (in full)
 * 2. Role (in full)
 * 3. Connected from and Sends to (names from edges, not ids)
 * 4. Inputs (data labels)
 * 5. Outputs (data labels)
 * 6. "Suggestions (not verified)" for tech_options (hidden when empty)
 * 7. "Rules this part takes part in" with each rule's plain text (rules where node is node_id, a or b)
 *
 * Special notes:
 * - A needs_model node also shows "This part uses an AI model."
 * - No sizing button.
 * - Right column at 1024px or more, below diagram otherwise.
 * - All text rendered as plain React text (no dangerouslySetInnerHTML).
 */
export function DetailPanel({
  node,
  spec,
  onClose,
}: DetailPanelProps): React.ReactElement | null {
  if (!node) {
    return null;
  }

  const nodeMap = new Map(spec.nodes.map((n) => [n.id, n.name]));

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
      className="flex w-full flex-col rounded-xl border bg-card p-5 text-card-foreground shadow-sm lg:w-80 lg:shrink-0"
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
              <h4 className="font-mono text-xs uppercase tracking-wider text-amber-500">
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
              <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Rules this part takes part in
              </h4>
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
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-400">
              This part uses an AI model.
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

