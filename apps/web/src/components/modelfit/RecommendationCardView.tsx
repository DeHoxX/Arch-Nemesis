"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RecommendationItem } from "@/lib/modelfit/schemas";

interface RecommendationCardViewProps {
  recommendations: RecommendationItem[];
  task?: string;
}

export function RecommendationCardView({
  recommendations,
  task,
}: RecommendationCardViewProps) {
  if (recommendations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground">
        No models matched your task and hardware constraints.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {task && (
        <div className="text-xs font-mono text-muted-foreground">
          Showing ranked recommendations for task:{" "}
          <span className="text-foreground font-semibold">{task}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {recommendations.map((rec) => {
          const m = rec.model;
          const gibFactor = 1024 * 1024 * 1024;
          const totalReqGiB = (
            rec.estimated_memory.total_bytes / gibFactor
          ).toFixed(1);

          return (
            <div
              key={m.id}
              className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 shadow-sm space-y-4 text-card-foreground hover:border-brand-accent/50 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-mono text-muted-foreground block truncate">
                      {m.author}
                    </span>
                    <h3 className="font-semibold text-sm text-foreground truncate">
                      {m.model_name}
                    </h3>
                  </div>

                  {rec.headroom_status === "fits" && (
                    <Badge
                      variant="outline"
                      className="border-line-strong bg-surface-elevated text-brand-accent text-[10px] font-mono shrink-0"
                    >
                      +{rec.headroom_gb.toFixed(1)} GB Free
                    </Badge>
                  )}
                  {rec.headroom_status === "borderline" && (
                    <Badge
                      variant="outline"
                      className="border-line-strong bg-surface-elevated text-text-muted text-[10px] font-mono shrink-0"
                    >
                      Tight Fit ({rec.headroom_gb.toFixed(1)} GB)
                    </Badge>
                  )}
                  {rec.headroom_status === "overflow" && (
                    <Badge
                      variant="outline"
                      className="border-destructive/40 bg-destructive/10 text-destructive text-[10px] font-mono shrink-0"
                    >
                      OOM
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {rec.quantization}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {rec.context_length.toLocaleString()} ctx
                  </Badge>
                  {m.license && (
                    <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                      {m.license}
                    </Badge>
                  )}
                </div>

                {/* Rank reasons */}
                {rec.rank_reasons.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
                      Selection Factors
                    </span>
                    <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                      {rec.rank_reasons.map((reason, idx) => (
                        <li key={idx} className="break-words">
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Memory snapshot and actions */}
              <div className="space-y-3 pt-2 border-t border-border/50">
                <div className="flex justify-between items-center text-xs font-mono text-muted-foreground">
                  <span>RAM/VRAM Required:</span>
                  <span className="text-foreground font-semibold">
                    ~{totalReqGiB} GiB
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="flex-1 font-mono text-xs h-7"
                  >
                    <Link href={`/models/${m.id}`}>Details</Link>
                  </Button>
                  <Button
                    asChild
                    variant="default"
                    size="sm"
                    className="flex-1 font-mono text-xs h-7"
                  >
                    <Link href={`/models/advisor?repo_id=${encodeURIComponent(m.id)}`}>
                      Chat Advisor
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
