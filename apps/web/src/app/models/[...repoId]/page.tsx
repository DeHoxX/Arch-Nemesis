"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bot, Download, ShieldCheck, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EstimatorForm } from "@/components/modelfit/EstimatorForm";
import { fetchModelDetail } from "@/lib/modelfit/api";

function ModelDetailLoading(): React.ReactElement {
  return (
    <div className="min-h-screen bg-page-bg text-foreground p-6 sm:p-10 max-w-5xl mx-auto space-y-6">
      <div className="h-6 w-32 bg-card/60 rounded animate-pulse" />
      <div className="h-28 rounded-xl bg-card/40 animate-pulse" />
      <div className="h-64 rounded-xl bg-card/40 animate-pulse" />
    </div>
  );
}

function ModelDetailContent(): React.ReactElement {
  const params = useParams();
  const repoIdParam = params?.repoId;
  const repoId = Array.isArray(repoIdParam)
    ? repoIdParam.join("/")
    : (repoIdParam as string) || "";

  const {
    data: model,
    isLoading: loading,
    isError,
    error,
  } = useQuery({
    queryKey: ["model-detail", repoId],
    queryFn: () => fetchModelDetail(repoId),
    enabled: Boolean(repoId),
  });

  if (loading) {
    return <ModelDetailLoading />;
  }

  if (isError || !model) {
    return (
      <div className="min-h-screen bg-page-bg text-foreground p-6 sm:p-10 max-w-5xl mx-auto space-y-6">
        <Button asChild variant="ghost" size="sm" className="font-mono text-xs">
          <Link href="/models">
            <ArrowLeft className="size-3.5 mr-1.5" />
            Back to Catalog
          </Link>
        </Button>
        <div className="rounded-xl border border-rose-600/30 bg-rose-500/10 p-6 text-rose-500 font-mono text-xs">
          {error instanceof Error ? error.message : "Model details could not be found."}
        </div>
      </div>
    );
  }

  const norm = model.normalized_model;
  const paramsB = norm.total_params
    ? (norm.total_params / 1e9).toFixed(2)
    : "Unknown";

  return (
    <div className="min-h-screen bg-page-bg text-foreground p-6 sm:p-10 max-w-5xl mx-auto space-y-8">
      {/* Back button */}
      <div>
        <Button asChild variant="ghost" size="sm" className="font-mono text-xs">
          <Link href="/models">
            <ArrowLeft className="size-3.5 mr-1.5" />
            Back to Catalog
          </Link>
        </Button>
      </div>

      {/* Header Info Card */}
      <div className="rounded-2xl border border-border/80 bg-card/50 p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono">
                {model.hf_model_id}
              </h1>
              {norm.architecture_name && (
                <Badge variant="outline" className="font-mono text-xs uppercase">
                  {norm.architecture_name}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Category: {norm.architecture_category}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button asChild size="sm" variant="default" className="font-mono text-xs">
              <Link href={`/models/advisor?repo_id=${encodeURIComponent(model.hf_model_id)}`}>
                <Bot className="size-3.5 mr-1.5" />
                Ask Advisor
              </Link>
            </Button>
          </div>
        </div>

        {/* Badges / Metrics */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/50 text-xs text-muted-foreground font-mono">
          <span className="flex items-center gap-1">
            <Download className="size-3.5" />
            {model.downloads.toLocaleString()} downloads
          </span>
          <span className="flex items-center gap-1">
            <ThumbsUp className="size-3.5" />
            {model.likes.toLocaleString()} likes
          </span>
          {model.pipeline_tag && (
            <Badge variant="secondary" className="font-mono text-[11px]">
              {model.pipeline_tag}
            </Badge>
          )}
          {model.license && (
            <span className="text-muted-foreground/80">License: {model.license}</span>
          )}
          {model.gated && (
            <Badge variant="destructive" className="font-mono text-[11px]">
              Gated Model
            </Badge>
          )}
          {model.is_supported && (
            <span className="flex items-center gap-1 text-emerald-500">
              <ShieldCheck className="size-3.5" />
              Verified Architecture
            </span>
          )}
        </div>
      </div>

      {/* Model Parameters / Metadata Grid */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          Architecture Specifications
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border/60 bg-card/30 p-4 font-mono">
            <span className="text-muted-foreground block text-[10px] uppercase">Total Params</span>
            <span className="text-foreground font-semibold text-sm">{paramsB}B</span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/30 p-4 font-mono">
            <span className="text-muted-foreground block text-[10px] uppercase">Layers</span>
            <span className="text-foreground font-semibold text-sm">{norm.num_layers ?? "N/A"}</span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/30 p-4 font-mono">
            <span className="text-muted-foreground block text-[10px] uppercase">Hidden Size</span>
            <span className="text-foreground font-semibold text-sm">{norm.hidden_size ?? "N/A"}</span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/30 p-4 font-mono">
            <span className="text-muted-foreground block text-[10px] uppercase">Attention Heads</span>
            <span className="text-foreground font-semibold text-sm">{norm.num_attention_heads ?? "N/A"}</span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/30 p-4 font-mono">
            <span className="text-muted-foreground block text-[10px] uppercase">KV Heads</span>
            <span className="text-foreground font-semibold text-sm">{norm.num_kv_heads ?? "N/A"}</span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/30 p-4 font-mono">
            <span className="text-muted-foreground block text-[10px] uppercase">Context Length</span>
            <span className="text-foreground font-semibold text-sm">{norm.max_context_length ?? "N/A"}</span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/30 p-4 font-mono">
            <span className="text-muted-foreground block text-[10px] uppercase">Attention Type</span>
            <span className="text-foreground font-semibold text-sm">{norm.attention_variant}</span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/30 p-4 font-mono">
            <span className="text-muted-foreground block text-[10px] uppercase">Provenance</span>
            <span className="text-foreground font-semibold text-sm">{norm.param_provenance}</span>
          </div>
        </div>
      </div>

      {/* Integrated Memory Estimator */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          Quick Memory Estimator
        </h2>
        <EstimatorForm
          initialModelId={model.hf_model_id}
          initialParamsB={norm.total_params ? norm.total_params / 1e9 : undefined}
        />
      </div>
    </div>
  );
}

export default function ModelDetailPage(): React.ReactElement {
  return (
    <Suspense fallback={<ModelDetailLoading />}>
      <ModelDetailContent />
    </Suspense>
  );
}
