"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { estimateMemory, fetchHardwareProfiles } from "@/lib/modelfit/api";
import type { EstimationResult, HardwareProfile } from "@/lib/modelfit/schemas";
import { EstimationResultCard } from "./EstimationResultCard";

interface EstimatorFormProps {
  initialModelId?: string;
  initialParamsB?: number;
}

const QUANT_OPTIONS = [
  { value: "Q4_K_M", label: "4-bit (Q4_K_M) - Recommended" },
  { value: "Q5_K_M", label: "5-bit (Q5_K_M) - Balanced" },
  { value: "Q8_0", label: "8-bit (Q8_0) - High Quality" },
  { value: "FP16", label: "16-bit (FP16/BF16) - Native" },
];

export function EstimatorForm({
  initialModelId = "",
  initialParamsB,
}: EstimatorFormProps) {
  const [hardwareList, setHardwareList] = useState<HardwareProfile[]>([]);
  const [selectedHardwareId, setSelectedHardwareId] = useState<string>("");
  const [customMemoryGb, setCustomMemoryGb] = useState<number>(16);
  const [isCustomHardware, setIsCustomHardware] = useState<boolean>(false);

  const [modelId, setModelId] = useState<string>(initialModelId);
  const [paramBillions, setParamBillions] = useState<string>(
    initialParamsB ? String(initialParamsB) : "7"
  );
  const [useModelId, setUseModelId] = useState<boolean>(Boolean(initialModelId));

  const [quantization, setQuantization] = useState<string>("Q4_K_M");
  const [contextLength, setContextLength] = useState<number>(4096);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EstimationResult | null>(null);

  useEffect(() => {
    fetchHardwareProfiles()
      .then((hw) => {
        setHardwareList(hw);
        if (hw.length > 0 && !selectedHardwareId) {
          // Default to first preset GPU (e.g. RTX 4090 or T4)
          setSelectedHardwareId(hw[0]?.id || "");
        }
      })
      .catch((err) => {
        console.error("Failed to load hardware presets:", err);
      });
  }, [selectedHardwareId]);

  const handleEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload: Parameters<typeof estimateMemory>[0] = {
        quantization,
        context_length: contextLength,
      };

      if (isCustomHardware) {
        payload.hardware_custom_memory_gb = customMemoryGb;
      } else if (selectedHardwareId) {
        payload.hardware_profile_id = selectedHardwareId;
      }

      if (useModelId && modelId.trim()) {
        payload.model_id = modelId.trim();
      } else {
        const pNum = parseFloat(paramBillions);
        if (isNaN(pNum) || pNum <= 0) {
          throw new Error("Please enter a valid parameter count in billions.");
        }
        payload.total_params = Math.round(pNum * 1e9);
      }

      const res = await estimateMemory(payload);
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Estimation failed");
    } finally {
      setLoading(false);
    }
  };

  const selectedHardware = hardwareList.find((h) => h.id === selectedHardwareId);
  const hardwareLabel = isCustomHardware
    ? `${customMemoryGb} GB Custom Memory`
    : selectedHardware?.name || "Selected Hardware";

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

        {/* Model Spec */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Model Specification
            </Label>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setUseModelId(true)}
                className={`px-2 py-0.5 rounded font-mono transition-colors ${
                  useModelId
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Repo ID
              </button>
              <button
                type="button"
                onClick={() => setUseModelId(false)}
                className={`px-2 py-0.5 rounded font-mono transition-colors ${
                  !useModelId
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Param Count
              </button>
            </div>
          </div>

          {useModelId ? (
            <div>
              <Input
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="e.g. Qwen/Qwen2.5-7B-Instruct or meta-llama/Llama-3.1-8B"
                className="bg-surface-input font-mono text-xs border-border/80"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Reads exact architectural weights & tensor shapes from model cache or Hugging Face config.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="1000"
                  value={paramBillions}
                  onChange={(e) => setParamBillions(e.target.value)}
                  className="bg-surface-input font-mono text-xs w-32 border-border/80"
                />
                <span className="text-xs font-mono text-muted-foreground">Billion Parameters (e.g. 7 for 7B)</span>
              </div>
            </div>
          )}
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
                GB Total Memory (5% reserved for OS runtime)
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
          <div className="rounded-md border border-rose-600/30 bg-rose-500/10 p-3 text-xs text-rose-500">
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
