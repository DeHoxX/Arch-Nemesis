"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Sparkles, Loader2, RotateCcw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  postNodeModelSuggestions,
  type ModelSuggestionsResponse,
  type ModelSuggestionItem,
} from "@/lib/api";

export interface SuggestedModelsSectionProps {
  designId?: string;
  versionNo?: number;
  nodeId: string;
}

function formatModelParams(params?: number | null): string {
  if (params === null || params === undefined) return "unknown";
  if (params >= 1_000_000_000) {
    return `${(params / 1_000_000_000).toFixed(1)}B`;
  }
  if (params >= 1_000_000) {
    return `${(params / 1_000_000).toFixed(0)}M`;
  }
  return params.toLocaleString();
}

export function SuggestedModelsSection({
  designId,
  versionNo,
  nodeId,
}: SuggestedModelsSectionProps): React.ReactElement {
  const [data, setData] = useState<ModelSuggestionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const handleFetch = async () => {
    if (!designId || versionNo === undefined) {
      setErrorMessage("Design or version context not available.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setElapsedSeconds(0);

    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    try {
      const resp = await postNodeModelSuggestions(designId, versionNo, nodeId);
      setData(resp);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load model suggestions.";
      setErrorMessage(msg);
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2 pt-1" data-testid="suggested-models-section">
      <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        Suggested models (not verified)
      </h4>

      {/* On-demand trigger button when not loaded yet */}
      {!data && !isLoading && !errorMessage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleFetch}
          className="w-full h-8 text-xs font-mono border-line text-foreground hover:bg-hover justify-center"
        >
          <Sparkles className="size-3 mr-1.5" />
          Suggest models
        </Button>
      )}

      {/* Loading state with elapsed timer */}
      {isLoading && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 p-2.5 rounded-md border border-line bg-surface-elevated text-xs font-mono text-muted-foreground"
        >
          <Loader2 className="size-3.5 animate-spin shrink-0 text-primary" />
          <span>
            Suggesting models... ({elapsedSeconds}s - can take up to 30 seconds)
          </span>
        </div>
      )}

      {/* Error state */}
      {errorMessage && !isLoading && (
        <div className="space-y-2 p-2.5 rounded-md border border-destructive/30 bg-destructive/10 text-xs text-destructive">
          <p className="font-mono">{errorMessage}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleFetch}
            className="h-7 text-xs font-mono border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <RotateCcw className="size-3 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Status: unavailable or empty */}
      {data && !isLoading && (data.status === "unavailable" || data.status === "empty") && (
        <div className="space-y-2 p-2.5 rounded-md border border-line bg-surface-elevated text-xs text-muted-foreground">
          <p className="font-mono">
            {data.message ||
              (data.status === "empty"
                ? "No matching open-source models found for this node role."
                : "Model suggestions are temporarily unavailable.")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleFetch}
            className="h-7 text-xs font-mono border-line text-foreground hover:bg-hover"
          >
            <RotateCcw className="size-3 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Status: ok */}
      {data && !isLoading && data.status === "ok" && (
        <div className="space-y-2">
          {data.items.length === 0 ? (
            <div className="p-2.5 rounded-md border border-line bg-surface-elevated text-xs font-mono text-muted-foreground">
              No models suggested.
            </div>
          ) : (
            <div className="space-y-1.5" data-testid="suggested-models-list">
              {data.items.map((item: ModelSuggestionItem) => {
                const href = item.details_url || `/models/${item.id}`;
                return (
                  <div
                    key={item.id}
                    className="p-2 rounded-md border border-line bg-surface-elevated text-xs space-y-1"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <Link
                        href={href}
                        className="font-mono font-medium text-foreground hover:underline break-words flex-1 inline-flex items-center gap-1"
                      >
                        <span>{item.model_name || item.id}</span>
                        <ExternalLink className="size-2.5 shrink-0 opacity-70" />
                      </Link>
                      <Badge
                        variant="secondary"
                        className="font-mono text-[10px] uppercase shrink-0"
                      >
                        {item.size_band}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                      <span className="truncate">{item.author}</span>
                      <span>params: {formatModelParams(item.total_params)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
