import React from "react";
import type { NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { BlockLayerHeader } from "./BlockLayerHeader";

export interface BlockLayerFrameData {
  id: string;
  name: string;
  count: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

/**
 * BlockLayerFrame: Swimlane column frame container for the layered Block diagram view.
 *
 * Implements Stage V3-4B2 (D-397):
 * - One rounded rectangle per column with dashed border (border-dashed border-line).
 * - Light surface fill (bg-surface/40 dark:bg-card/25) covering header and all cards.
 * - Non-interactive layout element (pointer-events-none) placed below cards and edges.
 * - Encloses the BlockLayerHeader title band and count pill at the top.
 */
export function BlockLayerFrame({
  data,
}: NodeProps & { data: BlockLayerFrameData }): React.ReactElement {
  const width = data.width ?? 280;
  const height = data.height ?? 120;

  return (
    <div
      role="region"
      aria-label={`Layer Frame: ${data.name}`}
      style={{ width, height }}
      className={cn(
        "pointer-events-none select-none rounded-xl border border-dashed border-line bg-surface/40 dark:bg-card/25 p-1.5 shadow-xs transition-colors",
      )}
    >
      <div className="pointer-events-auto w-full">
        <BlockLayerHeader
          id={`header-${data.id}`}
          type="blockLayerHeader"
          selected={false}
          zIndex={1}
          isConnectable={false}
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          draggable={false}
          deletable={false}
          selectable={false}
          parentId=""
          data={{
            id: data.id,
            name: data.name,
            count: data.count,
          }}
        />
      </div>
    </div>
  );
}
