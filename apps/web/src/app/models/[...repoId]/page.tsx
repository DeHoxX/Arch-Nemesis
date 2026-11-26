"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  Calculator,
  Cpu,
  Download,
  FileCheck2,
  Heart,
  Layers,
  ShieldAlert,
  Tag,
  AlertTriangle,
  Hash,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EstimatorForm } from "@/components/modelfit/EstimatorForm";
import { fetchModelDetail } from "@/lib/modelfit/api";

function formatParams(num?: number | null): string {
  if (!num) return "Unknown";
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + " Billion";
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + " Million";
  }
  return num.toLocaleString();
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + "M";
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + "k";
  }
  return num.toString();
}

function ModelDetailLoading(): React.ReactElement {
  return (
    <div className="min-h-screen bg-page-bg text-foreground p-6 sm:p-10 max-w-5xl mx-auto space-y-6">
      <div className="h-6 w-32 bg-card/60 rounded animate-pulse" />
      <div className="h-28 rounded-xl bg-card/40 animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="h-20 bg-card/40 rounded-xl animate-pulse" />
        <div className="h-20 bg-card/40 rounded-xl animate-pulse" />
        <div className="h-20 bg-card/40 rounded-xl animate-pulse" />
        <div className="h-20 bg-card/40 rounded-xl animate-pulse" />
      </div>
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
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-destructive font-mono text-xs">
          {error instanceof Error ? error.message : "Model details could not be found."}
        </div>
      </div>
    );
  }

  const norm = model.normalized_model;
  const modelId = model.id || model.hf_model_id || repoId;

  return (
    <div className="min-h-screen bg-page-bg text-foreground p-6 sm:p-10 max-w-5xl mx-auto space-y-8">
      {/* Top Header / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Button asChild variant="ghost" size="sm" className="font-mono text-xs w-fit">
          <Link href="/models">
            <ArrowLeft className="size-3.5 mr-1.5" />
            Back to Model Catalog
          </Link>
        </Button>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="font-mono text-xs">
            <Link href={`/models/advisor?repo_id=${encodeURIComponent(modelId)}`}>
              <Bot className="size-3.5 mr-1.5" />
              Ask Advisor
            </Link>
          </Button>

          {model.is_supported ? (
            <Button asChild size="sm" variant="default" className="font-mono text-xs">
              <Link href={`/estimator?repo_id=${encodeURIComponent(modelId)}`}>
                <Calculator className="size-3.5 mr-1.5" />
                Estimate Footprint
              </Link>
            </Button>
          ) : (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-line bg-surface-elevated text-xs font-mono text-muted-foreground opacity-70 cursor-not-allowed"
              title={model.support_reason_message || "Model architecture is not supported for estimation"}
            >
              <Calculator className="size-3.5" />
              <span>Cannot Estimate ({model.support_reason_code || "Unsupported"})</span>
            </div>
          )}
        </div>
      </div>

      {/* Stale Cache Warning Banner */}
      {model.warning && (
        <div className="rounded-xl border border-brand-accent/30 bg-surface-elevated p-4 flex items-center gap-3 text-xs text-brand-accent font-mono">
          <AlertTriangle className="size-4 shrink-0" />
          <div className="space-y-0.5">
            <span className="font-semibold block">Upstream Hub Disconnected</span>
            <span className="text-foreground/90">{model.warning}</span>
          </div>
        </div>
      )}

      {/* Unsupported / Incomplete Alert Banner */}
      {!model.is_supported && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3 text-xs text-destructive">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">
                {model.support_status === "incomplete_metadata"
                  ? "Incomplete Architecture Metadata"
                  : model.support_status === "unsupported_modality"
                  ? "Unsupported Model Modality"
                  : "Unsupported Architecture"}
              </span>
              {model.support_reason_code && (
                <Badge variant="outline" className="font-mono text-[10px] border-destructive/40 text-destructive">
                  {model.support_reason_code}
                </Badge>
              )}
            </div>
            <p className="text-xs text-destructive/90">
              {model.support_reason_message ||
                "This model architecture is not supported by the memory estimation engine."}
            </p>
          </div>
        </div>
      )}

      {/* Header Info Card */}
      <div className="rounded-2xl border border-border/80 bg-card/50 p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                {model.author}
              </span>
              <span className="text-border">•</span>
              <span className="text-xs text-muted-foreground font-mono">
                {model.pipeline_tag || "text-generation"}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono">
              {model.model_name || modelId}
            </h1>
            <p className="text-xs font-mono text-muted-foreground">{modelId}</p>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Provenance Badge */}
            <Badge
              variant="outline"
              className="inline-flex items-center gap-1 text-xs font-mono"
            >
              <FileCheck2 className="size-3" />
              <span>
                {model.param_provenance === "safetensors"
                  ? "Safetensors Verified"
                  : model.param_provenance === "config"
                  ? "Config Parameters"
                  : "Derived Parameters"}
              </span>
            </Badge>

            {/* Gated Badge */}
            {model.gated && (
              <Badge variant="destructive" className="inline-flex items-center gap-1 text-xs font-mono">
                <ShieldAlert className="size-3" />
                Gated Model
              </Badge>
            )}

            {/* Support Status Badge */}
            {model.support_status === "supported_llm" ? (
              <Badge variant="secondary" className="font-mono text-xs">
                Supported LLM
              </Badge>
            ) : model.support_status === "incomplete_metadata" ? (
              <Badge variant="outline" className="font-mono text-xs border-brand-accent/40 text-brand-accent">
                Incomplete Metadata ({model.support_reason_code || "MISSING_CONFIG"})
              </Badge>
            ) : model.support_status === "unsupported_modality" ? (
              <Badge variant="destructive" className="font-mono text-xs">
                Non-LLM Modality
              </Badge>
            ) : (
              <Badge variant="destructive" className="font-mono text-xs">
                Unsupported Architecture
              </Badge>
            )}

            {/* License Badge */}
            {model.license && (
              <Badge variant="outline" className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground">
                <Tag className="size-3" />
                {model.license}
              </Badge>
            )}
          </div>
        </div>

        {/* Stats Bar */}
        <div className="pt-4 border-t border-border/50 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border/60 bg-card/30 p-3.5 space-y-1">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-mono">
              <Hash className="size-3.5 text-muted-foreground" />
              Total Parameters
            </span>
            <p className="text-base font-semibold font-mono text-foreground">
              {formatParams(norm.total_params)}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/30 p-3.5 space-y-1">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-mono">
              <Download className="size-3.5 text-muted-foreground" />
              Downloads
            </span>
            <p className="text-base font-semibold font-mono text-foreground">
              {formatNumber(model.downloads)}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/30 p-3.5 space-y-1">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-mono">
              <Heart className="size-3.5 text-muted-foreground" />
              Hub Likes
            </span>
            <p className="text-base font-semibold font-mono text-foreground">
              {formatNumber(model.likes)}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/30 p-3.5 space-y-1">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-mono">
              <Layers className="size-3.5 text-muted-foreground" />
              Context Window
            </span>
            <p className="text-base font-semibold font-mono text-foreground">
              {norm.max_context_length
                ? `${norm.max_context_length.toLocaleString()} tokens`
                : "Unknown"}
            </p>
          </div>
        </div>
      </div>

      {/* Architecture Specifications Grid */}
      <div className="rounded-2xl border border-border/80 bg-card/50 p-6 sm:p-8 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Cpu className="size-4 text-primary" />
            Normalized Architecture Specifications
          </h2>
          <p className="text-xs text-muted-foreground">
            Normalized parameters ingested deterministically from Hub metadata.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
          <div className="p-3 bg-surface-elevated border border-line rounded-xl flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Architecture Name</span>
            <span className="text-xs font-mono text-foreground font-medium">
              {norm.architecture_name || "N/A"}
            </span>
          </div>

          <div className="p-3 bg-surface-elevated border border-line rounded-xl flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Architecture Category</span>
            <span className="text-xs font-mono text-foreground font-medium">
              {norm.architecture_category || "N/A"}
            </span>
          </div>

          <div className="p-3 bg-surface-elevated border border-line rounded-xl flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Attention Variant</span>
            <span className="text-xs font-mono text-foreground font-medium">
              {norm.attention_variant || "N/A"}
            </span>
          </div>

          <div className="p-3 bg-surface-elevated border border-line rounded-xl flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Hidden Layers</span>
            <span className="text-xs font-mono text-foreground font-medium">
              {norm.num_layers ?? "N/A"}
            </span>
          </div>

          <div className="p-3 bg-surface-elevated border border-line rounded-xl flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Hidden Size</span>
            <span className="text-xs font-mono text-foreground font-medium">
              {norm.hidden_size ?? "N/A"}
            </span>
          </div>

          <div className="p-3 bg-surface-elevated border border-line rounded-xl flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Attention Heads</span>
            <span className="text-xs font-mono text-foreground font-medium">
              {norm.num_attention_heads ?? "N/A"}
            </span>
          </div>

          <div className="p-3 bg-surface-elevated border border-line rounded-xl flex items-center justify-between">
            <span className="text-xs text-muted-foreground">KV Heads</span>
            <span className="text-xs font-mono text-foreground font-medium">
              {norm.num_kv_heads ?? "N/A"}
            </span>
          </div>

          <div className="p-3 bg-surface-elevated border border-line rounded-xl flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Head Dimension</span>
            <span className="text-xs font-mono text-foreground font-medium">
              {norm.head_dim ?? "N/A"}
            </span>
          </div>

          <div className="p-3 bg-surface-elevated border border-line rounded-xl flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Vocab Size</span>
            <span className="text-xs font-mono text-foreground font-medium">
              {norm.vocab_size?.toLocaleString() ?? "N/A"}
            </span>
          </div>

          {norm.num_experts !== undefined && norm.num_experts !== null && (
            <div className="p-3 bg-surface-elevated border border-line rounded-xl flex items-center justify-between">
              <span className="text-xs text-muted-foreground">MoE Experts (Total / Active)</span>
              <span className="text-xs font-mono text-foreground font-medium">
                {norm.num_experts} / {norm.experts_per_token ?? 1}
              </span>
            </div>
          )}

          {norm.sliding_window_size !== undefined && norm.sliding_window_size !== null && (
            <div className="p-3 bg-surface-elevated border border-line rounded-xl flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Sliding Window Size</span>
              <span className="text-xs font-mono text-foreground font-medium">
                {norm.sliding_window_size.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Quick Estimate CTA Banner */}
      <div className="rounded-2xl border border-line bg-surface-elevated p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            Check if your GPU or Mac can run {model.model_name || modelId}
          </h3>
          <p className="text-xs text-muted-foreground">
            Test various quantizations (Q4_K_M, INT8, FP16) and context sizes against your hardware.
          </p>
        </div>

        <Button asChild size="sm" variant="default" className="font-mono text-xs shrink-0">
          <Link href={`/estimator?repo_id=${encodeURIComponent(modelId)}`}>
            <Calculator className="size-3.5 mr-1.5" />
            <span>Run Estimation</span>
          </Link>
        </Button>
      </div>

      {/* Integrated Memory Estimator */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          Quick Memory Estimator
        </h2>
        <EstimatorForm
          initialModelId={modelId}
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
