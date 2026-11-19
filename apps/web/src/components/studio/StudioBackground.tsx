import React from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/useTheme";
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
 * Rules (D-347, D-351, D-355, D-388):
 * - Renders static StudioCornerCircuits at z-0.
 * - When showWaves is true, renders WebGL2 Waves at z-0, pointer-events-none, aria-hidden.
 * - wavesScope:
 *   - "full" (default for "/"): inset-0 covering the full studio canvas.
 *   - "header-band" (for "/design/[id]" in H2b): inset-x-0 top-0 h-[260px] with a bottom fade mask
 *     so waves never run behind the React Flow diagram canvas.
 * - In dark mode, Waves uses approved studio home configuration (white lines, emerald accent).
 * - In light mode (D-388), Waves uses warm neutrals (#D1CCC0 lines, faint #E87532 accent, 0.35 opacity).
 */
export function StudioBackground({
  showWaves = false,
  wavesLayerTestId,
  wavesScope = "full",
}: StudioBackgroundProps): React.ReactElement {
  const isHeaderBand = wavesScope === "header-band";
  const { theme } = useTheme();
  const isLight = theme === "light";

  return (
    <>
      {/* Interactive WebGL2 Waves layer (D-351, D-355, D-388) */}
      {showWaves && (
        <div
          aria-hidden="true"
          data-studio-bg="true"
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
            lineColor={isLight ? "#D1CCC0" : "#ffffff"}
            spacing={5}
            amplitude={13}
            twist={0}
            speed={0.45}
            mouseRadius={100}
            mouseStrength={0.3}
            accentColor={isLight ? "#E87532" : "#10b981"}
            lineStyle="dashed"
            lineWidth={0.5}
            scale={0.7}
            bounce={0.3}
            returnDuration={1}
            opacity={isLight ? 0.35 : 0.55}
            lightMode
          />
        </div>
      )}

      {/* Decorative static corner circuit lines (D-347, D-349) */}
      <StudioCornerCircuits />
    </>
  );
}
