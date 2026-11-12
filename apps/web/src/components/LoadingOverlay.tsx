"use client";

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LoadingOverlayProps {
  className?: string;
}

/**
 * LoadingOverlay: Full-screen loading modal displayed during architecture synthesis.
 *
 * Requirements (BUILD_PLAN.md:446 & D-116):
 * - Copy: "Designing your system. This can take up to a minute, sometimes longer."
 * - Elapsed-seconds counter: "{N} seconds elapsed".
 * - Honors prefers-reduced-motion on animation.
 * - Glass blur backdrop, no grain, no animated grid.
 */
export function LoadingOverlay({ className }: LoadingOverlayProps): React.ReactElement {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Generation in progress"
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/90 p-6 text-center select-none",
        className,
      )}
    >
      <div className="relative flex flex-col items-center max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
        {/* Spinner: honors prefers-reduced-motion */}
        <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-brand-accent/10 border border-brand-accent/20">
          <Loader2 className="size-7 text-brand-accent animate-spin motion-reduce:animate-none" />
        </div>

        <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">
          Designing your system. This can take up to a minute, sometimes longer.
        </h3>

        <p className="mt-3 font-mono text-sm text-muted-foreground">
          {elapsedSeconds} {elapsedSeconds === 1 ? "second" : "seconds"} elapsed
        </p>
      </div>
    </div>
  );
}

