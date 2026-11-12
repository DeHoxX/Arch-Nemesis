import React from "react";
import { cn } from "@/lib/utils";

export interface BrandMarkProps {
  className?: string;
  showText?: boolean;
}

/**
 * BrandMark: Inline SVG hex-network logo mark and mono uppercase label.
 *
 * Rules:
 * - Solid SVG vector geometry (no external assets, no raster images)
 * - Accessible: aria-hidden="true" on vector graphic
 * - Reusable across Sidebar, studio header, and Stage H2 views
 */
export function BrandMark({ className, showText = true }: BrandMarkProps): React.ReactElement {
  return (
    <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <svg
        width="18"
        height="20"
        viewBox="0 0 18 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 text-brand-accent"
        aria-hidden="true"
      >
        {/* Outer hexagon */}
        <polygon
          points="9,1 17,5.5 17,14.5 9,19 1,14.5 1,5.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
          className="opacity-70"
        />
        {/* Inner network nodes and connections */}
        <line x1="9" y1="1" x2="9" y2="10" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
        <line x1="17" y1="14.5" x2="9" y2="10" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
        <line x1="1" y1="14.5" x2="9" y2="10" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
        <circle cx="9" cy="10" r="1.5" fill="currentColor" />
        <circle cx="9" cy="1" r="1" fill="currentColor" />
        <circle cx="17" cy="5.5" r="1" fill="currentColor" />
        <circle cx="17" cy="14.5" r="1" fill="currentColor" />
        <circle cx="9" cy="19" r="1" fill="currentColor" />
        <circle cx="1" cy="14.5" r="1" fill="currentColor" />
        <circle cx="1" cy="5.5" r="1" fill="currentColor" />
      </svg>
      {showText && (
        <span className="font-mono text-xs font-bold tracking-widest text-foreground uppercase">
          ARCH-NEMESIS
        </span>
      )}
    </div>
  );
}

