import React from "react";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ConstraintSpec, EdgeSpec, NodeSpec } from "@/lib/types";
import { cn } from "@/lib/utils";
import { type BorderColor, classifyNode } from "./classify";

export type DiagramNodeData = NodeSpec & {
  entry_ids: string[];
  exit_ids: string[];
  constraints: ConstraintSpec[];
  edges?: EdgeSpec[];
  onSelect?: (id: string) => void;
  [key: string]: unknown;
};

const borderClassMap: Record<BorderColor, string> = {
  emerald: "border-emerald-500",
  violet: "border-violet-500",
  amber: "border-amber-500",
  slate: "border-slate-500",
};

const strokeColorMap: Record<BorderColor, string> = {
  emerald: "#10b981", // emerald-500
  violet: "#8b5cf6",  // violet-500
  amber: "#f59e0b",   // amber-500
  slate: "#64748b",   // slate-500
};

/**
 * Custom Diagram Node card.
 *
 * Requirements (BUILD_PLAN.md:436-439, B4a & B4b):
 * - Fixed 220 by 72 pixels.
 * - Shapes by structure:
 *   1. entry_ids or exit_ids -> pill
 *   2. diamond decision -> diamond
 *   3. needs_model true (or ai_role model/agent) -> hexagon (with agent double ring)
 *   4. otherwise -> rectangle
 * - Name and role truncated (long unbroken strings must not break the card).
 * - Type text shown as small grey text and NEVER changes any style.
 * - Badges: Entry, Exit, AI model, Agent (from classify.ts).
 * - Border colour by priority: entry emerald, exit violet, needs_model amber, otherwise slate.
 * - Lock icon when node is named in any constraint.
 * - Focusable with tabIndex={0}, aria-label="Node: {name}, {type}".
 */
export function DiagramNode({
  data,
  selected,
}: NodeProps & { data: DiagramNodeData }): React.ReactElement {
  const { borderColor, badges, locked, shape } = classifyNode(data, {
    entry_ids: data.entry_ids || [],
    exit_ids: data.exit_ids || [],
    constraints: data.constraints || [],
    edges: data.edges || [],
  });

  const isHexagon = shape === "hexagon";
  const isDiamond = shape === "diamond";
  const isPill = shape === "pill";
  const isAgent = data.ai_role === "agent";

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`Node: ${data.name}, ${data.type}`}
      aria-pressed={Boolean(selected)}
      onClick={() => data.onSelect?.(data.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          data.onSelect?.(data.id);
        }
      }}
      className={cn(
        "relative flex h-[72px] w-[220px] select-none flex-col justify-between text-card-foreground transition-all outline-none",
        !isHexagon && !isDiamond && "bg-card p-2.5",
        !isHexagon && !isDiamond && (isPill ? "rounded-full px-5 border" : "rounded-xl border p-2.5"),
        !isHexagon && !isDiamond && borderClassMap[borderColor],
        isHexagon && "px-6 py-2.5",
        isDiamond && "px-7 py-2.5",
        selected
          ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
          : "hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        (isHexagon || isDiamond) && selected && "rounded-xl",
      )}
    >
      {/* Hexagon SVG background & border outline */}
      {isHexagon && (
        <svg
          className="absolute inset-0 size-full pointer-events-none -z-10"
          viewBox="0 0 220 72"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon
            points="18,1 202,1 219,36 202,71 18,71 1,36"
            className="fill-card transition-colors"
            stroke={strokeColorMap[borderColor]}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {isAgent && (
            <polygon
              points="21,5 199,5 214,36 199,67 21,67 6,36"
              className="fill-none"
              stroke={strokeColorMap[borderColor]}
              strokeWidth="1"
              strokeLinejoin="round"
              opacity="0.75"
            />
          )}
        </svg>
      )}

      {/* Diamond SVG background & border outline */}
      {isDiamond && (
        <svg
          className="absolute inset-0 size-full pointer-events-none -z-10"
          viewBox="0 0 220 72"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon
            points="110,1 219,36 110,71 1,36"
            className="fill-card transition-colors"
            stroke={strokeColorMap[borderColor]}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )}

      <Handle
        type="target"
        position={Position.Left}
        className="size-1.5 border-none bg-muted-foreground/60"
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-1.5 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate font-semibold text-xs text-foreground tracking-tight" title={data.name}>
            {data.name}
          </p>
          <p className="truncate font-mono text-[10px] text-muted-foreground" title={data.type}>
            {data.type}
          </p>
        </div>

        {locked && (
          <span title="Named in a constraint" className="shrink-0 text-muted-foreground">
            <Lock className="size-3 text-amber-500" aria-label="Locked by constraint" />
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-1 overflow-hidden pt-0.5">
        <p className="truncate text-[10px] text-muted-foreground/90 max-w-[120px]" title={data.role}>
          {data.role}
        </p>

        <div className="flex shrink-0 items-center gap-1 overflow-hidden">
          {badges.map((b) => (
            <Badge
              key={b}
              variant="outline"
              className={cn(
                "px-1 py-0 text-[9px] font-mono leading-tight tracking-tight uppercase",
                b === "Entry" && "border-emerald-500/50 text-emerald-400 bg-emerald-500/10",
                b === "Exit" && "border-violet-500/50 text-violet-400 bg-violet-500/10",
                b === "AI model" && "border-amber-500/50 text-amber-400 bg-amber-500/10",
                b === "Agent" && "border-amber-500/50 text-amber-300 bg-amber-500/20",
              )}
            >
              {b}
            </Badge>
          ))}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="size-1.5 border-none bg-muted-foreground/60"
        aria-hidden="true"
      />
    </div>
  );
}
