"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Box, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdvisorChat } from "@/components/modelfit/AdvisorChat";

function AdvisorLoading(): React.ReactElement {
  return (
    <div className="min-h-screen bg-page-bg text-foreground p-6 sm:p-10 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-36 bg-card/60 rounded animate-pulse" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-20 bg-card/60 rounded animate-pulse" />
          <div className="h-8 w-24 bg-card/60 rounded animate-pulse" />
        </div>
      </div>
      <div className="h-[600px] rounded-xl border border-border/40 bg-card/40 animate-pulse" />
    </div>
  );
}

function AdvisorContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const repoId = searchParams?.get("repo_id") || undefined;
  const [prefillPrompt] = useState<string | undefined>(() => {
    if (typeof window !== "undefined") {
      const storedPrompt = window.sessionStorage.getItem("advisor_prefill_prompt");
      if (storedPrompt) {
        window.sessionStorage.removeItem("advisor_prefill_prompt");
        return storedPrompt;
      }
    }
    return undefined;
  });

  return (
    <div className="min-h-screen bg-page-bg text-foreground p-6 sm:p-10 max-w-5xl mx-auto space-y-6">
      {/* Top navigation actions */}
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="font-mono text-xs">
          <Link href="/models">
            <ArrowLeft className="size-3.5 mr-1.5" />
            Back to Model Catalog
          </Link>
        </Button>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="font-mono text-xs">
            <Link href="/models">
              <Box className="size-3.5 mr-1.5" />
              Models
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="font-mono text-xs">
            <Link href="/estimator">
              <Cpu className="size-3.5 mr-1.5" />
              Estimator
            </Link>
          </Button>
        </div>
      </div>

      <AdvisorChat initialRepoId={repoId} initialPrompt={prefillPrompt} />
    </div>
  );
}

export default function AdvisorPage(): React.ReactElement {
  return (
    <Suspense fallback={<AdvisorLoading />}>
      <AdvisorContent />
    </Suspense>
  );
}
