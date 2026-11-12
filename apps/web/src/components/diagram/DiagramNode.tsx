import React from "react";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { User } from "lucide-react";
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
  diffStatus?: "added" | "removed" | "edited" | "unchanged";
  dimmed?: boolean;
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
 * Requirements (Stage 1A & D-323):
 * - Fixed 240px width; content-computed height.
 * - Handles: Top (target) and Bottom (source) centered.
 * - Shapes by structure:
 *   1. entry_ids or exit_ids -> pill
 *   2. diamond decision -> diamond with centered inner box (DIAMOND_INNER_WIDTH = 112px)
 *   3. needs_model true (or ai_role model/agent) -> hexagon (with agent double ring)
 *   4. otherwise -> rectangle
 * - Typographic hierarchy on card:
 *   1. name (semibold, foreground, max 2 lines, break-words)
 *   2. role (muted, existing clamp: 2 lines non-diamond, 1 line diamond)
 *   3. type + micro-labels (mono, 10px, muted; type never changes style per Rule 3)
 *      - Plain monospace text micro-labels replacing stacked colored Badge pills
 *      - Entry node receives small User icon + "Entry"
 *   4. tech_options as plain small mono text line "A · B · +N" (max 3 shown, hidden when empty; omitted in diamond)
 * - Border colour by priority: entry emerald, exit violet, needs_model amber, otherwise slate.
 * - Lock icon when node is named in any constraint.
 * - Focusable with tabIndex={0}, aria-label="Node: {name}, {type}".
 */
export function DiagramNode({
  data,
  selected,
}: NodeProps & { data: DiagramNodeData }): React.ReactElement {
  const { borderColor, badges, shape } = classifyNode(data, {
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

  const diffBadge =
    data.diffStatus === "added"
      ? "New"
      : data.diffStatus === "removed"
        ? "Removed"
        : data.diffStatus === "edited"
          ? "Edited"
          : null;

  const accessibleLabel =
    data.diffStatus && data.diffStatus !== "unchanged"
      ? `Node: ${data.name}, ${data.type}, ${data.diffStatus}`
      : `Node: ${data.name}, ${data.type}`;

  const validTechOptions = Array.isArray(data.tech_options)
    ? data.tech_options.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];
  const techDisplay =
    !isDiamond && validTechOptions.length > 0
      ? validTechOptions.length <= 3
        ? validTechOptions.join(" · ")
        : `${validTechOptions.slice(0, 3).join(" · ")} · +${validTechOptions.length - 3}`
      : null;

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={accessibleLabel}
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
        data.diffStatus === "added" && "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background",
        data.diffStatus === "removed" && "border-dashed ring-2 ring-rose-500 ring-offset-2 ring-offset-background",
        !data.dimmed && data.diffStatus === "removed" && "opacity-70",
        data.diffStatus === "edited" && "ring-2 ring-sky-500 ring-offset-2 ring-offset-background",
        data.dimmed && "opacity-30",
        selected
          ? "ring-2 ring-[var(--brand-accent,#b7c6c2)] ring-offset-2 ring-offset-background"
          : "hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        (isHexagon || isDiamond) && (selected || (data.diffStatus && data.diffStatus !== "unchanged")) && "rounded-xl",
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
          {Boolean(data.role) && (
            <p
              className="line-clamp-1 break-words text-[9px] text-muted-foreground/90 leading-tight"
              title={data.role}
            >
              {data.role}
            </p>
          )}
          <div className="flex items-center justify-center gap-1 flex-wrap font-mono text-[9px] text-muted-foreground leading-tight">
            <span className="truncate" title={data.type}>
              {data.type}
            </span>
            {badges.map((b) => (
              <span
                key={b}
                className="inline-flex items-center text-[8px] font-mono text-muted-foreground"
              >
                {b === "Entry" ? (
                  <>
                    <User className="size-2 mr-0.5 text-emerald-400 shrink-0" aria-hidden="true" />
                    Entry
                  </>
                ) : (
                  b
                )}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1 overflow-hidden pt-0.5">
            {diffBadge && (
              <Badge
                variant="outline"
                className={cn(
                  "px-1 py-0 text-[8px] font-mono leading-tight tracking-tight uppercase",
                  data.diffStatus === "added" && "border-emerald-500/50 text-emerald-400 bg-emerald-500/10",
                  data.diffStatus === "removed" && "border-rose-500/50 text-rose-400 bg-rose-500/10",
                  data.diffStatus === "edited" && "border-sky-500/50 text-sky-400 bg-sky-500/10",
                )}
              >
                {diffBadge}
              </Badge>
            )}
          </div>
        </div>
      ) : (
        /* Non-diamond standard layout */
        <>
          <div className="flex flex-col gap-0.5 w-full overflow-hidden">
            {/* Row 1: Name and optional Lock / Diff badge */}
            <div className="flex items-start justify-between gap-1.5 overflow-hidden w-full">
              <p
                className="line-clamp-2 break-words font-semibold text-xs text-foreground tracking-tight leading-snug flex-1 min-w-0"
                title={data.name}
              >
                {data.name}
              </p>

              <div className="flex shrink-0 items-center gap-1 overflow-hidden pt-0.5">
                {diffBadge && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "px-1 py-0 text-[9px] font-mono leading-tight tracking-tight uppercase",
                      data.diffStatus === "added" && "border-emerald-500/50 text-emerald-400 bg-emerald-500/10",
                      data.diffStatus === "removed" && "border-rose-500/50 text-rose-400 bg-rose-500/10",
                      data.diffStatus === "edited" && "border-sky-500/50 text-sky-400 bg-sky-500/10",
                    )}
                  >
                    {diffBadge}
                  </Badge>
                )}
              </div>
            </div>

            {/* Row 2: Role (muted, existing clamp: 2 lines) */}
            {Boolean(data.role) && (
              <p
                className="line-clamp-2 break-words text-[10px] text-muted-foreground/90 leading-tight w-full"
                title={data.role}
              >
                {data.role}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-0.5 w-full overflow-hidden pt-0.5">
            {/* Row 3: Type + micro-labels (mono, 10px, muted; type never changes style, Rule 3) */}
            <div className="flex items-center gap-1.5 flex-wrap overflow-hidden w-full text-[10px] font-mono text-muted-foreground leading-tight">
              <span className="truncate" title={data.type}>
                {data.type}
              </span>
              {badges.map((b) => (
                <span
                  key={b}
                  className="inline-flex items-center text-[10px] font-mono text-muted-foreground"
                >
                  {b === "Entry" ? (
                    <>
                      <User className="size-2.5 mr-0.5 text-emerald-400 shrink-0" aria-hidden="true" />
                      Entry
                    </>
                  ) : (
                    b
                  )}
                </span>
              ))}
            </div>

            {/* Row 4: Tech line (plain small mono text line "A · B · +N", max 3 shown, hidden when empty) */}
            {techDisplay && (
              <p
                className="truncate font-mono text-[9px] text-muted-foreground/80 leading-tight w-full select-text"
                title={validTechOptions.join(", ")}
              >
                {techDisplay}
              </p>
            )}
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
