"use client";

import React, { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHistory } from "@/lib/history";

export default function HistoryPage(): React.ReactElement {
  const history = useHistory();
  // Safe hydration check: empty during SSR snapshot, populated on client
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  return (
    <main className="relative min-h-screen w-full bg-[var(--page-bg)] text-[#f4f4f5] px-4 py-12 md:py-16">
      {/* Background subtle static grid */}
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#27272a15_1px,transparent_1px),linear-gradient(to_bottom,#27272a15_1px,transparent_1px)] bg-[size:32px_32px]"
        aria-hidden="true"
      />

      <div className="relative mx-auto flex w-full max-w-3xl flex-col">
        {/* Top Navigation */}
        <div className="mb-6 flex items-center justify-between border-b border-border/40 pb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back to Home
          </Link>
          <span className="text-xs font-mono text-muted-foreground">
            {isHydrated ? `${history.length} saved design${history.length === 1 ? "" : "s"}` : ""}
          </span>
        </div>

        {/* Page Title */}
        <div className="mb-8 space-y-1">
          <h1 className="font-heading text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Past Designs
          </h1>
          <p className="text-sm text-muted-foreground">
            Architecture designs previously generated in this browser session. Saved locally.
          </p>
        </div>

        {/* Content */}
        {!isHydrated ? (
          <div className="rounded-xl border border-border/60 bg-card/40 p-8 text-center text-sm text-muted-foreground">
            Loading history...
          </div>
        ) : history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card/20 p-12 text-center space-y-4">
            <Clock className="size-8 mx-auto text-muted-foreground/60" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No past designs yet</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Designs you generate on the home page are saved to your browser history for quick reference.
              </p>
            </div>
            <Button asChild size="sm" className="bg-[#ccff00] text-black hover:bg-[#b8e600] font-semibold text-xs">
              <Link href="/">Create a Design</Link>
            </Button>
          </div>
        ) : (
          <ul className="space-y-3" role="list" aria-label="Past designs list">
            {history.map((entry) => (
              <li
                key={entry.design_id}
                className="group rounded-xl border border-border/60 bg-card/60 p-4 transition-all hover:border-[#ccff00]/60 hover:bg-card/90"
              >
                <Link
                  href={`/design/${encodeURIComponent(entry.design_id)}`}
                  className="flex items-start justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground group-hover:text-[#ccff00] transition-colors truncate">
                      {entry.title}
                    </p>
                    <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                      <span>ID: {entry.design_id.slice(0, 8)}...</span>
                      <span>•</span>
                      <span>{new Date(entry.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
                    </div>
                  </div>
                  <ExternalLink className="size-4 shrink-0 text-muted-foreground group-hover:text-[#ccff00] transition-colors mt-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
