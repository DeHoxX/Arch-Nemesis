import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Explanation } from "@/lib/types";

interface ExplanationViewProps {
  explanation?: Explanation | null;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

export function ExplanationView({
  explanation,
  isLoading,
  error,
  onRetry,
}: ExplanationViewProps): React.ReactElement {
  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading explanation"
        className="rounded-2xl border border-border/80 bg-card/60 p-8 backdrop-blur-sm flex flex-col items-center justify-center space-y-4 py-16"
      >
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-muted-foreground">Writing the explanation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card/60 p-6 md:p-8 backdrop-blur-sm">
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="font-semibold">Failed to Load Explanation</AlertTitle>
          <AlertDescription className="mt-2 text-sm leading-relaxed">
            {error.message || "An unexpected error occurred while loading the explanation."}
          </AlertDescription>
        </Alert>
        {onRetry && (
          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (!explanation) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card/60 p-8 backdrop-blur-sm">
        <p className="text-sm text-muted-foreground leading-relaxed">
          No explanation available.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-card/60 p-6 md:p-8 backdrop-blur-sm space-y-8 text-foreground">
      {explanation.source === "fallback" && (
        <div
          role="note"
          aria-label="Fallback notice"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200"
        >
          <p className="font-medium">
            Basic explanation: the written version did not pass our checks.
          </p>
        </div>
      )}

      {/* 1. Overview */}
      <section className="space-y-3" aria-labelledby="heading-overview">
        <h3 id="heading-overview" className="text-base font-semibold text-foreground tracking-tight">
          Overview
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {explanation.overview}
        </p>
      </section>

      {/* 2. How a request flows */}
      <section className="space-y-3" aria-labelledby="heading-flow">
        <h3 id="heading-flow" className="text-base font-semibold text-foreground tracking-tight">
          How a request flows
        </h3>
        {explanation.flow.length > 0 ? (
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground leading-relaxed">
            {explanation.flow.map((step) => (
              <li key={step.step}>
                <span className="font-medium text-foreground">{step.node_name}:</span> {step.text}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground italic">No flow steps recorded.</p>
        )}
      </section>

      {/* 3. Each part */}
      <section className="space-y-3" aria-labelledby="heading-parts">
        <h3 id="heading-parts" className="text-base font-semibold text-foreground tracking-tight">
          Each part
        </h3>
        {explanation.parts.length > 0 ? (
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground leading-relaxed">
            {explanation.parts.map((part) => (
              <li key={part.node_id}>
                <span className="font-medium text-foreground">{part.node_name}:</span> {part.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground italic">No parts recorded.</p>
        )}
      </section>

      {/* 4. Why the checks exist */}
      <section className="space-y-3" aria-labelledby="heading-checks">
        <h3 id="heading-checks" className="text-base font-semibold text-foreground tracking-tight">
          Why the checks exist
        </h3>
        {explanation.checks.length > 0 ? (
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground leading-relaxed">
            {explanation.checks.map((check) => (
              <li key={check.constraint_id}>{check.text}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground italic">No checks defined.</p>
        )}
      </section>

      {/* 5. Where AI models are used */}
      <section className="space-y-3" aria-labelledby="heading-models">
        <h3 id="heading-models" className="text-base font-semibold text-foreground tracking-tight">
          Where AI models are used
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {explanation.models.text}
        </p>
      </section>
    </div>
  );
}

