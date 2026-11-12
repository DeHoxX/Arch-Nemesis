import React from "react";
import { cn } from "@/lib/utils";
import { StudioCornerCircuits } from "./StudioCornerCircuits";
import Waves from "./Waves";

export interface StudioBackgroundProps {
  showWaves?: boolean;
  wavesLayerTestId?: string;
  wavesScope?: "full" | "header-band";
}

/**
 * StudioBackground: Shared decorative studio background stack.
 *
 * Rules (D-347, D-351, D-355):
 * - Renders static StudioCornerCircuits at z-0.
 * - When showWaves is true, renders WebGL2 Waves at z-0, pointer-events-none, aria-hidden.
 * - wavesScope:
 *   - "full" (default for "/"): inset-0 covering the full studio canvas.
 *   - "header-band" (for "/design/[id]" in H2b): inset-x-0 top-0 h-[260px] with a bottom fade mask
 *     so waves never run behind the React Flow diagram canvas.
 * - Waves props are copied exactly from the approved studio home configuration.
 */
export function StudioBackground({
  showWaves = false,
  wavesLayerTestId,
  wavesScope = "full",
}: StudioBackgroundProps): React.ReactElement {
  const isHeaderBand = wavesScope === "header-band";

  return (
    <>
      {/* Interactive WebGL2 Waves layer (D-351, D-355) */}
      {showWaves && (
        <div
          aria-hidden="true"
          data-testid={wavesLayerTestId}
          className={cn(
            "pointer-events-none absolute z-0 overflow-hidden",
            isHeaderBand ? "inset-x-0 top-0 h-[260px]" : "inset-0"
          )}
          style={
            isHeaderBand
              ? {
                  maskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
                  WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
                }
              : undefined
          }
        >
          <Waves
            lineColor="#ffffff"
            spacing={5}
            amplitude={13}
            twist={0}
            speed={0.45}
            mouseRadius={100}
            mouseStrength={0.3}
            accentColor="#10b981"
            lineStyle="dashed"
            lineWidth={0.5}
            scale={0.7}
            bounce={0.3}
            returnDuration={1}
            opacity={0.55}
            lightMode
          />
        </div>
      )}

      {/* Decorative static corner circuit lines (D-347, D-349) */}
      <StudioCornerCircuits />
    </>
  );
}
