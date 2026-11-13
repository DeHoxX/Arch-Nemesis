"use client";

import React from "react";
import { AlertCircle, Check, Info, ShieldAlert, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import type { DiffResult, PatchSummary } from "@/lib/types";

export interface PatchCardProps {
  patch: PatchSummary;
  onAccept: () => void;
  onReject: () => void;
  onDismiss: () => void;
  isAccepting?: boolean;
  isRejecting?: boolean;
  note?: string;
}

/**
 * Builds deterministic plain-text human-readable diff bullets from structured DiffResult.
 * No LLM text is used; numbers and entity IDs come strictly from code.
 */
function buildDiffSummary(diff: DiffResult | null): string[] {
  if (!diff) return ["No structural changes proposed."];

  const bullets: string[] = [];

  if (diff.added_nodes.length > 0) {
    bullets.push(
      `Added ${diff.added_nodes.length} node${diff.added_nodes.length > 1 ? "s" : ""}: ${diff.added_nodes.join(", ")}`,
    );
  }
  if (diff.removed_nodes.length > 0) {
    bullets.push(
      `Removed ${diff.removed_nodes.length} node${diff.removed_nodes.length > 1 ? "s" : ""}: ${diff.removed_nodes.join(", ")}`,
    );
  }
  if (diff.changed_nodes.length > 0) {
    const details = diff.changed_nodes
      .map((cn) => `${cn.id} (${cn.changed_fields.join(", ")})`)
      .join("; ");
    bullets.push(`Edited ${diff.changed_nodes.length} node${diff.changed_nodes.length > 1 ? "s" : ""}: ${details}`);
  }

  if (diff.added_edges.length > 0) {
    const details = diff.added_edges
      .map((e) => `${e.from_node ?? e.from ?? "?"} \u2192 ${e.to}`)
      .join(", ");
    bullets.push(`Added ${diff.added_edges.length} edge${diff.added_edges.length > 1 ? "s" : ""}: ${details}`);
  }
  if (diff.removed_edges.length > 0) {
    const details = diff.removed_edges
      .map((e) => `${e.from_node ?? e.from ?? "?"} \u2192 ${e.to}`)
      .join(", ");
    bullets.push(`Removed ${diff.removed_edges.length} edge${diff.removed_edges.length > 1 ? "s" : ""}: ${details}`);
  }
  if (diff.changed_edges.length > 0) {
    bullets.push(`Edited ${diff.changed_edges.length} edge${diff.changed_edges.length > 1 ? "s" : ""}`);
  }

  if (diff.added_constraints.length > 0) {
    bullets.push(`Added ${diff.added_constraints.length} constraint${diff.added_constraints.length > 1 ? "s" : ""}`);
  }
  if (diff.removed_constraints.length > 0) {
    bullets.push(`Removed ${diff.removed_constraints.length} constraint${diff.removed_constraints.length > 1 ? "s" : ""}`);
  }
  if (diff.changed_constraints.length > 0) {
    bullets.push(`Edited ${diff.changed_constraints.length} constraint${diff.changed_constraints.length > 1 ? "s" : ""}`);
  }

  if (diff.entry_changed) bullets.push("Entry points updated");
  if (diff.exit_changed) bullets.push("Exit points updated");

  return bullets.length > 0 ? bullets : ["No structural modifications detected."];
}

/**
 * PatchCard: Displays proposed, blocked, or confirmation-required patch under review.
 *
 * Requirements (BUILD_PLAN.md:548):
 * - Status badge (proposed / blocked / needs_confirmation).
 * - ops_count indicator.
 * - Plain-text diff summary built from patch.diff.
 * - When blocked: lists broken rule issue messages and offers ONLY a Dismiss button.
 * - When proposed: Accept and Reject buttons.
 * - When needs_confirmation: Accept triggers confirmation flow, plus Reject.
 * - Warnings (severity === 'warning') displayed separately without blocking.
 * - Plain text only for all messages (Rule 5).
 */
export function PatchCard({
  patch,
  onAccept,
  onReject,
  onDismiss,
  isAccepting = false,
  isRejecting = false,
  note,
}: PatchCardProps): React.ReactElement {
  const isBlocked = patch.status === "blocked";
  const isNeedsConfirmation = patch.status === "needs_confirmation";
  const isProposed = patch.status === "proposed";

  const diffBullets = buildDiffSummary(patch.diff);
  const errors = patch.issues.filter((i) => i.severity === "error");
  const warnings = patch.issues.filter((i) => i.severity === "warning");

  return (
    <Card
      className="border border-white/[0.09] bg-[#151517] shadow-md"
      role="region"
      aria-label="Proposed Architecture Patch Review"
    >
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
        <div className="flex items-center gap-2">
          {isProposed && (
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
              Proposed Change
            </Badge>
          )}
          {isNeedsConfirmation && (
            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">
              Requires Confirmation
            </Badge>
          )}
          {isBlocked && (
            <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/30">
              Blocked by Rules
            </Badge>
          )}
          <span className="text-xs font-mono text-muted-foreground">
            {`${patch.ops_count} operation${patch.ops_count !== 1 ? "s" : ""}`}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* Contextual navigation note (e.g. Explanation tab guidance) */}
        {note && (
          <div
            className="rounded-md border border-sky-500/30 bg-sky-950/20 p-2.5 text-xs text-sky-200"
            role="note"
          >
            <p className="font-mono text-[11px] leading-relaxed">{note}</p>
          </div>
        )}
        {/* Blocked Errors List */}
        {isBlocked && errors.length > 0 && (
          <div
            className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-1.5 text-xs text-rose-200"
            role="alert"
            aria-label="Rule validation errors"
          >
            <div className="flex items-center gap-1.5 font-semibold text-rose-400">
              <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
              <span>This proposal violates architectural rules and cannot be applied:</span>
            </div>
            <ul className="list-disc pl-5 space-y-1">
              {errors.map((err, idx) => (
                <li key={idx} className="break-words font-mono text-[11px]">
                  {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Needs Confirmation Warning */}
        {isNeedsConfirmation && (
          <div
            className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-1 text-xs text-amber-200"
            role="alert"
          >
            <div className="flex items-center gap-1.5 font-semibold text-amber-400">
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>Applies with requirement changes:</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              This change drops rules protecting stated requirements. You will be prompted to acknowledge before applying.
            </p>
          </div>
        )}

        {/* Diff Summary */}
        <div className="space-y-1 text-xs">
          <p className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
            Proposed Modifications
          </p>
          <ul className="list-disc pl-4 space-y-1 text-foreground/90 font-mono text-[11px]">
            {diffBullets.map((bullet, idx) => (
              <li key={idx} className="break-words">
                {bullet}
              </li>
            ))}
          </ul>
        </div>

        {/* Non-blocking Warnings */}
        {warnings.length > 0 && (
          <div
            className="rounded-md border border-border/60 bg-muted/20 p-2.5 space-y-1 text-xs text-muted-foreground"
            role="status"
            aria-label="Design warnings"
          >
            <div className="flex items-center gap-1.5 font-medium text-foreground text-[11px]">
              <Info className="size-3.5 shrink-0" aria-hidden="true" />
              <span>Design Notes:</span>
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
              {warnings.map((warn, idx) => (
                <li key={idx} className="break-words">
                  {warn.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
        {isBlocked ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDismiss}
            className="text-xs font-mono"
            aria-label="Dismiss blocked patch"
          >
            <X className="size-3.5 mr-1.5" /> Dismiss
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onReject}
              disabled={isAccepting || isRejecting}
              className="text-xs font-mono"
              aria-label="Reject proposed patch"
            >
              <X className="size-3.5 mr-1.5" /> {isRejecting ? "Rejecting..." : "Reject"}
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onAccept}
              disabled={isAccepting || isRejecting}
              className="text-xs font-mono bg-emerald-600 hover:bg-emerald-500 text-white"
              aria-label="Accept proposed patch"
            >
              <Check className="size-3.5 mr-1.5" /> {isAccepting ? "Accepting..." : "Accept"}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
