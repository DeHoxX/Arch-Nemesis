"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, ThumbsUp, Box, Cpu, Bot, ArrowRight, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchModels } from "@/lib/modelfit/api";

const COMMON_TAGS = [
  "all",
  "text-generation",
  "text2text-generation",
  "feature-extraction",
  "sentence-similarity",
  "image-to-text",
];

export default function ModelsCatalogPage() {
  const [searchInput, setSearchInput] = useState<string>("");
  const [activeSearch, setActiveSearch] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [page, setPage] = useState<number>(0);
  const limit = 24;

  const {
    data,
    isLoading: loading,
    isError,
    error,
  } = useQuery({
    queryKey: ["models", activeSearch, selectedTag, page],
    queryFn: () =>
      fetchModels({
        search: activeSearch.trim() || undefined,
        pipeline_tag: selectedTag !== "all" ? selectedTag : undefined,
        limit,
        offset: page * limit,
        sort_by: "downloads",
        sort_order: "desc",
      }),
  });

  const models = data?.items ?? [];
  const total = data?.total ?? 0;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setActiveSearch(searchInput);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-page-bg text-foreground p-6 sm:p-10 space-y-8 max-w-7xl mx-auto">
      {/* Top Banner / Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Box className="size-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Open Model Catalog
            </h1>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            Deterministic architectural analysis, memory bounds, and hardware verification for open weights.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button asChild variant="outline" size="sm" className="font-mono text-xs">
            <Link href="/estimator">
              <Cpu className="size-3.5 mr-1.5" />
              Memory Estimator
            </Link>
          </Button>
          <Button asChild variant="default" size="sm" className="font-mono text-xs font-semibold">
            <Link href="/models/advisor">
              <Bot className="size-3.5 mr-1.5" />
              Model Advisor
            </Link>
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2 max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by model or author (e.g. Qwen, Llama, Mistral)..."
              className="pl-9 font-mono text-xs bg-surface-input border-border/80"
            />
          </div>
          <Button type="submit" size="sm" className="font-mono text-xs">
            Search
          </Button>
        </form>

        {/* Tag pills */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {COMMON_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => {
                setSelectedTag(tag);
                setPage(0);
              }}
              className={`px-2.5 py-1 rounded-full text-xs font-mono transition-colors ${
                selectedTag === tag
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-surface-elevated border border-border/60 text-muted-foreground hover:text-foreground hover:bg-card"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Model Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-40 rounded-xl border border-border/40 bg-card/40 animate-pulse"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-xs text-destructive font-mono">
          {error instanceof Error ? error.message : "Failed to load models"}
        </div>
      ) : models.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 p-12 text-center text-sm text-muted-foreground">
          No models found matching your query.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map((m) => (
            <Link
              key={m.id}
              href={`/models/${m.id}`}
              className="group flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 shadow-sm hover:border-brand-accent/60 transition-all hover:shadow-md"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-mono text-muted-foreground block truncate">
                      {m.author}
                    </span>
                    <h3 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                      {m.model_name}
                    </h3>
                  </div>

                  {m.is_supported && (
                    <span title="Architecturally supported">
                      <ShieldCheck className="size-4 text-brand-accent shrink-0 mt-0.5" />
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {m.pipeline_tag && (
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {m.pipeline_tag}
                    </Badge>
                  )}
                  {m.license && (
                    <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                      {m.license}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-border/50 flex items-center justify-between text-xs font-mono text-muted-foreground mt-4">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Download className="size-3" />
                    {m.downloads.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="size-3" />
                    {m.likes.toLocaleString()}
                  </span>
                </div>
                <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/60 pt-4 text-xs font-mono text-muted-foreground">
          <span>
            Page {page + 1} of {totalPages} ({total} models total)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="h-8 text-xs font-mono"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 text-xs font-mono"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
