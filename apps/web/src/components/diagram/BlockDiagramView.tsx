"use client";

import React, { useMemo } from "react";
import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  type Node,
  Position,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { ArchitectureSpec, UnionArchitectureSpec } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BlockEdge, type BlockEdgeData } from "./BlockEdge";
import { BlockNode, type BlockNodeData } from "./BlockNode";
import { FitViewWatcher } from "./FitViewWatcher";
import { computeLayout } from "./layout";

export interface BlockDiagramViewProps {
  spec: ArchitectureSpec | UnionArchitectureSpec;
  fitViewTrigger?: unknown;
  nodesKey?: string;
  className?: string;
}

const nodeTypes = {
  blockNode: BlockNode,
};

const edgeTypes = {
  blockEdge: BlockEdge,
};

/**
 * BlockDiagramView: Simple conceptual block diagram view.
 *
 * Requirements (Stage B4e1):
 * - Boxes and arrows only.
 * - Top-to-bottom layout with custom node heights and width 240px.
 * - Handles: Top (target) and Bottom (source).
 * - ReactFlow minZoom 0.3, maxZoom 1.5, fitView padding 0.2.
 * - Directed arrows with no edge/flow label text.
 * - Non-interactive: elementsSelectable={false}, nodesDraggable={false}, nodesConnectable={false}.
 * - Standard pan/zoom controls enabled; no minimap.
 */
export function BlockDiagramView({
  spec,
  fitViewTrigger,
  nodesKey,
  className,
}: BlockDiagramViewProps): React.ReactElement {
  // Pure Dagre top-to-bottom layout calculation
  const layout = useMemo(() => computeLayout(spec), [spec]);

  const computedNodesKey = useMemo(
    () => nodesKey ?? spec.nodes.map((n) => n.id).sort().join(","),
    [nodesKey, spec.nodes],
  );

  const entryIds = useMemo(() => new Set(spec.entry_ids || []), [spec.entry_ids]);
  const exitIds = useMemo(() => new Set(spec.exit_ids || []), [spec.exit_ids]);

  // Transform layout nodes to React Flow Node structure
  const nodes: Node<BlockNodeData>[] = useMemo(() => {
    return layout.nodes.map((pn) => ({
      id: pn.id,
      type: "blockNode",
      position: pn.position,
      width: pn.width,
      height: pn.height,
      initialWidth: pn.width,
      initialHeight: pn.height,
      selectable: false,
      draggable: false,
      handles: [
        {
          id: null,
          type: "target",
          position: Position.Left,
          x: 0,
          y: pn.height / 2,
          width: 6,
          height: 6,
        },
        {
          id: null,
          type: "source",
          position: Position.Right,
          x: pn.width,
          y: pn.height / 2,
          width: 6,
          height: 6,
        },
      ],
      data: {
        id: pn.id,
        name: pn.data.name,
        needs_model: pn.data.needs_model,
        ai_role: pn.data.ai_role,
        isEntry: entryIds.has(pn.id),
        isExit: exitIds.has(pn.id),
        edges: spec.edges,
        diffStatus: (pn.data as { diffStatus?: "added" | "removed" | "edited" | "unchanged" })?.diffStatus,
        width: pn.width,
        height: pn.height,
      },
    }));
  }, [layout.nodes, entryIds, exitIds, spec.edges]);

  // Transform layout edges to React Flow Edge structure without flow labels
  const edges: Edge<BlockEdgeData>[] = useMemo(() => {
    return layout.edges.map((pe) => {
      const isRemoved = (pe.data as { diffStatus?: string })?.diffStatus === "removed";
      return {
        id: pe.id,
        source: pe.source,
        target: pe.target,
        type: "blockEdge",
        data: {
          pathD: pe.pathD,
        },
        zIndex: isRemoved ? 0 : 1,
        style: isRemoved
          ? {
              stroke: "#f43f5e",
              strokeDasharray: "6 6",
              opacity: 0.6,
            }
          : undefined,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: isRemoved ? "#f43f5e" : undefined,
        },
      };
    });
  }, [layout.edges]);

  return (
    <div
      role="region"
      aria-label="Block Diagram"
      className={cn(
        "relative h-full w-full overflow-hidden rounded-xl border border-line bg-flow-canvas-bg outline-none",
        className,
      )}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={true}
        zoomOnScroll={true}
        minZoom={0.2}
        maxZoom={1.5}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <FitViewWatcher trigger={fitViewTrigger} nodesKey={computedNodesKey} />
        <Background gap={25} size={1} color="var(--flow-pattern-dots)" />
        <Controls showInteractive={false} showFitView={false} />
      </ReactFlow>
    </div>
  );
}
