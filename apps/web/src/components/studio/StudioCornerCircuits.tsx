import React from "react";

/**
 * StudioCornerCircuits: Static inline SVG decorative circuit lines.
 *
 * Rules (D-347 & Approved Answer 6):
 * - Exactly matching reference crops (ref-corner-top-left.png, ref-corner-bottom-right.png):
 *   - 1px stroke, low-contrast neutral grey (rgba(255, 255, 255, 0.09))
 *   - Rounded 90-degree corners, one 45-degree diagonal cut per trace
 *   - 2 to 3 parallel traces side by side
 * - Top-left:
 *   - Trace 1 comes down from top, rounded corner, diagonal down-left, horizontal to left edge
 *   - Trace 2 runs vertically down with a rounded corner to the left edge
 *   - Trace 3 outer boundary track
 * - Bottom-right:
 *   - Trace 1 comes from right edge by diagonal down-left, vertically down, rounded corner, runs left along bottom
 *   - Short horizontal/diagonal stub
 * - Accessible: aria-hidden="true", pointer-events-none, behind content (z-0 inside isolated main)
 * - Main-scoped: positioned strictly inside main container (no overflow, no scrollbars, never overlaps sidebar)
 * - Zero animations, zero green dots.
 */
export function StudioCornerCircuits(): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      data-studio-bg="true"
      data-testid="studio-corner-circuits"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none"
    >
      {/* Top-Left Corner Circuit */}
      <svg
        className="absolute top-0 left-0 text-white/[0.14]"
        width="340"
        height="260"
        viewBox="0 0 340 260"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Trace 1: vertical down from top, rounded corner to diagonal down-left, rounded corner to horizontal left edge */}
        <path
          d="M 210 0 L 210 50 Q 210 65 199 76 L 121 154 Q 110 165 95 165 L 0 165"
          stroke="currentColor"
          strokeWidth="1"
        />

        {/* Trace 2: parallel outer trace with rounded corners running down to left edge */}
        <path
          d="M 105 0 L 105 70 Q 105 85 90 85 L 0 85"
          stroke="currentColor"
          strokeWidth="1"
        />

        {/* Trace 3: subtle outer boundary track */}
        <path
          d="M 300 0 L 300 20 Q 300 35 289 46 L 249 86 Q 238 97 223 97 L 170 97"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>

      {/* Bottom-Right Corner Circuit */}
      <svg
        className="absolute bottom-0 right-0 text-white/[0.14]"
        width="340"
        height="260"
        viewBox="0 0 340 260"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Trace 1: comes from right edge, diagonal down-left, vertically down, rounded corner, runs left along bottom */}
        <path
          d="M 340 60 L 295 105 Q 284 116 284 131 L 284 185 Q 284 200 269 200 L 80 200"
          stroke="currentColor"
          strokeWidth="1"
        />

        {/* Trace 2: parallel inner trace turning along bottom */}
        <path
          d="M 340 120 L 315 145 Q 304 156 304 171 L 304 235 Q 304 250 289 250 L 170 250"
          stroke="currentColor"
          strokeWidth="1"
        />

        {/* Short horizontal stub matching reference crop */}
        <path
          d="M 250 200 L 210 200"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}

