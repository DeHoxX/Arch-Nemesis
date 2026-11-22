"use client";

import React from "react";
import type { EstimationResult } from "@/lib/modelfit/schemas";
import { Badge } from "@/components/ui/badge";

interface EstimationResultCardProps {
  result: EstimationResult;
  hardwareName?: string;
}

export function EstimationResultCard({
  result,
  hardwareName,
}: EstimationResultCardProps) {
  const gibFactor = 1024 * 1024 * 1024;
  const totalGiB = (result.total_bytes / gibFactor).toFixed(2);
  const weightsGiB = (result.weights_bytes / gibFactor).toFixed(2);
  const kvGiB = (result.kv_cache_bytes / gibFactor).toFixed(2);
  const actGiB = (result.activation_bytes / gibFactor).toFixed(2);
  const headroomGiB = (result.headroom_bytes / gibFactor).toFixed(2);

  const isFits = result.fits;
  const isBorderline =
    isFits && result.headroom_bytes > 0 && result.headroom_bytes < 1 * gibFactor;

  // Percentage shares for bar
  const total = Math.max(result.total_bytes, 1);
  const weightsPct = Math.min(100, (result.weights_bytes / total) * 100);
  const kvPct = Math.min(100, (result.kv_cache_bytes / total) * 100);
  const actPct = Math.min(100, (result.activation_bytes / total) * 100);

  return (
    <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm space-y-4 text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-base text-foreground">
            Memory Estimation Result
          </h3>
          {hardwareName && (
            <p className="text-xs text-muted-foreground font-mono">
              Hardware: {hardwareName}
            </p>
          )}
        </div>
        <div>
          {isFits ? (
            isBorderline ? (
              <Badge
                variant="outline"
                className="border-line-strong bg-surface-elevated text-text-muted font-mono text-xs"
              >
                Borderline Headroom
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-line-strong bg-surface-elevated text-brand-accent font-mono text-xs"
              >
                Fits Comfortably
              </Badge>
            )
          ) : (
            <Badge
              variant="outline"
              className="border-destructive/40 bg-destructive/10 text-destructive font-mono text-xs"
            >
              Exceeds Hardware Memory
            </Badge>
          )}
        </div>
      </div>

      {/* Memory breakdown stacked bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-mono text-muted-foreground">
          <span>Total Required: {totalGiB} GiB</span>
          <span>
            {result.headroom_bytes >= 0 ? `Headroom: +${headroomGiB} GiB` : `Deficit: ${headroomGiB} GiB`}
          </span>
        </div>
        <div className="h-3 w-full rounded-full bg-muted/60 overflow-hidden flex">
          <div
            style={{ width: `${weightsPct}%` }}
            className="bg-primary h-full"
            title={`Weights: ${weightsGiB} GiB`}
          />
          <div
            style={{ width: `${kvPct}%` }}
            className="bg-brand-accent h-full"
            title={`KV Cache: ${kvGiB} GiB`}
          />
          <div
            style={{ width: `${actPct}%` }}
            className="bg-text-subtle h-full"
            title={`Activations: ${actGiB} GiB`}
          />
        </div>
        <div className="flex flex-wrap gap-4 pt-1 text-[11px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary inline-block" />
            Weights: {weightsGiB} GiB
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-brand-accent inline-block" />
            KV Cache: {kvGiB} GiB
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-text-subtle inline-block" />
            Activations: {actGiB} GiB
          </span>
        </div>
      </div>

      {/* Context info */}
      <div className="rounded-lg border border-border/50 bg-card/60 p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
        <div>
          <span className="text-muted-foreground block text-[10px] uppercase">
            Quantization
          </span>
          <span className="text-foreground">{result.quantization}</span>
        </div>
        <div>
          <span className="text-muted-foreground block text-[10px] uppercase">
            Effective Context
          </span>
          <span className="text-foreground">
            {result.effective_context.toLocaleString()} tokens
          </span>
        </div>
        <div>
          <span className="text-muted-foreground block text-[10px] uppercase">
            Model Parameters
          </span>
          <span className="text-foreground">
            {(result.total_params / 1e9).toFixed(2)}B
          </span>
        </div>
      </div>

      {result.is_context_truncated && (
        <div className="text-xs text-text-muted bg-surface-elevated border border-line rounded p-2">
          Note: Context length was capped to the model&apos;s architectural maximum.
        </div>
      )}

      {/* Assumptions and engine notes */}
      {result.assumptions.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Estimation Assumptions
          </h4>
          <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
            {result.assumptions.map((asm, idx) => (
              <li key={idx} className="break-words">
                {asm}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.errors.length > 0 && (
        <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded p-2">
          {result.errors.join(", ")}
        </div>
      )}
    </div>
  );
}
