import React from "react";
import Link from "next/link";
import { Bot, Layers, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ArchitectureSpec, ConstraintSpec, EdgeSpec, NodeSpec, UnionArchitectureSpec } from "@/lib/types";

export interface BlockLayerSelection {
  name: string;
  nodeIds: string[];
}

export interface BlockDetailPanelProps {
  node?: NodeSpec | null;
  edge?: EdgeSpec | null;
  layer?: BlockLayerSelection | null;
  spec: ArchitectureSpec | UnionArchitectureSpec;
  onClose?: () => void;
  onSelectNode?: (nodeId: string) => void;
  onSelectLayer?: (layerName: string) => void;
}

/**
 * BlockDetailPanel: Dedicated inspection card for the Block Diagram view (Stage V3-4D1, D-399).
 *
 * Requirements:
 * - Plain React text only (no dangerouslySetInnerHTML, Rule 5).
 * - Node mode: Name, layer pill (clickable), full role, inputs, outputs, rules, and connected from/sends to.
 * - Layer mode: Layer name, count, and list of member components with jump-to-node buttons.
 * - Edge mode: Source and target component names with jump buttons, full flow text, and condition if present.
 * - Close button with aria-label="Close details".
 * - Semantic dual-theme tokens only.
 */
export function BlockDetailPanel({
  node,
  edge,
  layer,
  spec,
  onClose,
  onSelectNode,
  onSelectLayer,
}: BlockDetailPanelProps): React.ReactElement | null {
  if (!node && !edge && !layer) {
    return null;
  }

  const nodeMap = new Map<string, NodeSpec>(spec.nodes.map((n) => [n.id, n]));
  const nodeNameMap = new Map<string, string>(spec.nodes.map((n) => [n.id, n.name]));

  // -------------------------------------------------------------------------
  // 1. Layer Mode
  // -------------------------------------------------------------------------
  if (layer && !node && !edge) {
    const layerNodes = layer.nodeIds
      .map((id) => nodeMap.get(id))
      .filter((n): n is NodeSpec => Boolean(n));

    return (
      <aside
        aria-label="Block Details"
        className="flex w-full flex-col rounded-xl border border-line bg-surface p-5 text-card-foreground shadow-sm lg:w-80 lg:shrink-0"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-lg text-foreground break-words">{layer.name}</h3>
            <p className="font-mono text-xs text-text-muted">
              {layerNodes.length} {layerNodes.length === 1 ? "component" : "components"}
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="rounded-md p-1 text-text-muted hover:bg-hover hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <Separator className="my-4 bg-line" />

        <div className="flex-1 space-y-4 text-sm overflow-y-auto">
          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-text-muted">
              Layer Components
            </h4>
            <div className="mt-2 space-y-2">
              {layerNodes.map((ln) => (
                <div
                  key={ln.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-elevated p-2 text-xs"
                >
                  <span className="font-medium text-foreground break-words flex-1">
                    {ln.name}
                  </span>
                  {onSelectNode && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelectNode(ln.id)}
                      className="h-7 px-2 font-mono text-[11px] text-text-muted hover:text-foreground hover:bg-surface"
                    >
                      View
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    );
  }

  // -------------------------------------------------------------------------
  // 2. Edge Mode
  // -------------------------------------------------------------------------
  if (edge && !node) {
    const senderName = nodeNameMap.get(edge.from) ?? edge.from;
    const receiverName = nodeNameMap.get(edge.to) ?? edge.to;
    const condition = (edge.condition || "").trim();

    return (
      <aside
        aria-label="Block Details"
        className="flex w-full flex-col rounded-xl border border-line bg-surface p-5 text-card-foreground shadow-sm lg:w-80 lg:shrink-0"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-lg text-foreground break-words">Connection</h3>
            <p className="font-mono text-xs text-text-muted">Data Flow</p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="rounded-md p-1 text-text-muted hover:bg-hover hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <Separator className="my-4 bg-line" />

        <div className="flex-1 space-y-4 text-sm overflow-y-auto">
          {/* Sender */}
          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-text-muted">Source</h4>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-foreground font-medium break-words">{senderName}</span>
              {onSelectNode && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectNode(edge.from)}
                  className="h-7 px-2 font-mono text-xs text-text-muted hover:text-foreground"
                >
                  Select
                </Button>
              )}
            </div>
          </div>

          {/* Receiver */}
          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-text-muted">Target</h4>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-foreground font-medium break-words">{receiverName}</span>
              {onSelectNode && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectNode(edge.to)}
                  className="h-7 px-2 font-mono text-xs text-text-muted hover:text-foreground"
                >
                  Select
                </Button>
              )}
            </div>
          </div>

          {/* Data Flows */}
          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-text-muted">Flows</h4>
            <p className="mt-1 text-foreground leading-relaxed break-words font-mono text-xs rounded border border-line bg-surface-elevated p-2">
              {edge.flows}
            </p>
          </div>

          {/* Condition */}
          {condition && (
            <div>
              <h4 className="font-mono text-xs uppercase tracking-wider text-text-muted">
                Condition
              </h4>
              <p className="mt-1 text-text-muted text-xs break-words italic">{condition}</p>
            </div>
          )}
        </div>
      </aside>
    );
  }

  // -------------------------------------------------------------------------
  // 3. Node Mode
  // -------------------------------------------------------------------------
  if (!node) {
    return null;
  }

  const layerName = node.layer && node.layer.trim().length > 0 ? node.layer.trim() : "Other parts";

  // Connections
  const incoming = (spec.edges || [])
    .filter((e) => e.to === node.id)
    .map((e) => ({
      nodeId: e.from,
      name: nodeNameMap.get(e.from) ?? e.from,
      flows: e.flows,
    }));

  const outgoing = (spec.edges || [])
    .filter((e) => e.from === node.id)
    .map((e) => ({
      nodeId: e.to,
      name: nodeNameMap.get(e.to) ?? e.to,
      flows: e.flows,
    }));

  // Rules this part takes part in
  const relatedRules = (spec.constraints || []).filter((c: ConstraintSpec) => {
    // If constraint specifies affected nodes, match them; otherwise check if text mentions node name/id
    const mentionsId = c.text.toLowerCase().includes(node.id.toLowerCase());
    const mentionsName = c.text.toLowerCase().includes(node.name.toLowerCase());
    return mentionsId || mentionsName;
  });

  return (
    <aside
      aria-label="Block Details"
      className="flex w-full flex-col rounded-xl border border-line bg-surface p-5 text-card-foreground shadow-sm lg:w-80 lg:shrink-0"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-lg text-foreground break-words">{node.name}</h3>
          {onSelectLayer ? (
            <button
              type="button"
              onClick={() => onSelectLayer(layerName)}
              className="mt-1 inline-flex items-center gap-1 rounded border border-line bg-surface-elevated px-2 py-0.5 font-mono text-[11px] text-text-muted hover:text-foreground transition-colors"
              title={`View layer ${layerName}`}
            >
              <Layers className="size-3" />
              <span>{layerName}</span>
            </button>
          ) : (
            <span className="mt-1 inline-flex items-center gap-1 rounded border border-line bg-surface-elevated px-2 py-0.5 font-mono text-[11px] text-text-muted">
              <Layers className="size-3" />
              <span>{layerName}</span>
            </span>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded-md p-1 text-text-muted hover:bg-hover hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <Separator className="my-4 bg-line" />

      {/* Content scroll area */}
      <div className="flex-1 space-y-4 text-sm overflow-y-auto">
        {/* Full Role */}
        <div>
          <h4 className="font-mono text-xs uppercase tracking-wider text-text-muted">Role</h4>
          <p className="mt-1 text-foreground/90 leading-relaxed break-words text-xs">{node.role}</p>
        </div>

        {/* Inputs */}
        {node.inputs && node.inputs.length > 0 && (
          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-text-muted">Inputs</h4>
            <div className="mt-1 flex flex-wrap gap-1">
              {node.inputs.map((inp, idx) => (
                <span
                  key={idx}
                  className="rounded border border-line bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
                >
                  {inp}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Outputs */}
        {node.outputs && node.outputs.length > 0 && (
          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-text-muted">Outputs</h4>
            <div className="mt-1 flex flex-wrap gap-1">
              {node.outputs.map((out, idx) => (
                <span
                  key={idx}
                  className="rounded border border-line bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
                >
                  {out}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Connected From */}
        {incoming.length > 0 && (
          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-text-muted">
              Connected from
            </h4>
            <div className="mt-1 space-y-1">
              {incoming.map((inc, idx) => (
                <div key={idx} className="flex items-center justify-between gap-1 text-xs">
                  <span className="text-foreground break-words truncate font-medium">
                    {inc.name}
                  </span>
                  {onSelectNode && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelectNode(inc.nodeId)}
                      className="h-6 px-1.5 font-mono text-[10px] text-text-muted hover:text-foreground"
                    >
                      View
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sends to */}
        {outgoing.length > 0 && (
          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-text-muted">Sends to</h4>
            <div className="mt-1 space-y-1">
              {outgoing.map((out, idx) => (
                <div key={idx} className="flex items-center justify-between gap-1 text-xs">
                  <span className="text-foreground break-words truncate font-medium">
                    {out.name}
                  </span>
                  {onSelectNode && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelectNode(out.nodeId)}
                      className="h-6 px-1.5 font-mono text-[10px] text-text-muted hover:text-foreground"
                    >
                      View
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Rules / Constraints */}
        {relatedRules.length > 0 && (
          <div>
            <h4 className="font-mono text-xs uppercase tracking-wider text-text-muted">
              Rules this part takes part in
            </h4>
            <div className="mt-1 space-y-1.5">
              {relatedRules.map((r: ConstraintSpec) => (
                <div
                  key={r.id}
                  className="rounded border border-line bg-surface-elevated p-2 text-xs text-text-muted"
                >
                  <div className="flex items-center gap-1 font-mono text-[10px] text-text-muted mb-0.5">
                    <ShieldCheck className="size-3 text-brand-accent shrink-0" />
                    <span>Rule</span>
                  </div>
                  <p className="text-foreground/90 leading-snug break-words">{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI model statement */}
        {node.needs_model && (
          <div className="space-y-2 rounded-md border border-line bg-surface-elevated text-foreground p-2.5 text-xs">
            <div>This part uses an AI model.</div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs font-mono border-line text-foreground hover:bg-hover"
            >
              <Link
                href="/models/advisor"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    const prompt = `What are the best open-source models for '${node.name}' (role: ${node.role}) on consumer/cloud hardware?`;
                    window.sessionStorage.setItem("advisor_prefill_prompt", prompt);
                  }
                }}
              >
                <Bot className="size-3 mr-1.5" />
                Ask Advisor about models
              </Link>
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
