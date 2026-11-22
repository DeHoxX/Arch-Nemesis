"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Box, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstimatorForm } from "@/components/modelfit/EstimatorForm";

function EstimatorLoading(): React.ReactElement {
  return (
    <div className="min-h-screen bg-page-bg text-foreground p-6 sm:p-10 max-w-4xl mx-auto space-y-6">
      <div className="h-6 w-32 bg-card/60 rounded animate-pulse" />
      <div className="h-28 rounded-xl bg-card/40 animate-pulse" />
      <div className="h-64 rounded-xl bg-card/40 animate-pulse" />
    </div>
  );
}

function EstimatorContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const modelId = searchParams?.get("model_id") || searchParams?.get("repo_id") || undefined;
  const paramsBStr = searchParams?.get("params_b");
  const paramsB = paramsBStr ? parseFloat(paramsBStr) : undefined;

  return (
    <div className="min-h-screen bg-page-bg text-foreground p-6 sm:p-10 max-w-4xl mx-auto space-y-6">
      {/* Header & navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <Button asChild variant="ghost" size="sm" className="font-mono text-xs -ml-2 mb-2">
            <Link href="/models">
              <ArrowLeft className="size-3.5 mr-1.5" />
              Back to Model Catalog
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Interactive Memory Estimator
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Deterministic rule-based memory calculation for open weights LLMs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="font-mono text-xs">
            <Link href="/models">
              <Box className="size-3.5 mr-1.5" />
              Models
            </Link>
          </Button>
          <Button asChild variant="default" size="sm" className="font-mono text-xs font-semibold">
            <Link href="/models/advisor">
              <Bot className="size-3.5 mr-1.5" />
              Advisor
            </Link>
          </Button>
        </div>
      </div>

      <EstimatorForm
        initialModelId={modelId}
        initialParamsB={paramsB !== undefined && !Number.isNaN(paramsB) ? paramsB : undefined}
      />
    </div>
  );
}

export default function StandaloneEstimatorPage(): React.ReactElement {
  return (
    <Suspense fallback={<EstimatorLoading />}>
      <EstimatorContent />
    </Suspense>
  );
}
