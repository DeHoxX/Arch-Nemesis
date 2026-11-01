import React from "react";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ConstraintSpec, EdgeSpec, NodeSpec } from "@/lib/types";
import { cn } from "@/lib/utils";
import { type BorderColor, classifyNode } from "./classify";
import { DIAMOND_INNER_WIDTH } from "./layout";

export type DiagramNodeData = NodeSpec & {
  entry_ids: string[];
  exit_ids: string[];
  constraints: ConstraintSpec[];
  edges?: EdgeSpec[];
  width?: number;
  height?: number;
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
 * Requirements (Stage B4e1 & D-188 Fix):
 * - Fixed 240px width; content-computed height.
 * - Handles: Top (target) and Bottom (source) centered.
 * - Shapes by structure:
 *   1. entry_ids or exit_ids -> pill
 *   2. diamond decision -> diamond with centered inner box (DIAMOND_INNER_WIDTH = 112px)
 *   3. needs_model true (or ai_role model/agent) -> hexagon (with agent double ring)
 *   4. otherwise -> rectangle
 * - Name and role wrapped with line-clamp-2, break-words (diamond role max 1 line).
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

  const width = typeof data.width === "number" ? data.width : 240;
  const height = typeof data.height === "number" ? data.height : (isDiamond ? 140 : 80);

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
      style={{ width, height }}
      className={cn(
        "relative flex select-none flex-col text-card-foreground transition-all outline-none",
        isDiamond ? "items-center justify-center" : "justify-between",
        !isHexagon && !isDiamond && "bg-card",
        !isHexagon && !isDiamond && (isPill ? "rounded-full px-8 py-2 border" : "rounded-xl border px-3 py-2"),
        !isHexagon && !isDiamond && borderClassMap[borderColor],
        isHexagon && "px-7 py-2.5",
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
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon
            points={`18,1 ${width - 18},1 ${width - 1},${height / 2} ${width - 18},${height - 1} 18,${height - 1} 1,${height / 2}`}
            className="fill-card transition-colors"
            stroke={strokeColorMap[borderColor]}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {isAgent && (
            <polygon
              points={`21,5 ${width - 21},5 ${width - 6},${height / 2} ${width - 21},${height - 5} 21,${height - 5} 6,${height / 2}`}
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
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon
            points={`${width / 2},1 ${width - 1},${height / 2} ${width / 2},${height - 1} 1,${height / 2}`}
            className="fill-card transition-colors"
            stroke={strokeColorMap[borderColor]}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )}

      <Handle
        type="target"
        position={Position.Top}
        className="size-1.5 border-none bg-muted-foreground/60"
        aria-hidden="true"
      />

      {isDiamond ? (
        /* Diamond centered inner box (D-188): strictly bounded to central rhombus region */
        <div
          style={{ width: DIAMOND_INNER_WIDTH, maxHeight: Math.round(height * 0.52) }}
          className="diamond-inner-box flex flex-col items-center justify-center text-center overflow-hidden gap-0.5 px-1 py-0.5 pointer-events-auto"
        >
          <p
            className="line-clamp-2 break-words font-semibold text-xs text-foreground tracking-tight leading-snug"
            title={data.name}
          >
            {data.name}
          </p>
          <p
            className="truncate font-mono text-[9px] text-muted-foreground leading-tight"
            title={data.type}
          >
            {data.type}
          </p>
          {Boolean(data.role) && (
            <p
              className="line-clamp-1 break-words text-[9px] text-muted-foreground/90 leading-tight"
              title={data.role}
            >
              {data.role}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-1 overflow-hidden pt-0.5">
            {locked && (
              <span title="Named in a constraint" className="shrink-0 text-muted-foreground">
                <Lock className="size-2.5 text-amber-500" aria-label="Locked by constraint" />
              </span>
            )}
            {badges.map((b) => (
              <Badge
                key={b}
                variant="outline"
                className={cn(
                  "px-1 py-0 text-[8px] font-mono leading-tight tracking-tight uppercase",
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
      ) : (
        /* Non-diamond standard layout */
        <>
          <div className="flex items-start justify-between gap-1.5 overflow-hidden w-full">
            <div className="min-w-0 flex-1 overflow-hidden">
              <p
                className="line-clamp-2 break-words font-semibold text-xs text-foreground tracking-tight leading-snug"
                title={data.name}
              >
                {data.name}
              </p>
              <p
                className="truncate font-mono text-[10px] text-muted-foreground leading-tight"
                title={data.type}
              >
                {data.type}
              </p>
            </div>

            {locked && (
              <span title="Named in a constraint" className="shrink-0 text-muted-foreground pt-0.5">
                <Lock className="size-3 text-amber-500" aria-label="Locked by constraint" />
              </span>
            )}
          </div>

          <div className="flex items-end justify-between gap-1 overflow-hidden w-full pt-0.5">
            <p
              className="line-clamp-2 break-words text-[10px] text-muted-foreground/90 max-w-[130px] leading-tight"
              title={data.role}
            >
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
        </>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="size-1.5 border-none bg-muted-foreground/60"
        aria-hidden="true"
      />
    </div>
  );
}
