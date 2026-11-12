"use client";

import React, { useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  BADGE_LEGEND_ITEMS,
  BORDER_LEGEND_ITEMS,
  CONSTRAINT_LOCK_LEGEND,
  EDGE_LEGEND_ITEMS,
  SHAPE_LEGEND_ITEMS,
} from "./classify";

/**
 * DiagramLegend: Collapsible legend panel explaining diagram visual conventions.
 *
 * Requirements (Stage B2, D-301, D-303):
 * - Floating card positioned top-right inside DiagramView.
 * - Collapsed by default, toggleable via keyboard-accessible button.
 * - Hidden on screens narrower than 768px (hidden md:block).
 * - Rendered strictly from classify.ts metadata (no hardcoded node taxonomies).
 * - Plain React text only (no dangerouslySetInnerHTML).
 */
export interface DiagramLegendProps {
  className?: string;
  isOpen?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
}

/**
 * DiagramLegend: Collapsible legend panel explaining diagram visual conventions.
 *
 * Requirements (Stage B2, D-301, D-303, Stage 1C+ D-332):
 * - Collapsed by default, toggleable via keyboard-accessible button.
 * - Supports controlled (isOpen, onToggle) or uncontrolled mode.
 * - Docked outside React Flow or inside FlowPlaybackBar.
 * - Hidden on screens narrower than 768px (hidden md:block).
 * - Rendered strictly from classify.ts metadata (no hardcoded node taxonomies).
 * - Plain React text only (no dangerouslySetInnerHTML).
 */
export function DiagramLegend({
  className,
  isOpen: controlledIsOpen,
  onToggle: controlledOnToggle,
  onClose,
}: DiagramLegendProps = {}): React.ReactElement {
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(false);

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : uncontrolledIsOpen;

  const handleToggle = () => {
    if (isControlled) {
      controlledOnToggle?.();
    } else {
      setUncontrolledIsOpen((prev) => !prev);
    }
  };

  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (isControlled) {
        onClose?.();
      } else {
        setUncontrolledIsOpen(false);
      }
    }
  };

  return (
    <div className={cn("relative select-none", className)}>
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls="diagram-legend-panel"
        aria-label="Toggle diagram legend"
        className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>Legend</span>
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <div
          id="diagram-legend-panel"
          role="region"
          aria-label="Diagram legend"
          onKeyDown={handlePanelKeyDown}
          className="absolute bottom-full right-0 mb-2 max-h-[calc(100vh-320px)] w-64 overflow-y-auto rounded-md border border-border bg-card p-3 text-xs shadow-lg z-30"
        >
          <div className="space-y-3">
            {/* Border Colors */}
            <div>
              <p className="mb-1.5 font-semibold text-[11px] text-foreground tracking-tight">
                Node Borders
              </p>
              <div className="space-y-1">
                {BORDER_LEGEND_ITEMS.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-3 shrink-0 rounded-xs border-2 bg-card",
                        item.swatchClass,
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">{item.label}</span>
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        — {item.description}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Shapes */}
            <div>
              <p className="mb-1.5 font-semibold text-[11px] text-foreground tracking-tight">
                Node Shapes
              </p>
              <div className="space-y-1">
                {SHAPE_LEGEND_ITEMS.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    {item.id === "shape-rectangle" && (
                      <div className="size-3 shrink-0 rounded-xs border border-muted-foreground/60 bg-card" />
                    )}
                    {item.id === "shape-pill" && (
                      <div className="h-2.5 w-4 shrink-0 rounded-full border border-muted-foreground/60 bg-card" />
                    )}
                    {item.id === "shape-hexagon" && (
                      <svg className="size-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
                        <polygon
                          points="4,1 12,1 15,8 12,15 4,15 1,8"
                          className="fill-card stroke-muted-foreground/60"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                    {item.id === "shape-diamond" && (
                      <div className="size-2.5 shrink-0 rotate-45 border border-muted-foreground/60 bg-card" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">{item.label}</span>
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        — {item.description}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Badges */}
            <div>
              <p className="mb-1.5 font-semibold text-[11px] text-foreground tracking-tight">
                Badges
              </p>
              <div className="space-y-1">
                {BADGE_LEGEND_ITEMS.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "px-1 py-0 text-[9px] font-mono leading-tight tracking-tight uppercase shrink-0",
                        item.label === "Entry" &&
                          "border-emerald-500/50 text-emerald-400 bg-emerald-500/10",
                        item.label === "Exit" &&
                          "border-violet-500/50 text-violet-400 bg-violet-500/10",
                        item.label === "AI model" &&
                          "border-amber-500/50 text-amber-400 bg-amber-500/10",
                        item.label === "Agent" &&
                          "border-amber-500/50 text-amber-300 bg-amber-500/20",
                      )}
                    >
                      {item.label}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {item.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Constraints */}
            <div>
              <p className="mb-1.5 font-semibold text-[11px] text-foreground tracking-tight">
                Constraints
              </p>
              <div className="flex items-center gap-2">
                <Lock
                  className="size-3 shrink-0 text-amber-500"
                  aria-label={CONSTRAINT_LOCK_LEGEND.label}
                />
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">
                    {CONSTRAINT_LOCK_LEGEND.label}
                  </span>
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    — {CONSTRAINT_LOCK_LEGEND.description}
                  </span>
                </div>
              </div>
            </div>

            {/* Edges */}
            <div>
              <p className="mb-1.5 font-semibold text-[11px] text-foreground tracking-tight">
                Edge Flows
              </p>
              <div className="space-y-1">
                {EDGE_LEGEND_ITEMS.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    {item.id === "edge-solid" ? (
                      <div className="h-0.5 w-4 shrink-0 bg-muted-foreground/60" />
                    ) : (
                      <div className="h-0 w-4 shrink-0 border-t border-dashed border-muted-foreground/60" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">{item.label}</span>
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        — {item.description}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

