"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildEstimateRequestPayload,
  estimateMemory,
  fetchHardwareProfiles,
  fetchModels,
} from "@/lib/modelfit/api";
import type {
  EstimationResult,
  HardwareProfile,
  ModelSummary,
} from "@/lib/modelfit/schemas";
import { EstimationResultCard } from "./EstimationResultCard";

interface EstimatorFormProps {
  initialModelId?: string;
  initialParamsB?: number;
}

const QUANT_OPTIONS = [
  { value: "q4_k_m", label: "4-bit (Q4_K_M) - Recommended" },
  { value: "q5_k_m", label: "5-bit (Q5_K_M) - Balanced" },
  { value: "q8_0", label: "8-bit (Q8_0) - High Quality" },
  { value: "fp16", label: "16-bit (FP16/BF16) - Native" },
];

export function EstimatorForm({
  initialModelId = "",
}: EstimatorFormProps) {
  const [hardwareList, setHardwareList] = useState<HardwareProfile[]>([]);
  const [selectedHardwareId, setSelectedHardwareId] = useState<string>("");
  const [customMemoryGb, setCustomMemoryGb] = useState<number>(16);
  const [isCustomHardware, setIsCustomHardware] = useState<boolean>(false);

  const [selectedRepoId, setSelectedRepoId] = useState<string>(initialModelId);
  const [searchQuery, setSearchQuery] = useState<string>(initialModelId);
  const [searchDirty, setSearchDirty] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<ModelSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const [quantization, setQuantization] = useState<string>("q4_k_m");
  const [contextLength, setContextLength] = useState<number>(4096);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EstimationResult | null>(null);

  useEffect(() => {
    fetchHardwareProfiles()
      .then((hw) => {
        setHardwareList(hw);
        if (hw.length > 0 && !selectedHardwareId) {
          setSelectedHardwareId(hw[0]?.id || "");
        }
      })
      .catch((err) => {
        console.error("Failed to load hardware presets:", err);
      });
  }, [selectedHardwareId]);

  useEffect(() => {
    if (!searchDirty) {
      return;
    }
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      return;
    }

    let cancelled = false;

    const timer = setTimeout(() => {
      fetchModels({ search: trimmed, limit: 10 })
        .then((res) => {
          if (cancelled) return;
          setSearchResults(res.items);
          setHighlightedIndex(res.items.length > 0 ? 0 : -1);
          setSearchError(null);
          setSearchLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setSearchResults([]);
          setSearchError(
            err instanceof Error ? err.message : "Failed to search models"
          );
          setSearchLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, searchDirty]);

  const handleSelectModel = (model: ModelSummary) => {
    setSelectedRepoId(model.id);
    setSearchQuery(model.id);
    setSearchDirty(false);
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
    setSearchError(null);
  };

  const handleClearModel = () => {
    setSelectedRepoId("");
    setSearchQuery("");
    setSearchDirty(false);
    setSearchResults([]);
    setSearchError(null);
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isDropdownOpen && searchQuery.trim()) {
        setIsDropdownOpen(true);
      }
      if (searchResults.length > 0) {
        setHighlightedIndex((prev) =>
          prev < searchResults.length - 1 ? prev + 1 : 0
        );
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (searchResults.length > 0) {
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : searchResults.length - 1
        );
      }
    } else if (e.key === "Enter") {
      if (
        isDropdownOpen &&
        highlightedIndex >= 0 &&
        highlightedIndex < searchResults.length
      ) {
        e.preventDefault();
        const item = searchResults[highlightedIndex];
        if (item) {
          handleSelectModel(item);
        }
      }
    } else if (e.key === "Escape") {
      setIsDropdownOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const handleEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const repoId = selectedRepoId.trim();
      if (!repoId) {
        throw new Error("Please search and select a model before estimating.");
      }

      const chosenHardware = hardwareList.find(
        (h) => h.id === selectedHardwareId
      );
      const payload = buildEstimateRequestPayload({
        repoId,
        quantization,
        contextLength,
        selectedHardware: isCustomHardware ? null : chosenHardware,
        customMemoryGb: isCustomHardware ? customMemoryGb : null,
      });

      const res = await estimateMemory(payload);
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Estimation failed");
    } finally {
      setLoading(false);
    }
  };

  const selectedHardware = hardwareList.find(
    (h) => h.id === selectedHardwareId
  );
  const hardwareLabel = isCustomHardware
    ? `${customMemoryGb} GB Custom Memory`
    : selectedHardware?.name || "Selected Hardware";

  const showDropdown =
    isDropdownOpen &&
    (searchLoading || searchError !== null || searchQuery.trim().length > 0);

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleEstimate}
        className="rounded-xl border border-border/80 bg-card p-6 shadow-sm space-y-6"
      >
        <div className="border-b border-border/60 pb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Deterministic Memory Estimator
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Pure rule-based memory calculation for open weights LLMs. No marketing claims or invented figures.
          </p>
        </div>

        {/* Searchable Model Picker */}
        <div className="space-y-2 relative">
          <Label
            htmlFor="estimator-model-search"
            className="text-xs font-mono uppercase tracking-wider text-muted-foreground"
          >
            Model Specification
          </Label>

          <div className="flex items-center gap-2">
            <Input
              id="estimator-model-search"
              role="combobox"
              aria-label="Model search"
              aria-expanded={showDropdown}
              aria-controls="estimator-model-listbox"
              aria-autocomplete="list"
              value={searchQuery}
              onChange={(e) => {
                const nextVal = e.target.value;
                setSearchQuery(nextVal);
                setSelectedRepoId("");
                setSearchDirty(true);
                setIsDropdownOpen(true);
                setHighlightedIndex(-1);
                setSearchError(null);
                if (nextVal.trim()) {
                  setSearchLoading(true);
                } else {
                  setSearchResults([]);
                  setSearchLoading(false);
                }
              }}
              onFocus={() => {
                if (searchQuery.trim() && !selectedRepoId) {
                  setIsDropdownOpen(true);
                }
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search Hugging Face models (e.g. Qwen, Llama)..."
              className="bg-surface-input font-mono text-xs border-border/80 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearModel}
              disabled={!searchQuery && !selectedRepoId}
              className="font-mono text-xs shrink-0"
            >
              Clear
            </Button>
          </div>

          {selectedRepoId && (
            <p className="text-[11px] font-mono text-muted-foreground">
              Selected: <span className="text-foreground">{selectedRepoId}</span>
            </p>
          )}

          {showDropdown && (
            <div
              id="estimator-model-listbox"
              role="listbox"
              aria-label="Model search results"
              className="rounded-lg border border-border/80 bg-card shadow-md max-h-60 overflow-y-auto divide-y divide-border/50"
            >
              {searchLoading ? (
                <div className="p-3 text-xs font-mono text-muted-foreground">
                  Searching models...
                </div>
              ) : searchError ? (
                <div className="p-3 text-xs font-mono text-destructive bg-destructive/10">
                  {searchError}
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-3 text-xs font-mono text-muted-foreground">
                  No matching models found.
                </div>
              ) : (
                searchResults.map((item, idx) => {
                  const isActive = idx === highlightedIndex;
                  const paramsLabel =
                    item.total_params !== null &&
                    item.total_params !== undefined &&
                    item.total_params > 0
                      ? `${(item.total_params / 1e9).toFixed(1)}B params`
                      : null;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectModel(item);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2 ${
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50 text-foreground"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">
                          {item.model_name}
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground truncate">
                          {item.author}
                        </div>
                      </div>
                      {paramsLabel && (
                        <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                          {paramsLabel}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Searches the catalog via Hugging Face Hub and reads exact model metadata by Repo ID.
          </p>
        </div>

        {/* Hardware Spec */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Target Hardware Environment
            </Label>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setIsCustomHardware(false)}
                className={`px-2 py-0.5 rounded font-mono transition-colors ${
                  !isCustomHardware
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Preset Profiles
              </button>
              <button
                type="button"
                onClick={() => setIsCustomHardware(true)}
                className={`px-2 py-0.5 rounded font-mono transition-colors ${
                  isCustomHardware
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Custom Budget
              </button>
            </div>
          </div>

          {isCustomHardware ? (
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min="1"
                max="2048"
                value={customMemoryGb}
                onChange={(e) => setCustomMemoryGb(Number(e.target.value))}
                className="bg-surface-input font-mono text-xs w-32 border-border/80"
              />
              <span className="text-xs font-mono text-muted-foreground">
                GB Total Memory (0 GiB reserved by default)
              </span>
            </div>
          ) : (
            <select
              value={selectedHardwareId}
              onChange={(e) => setSelectedHardwareId(e.target.value)}
              className="w-full rounded-md border border-border/80 bg-surface-input p-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {hardwareList.map((hw) => {
                const gb = Math.round(hw.memory_bytes / (1024 * 1024 * 1024));
                return (
                  <option key={hw.id} value={hw.id}>
                    {hw.name} ({gb} GB {hw.kind.toUpperCase()})
                  </option>
                );
              })}
            </select>
          )}
        </div>

        {/* Quantization & Context Length */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Quantization Precision
            </Label>
            <select
              value={quantization}
              onChange={(e) => setQuantization(e.target.value)}
              className="w-full rounded-md border border-border/80 bg-surface-input p-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {QUANT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Context Length ({contextLength.toLocaleString()} tokens)
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="512"
                max="131072"
                step="512"
                value={contextLength}
                onChange={(e) => setContextLength(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <Input
                type="number"
                min="512"
                max="1048576"
                step="512"
                value={contextLength}
                onChange={(e) => setContextLength(Number(e.target.value))}
                className="w-24 bg-surface-input font-mono text-xs border-border/80"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full font-mono text-xs font-semibold"
        >
          {loading ? "Computing Memory Footprint..." : "Calculate Memory Footprint"}
        </Button>
      </form>

      {result && (
        <EstimationResultCard
          result={result}
          hardwareName={hardwareLabel}
        />
      )}
    </div>
  );
}
