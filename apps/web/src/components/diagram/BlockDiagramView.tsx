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
import { BlockLayerHeader, type BlockLayerHeaderData } from "./BlockLayerHeader";
import {
  type BlockLayoutResult,
  COLUMN_HEADER_HEIGHT,
  computeBlockLayout,
} from "./blockLayout";
import { BlockNode, type BlockNodeData } from "./BlockNode";
import { FitViewWatcher } from "./FitViewWatcher";

export interface BlockDiagramViewProps {
  spec: ArchitectureSpec | UnionArchitectureSpec;
  fitViewTrigger?: unknown;
  nodesKey?: string;
  className?: string;
}

const nodeTypes = {
  blockNode: BlockNode,
  blockLayerHeader: BlockLayerHeader,
};

const edgeTypes = {
  blockEdge: BlockEdge,
};

function buildFlowNodes(
  layout: BlockLayoutResult,
  spec: ArchitectureSpec | UnionArchitectureSpec,
  entryIds: Set<string>,
  exitIds: Set<string>,
): Node<BlockNodeData | BlockLayerHeaderData>[] {
  const nodeMap = new Map<string, (typeof spec.nodes)[number]>();
  for (const node of spec.nodes) {
    nodeMap.set(node.id, node);
  }

  const headerNodes: Node<BlockLayerHeaderData>[] = layout.columns.map((col) => ({
    id: `layer-${col.id}`,
    type: "blockLayerHeader",
    position: { x: col.x, y: col.y },
    width: col.width,
    height: COLUMN_HEADER_HEIGHT,
    initialWidth: col.width,
    initialHeight: COLUMN_HEADER_HEIGHT,
    selectable: false,
    draggable: false,
    focusable: false,
    zIndex: 0,
    data: {
      id: col.id,
      name: col.name,
      count: col.nodeIds.length,
    },
  }));

  const cardNodes: Node<BlockNodeData>[] = layout.nodes.map((pn) => {
    const origNode = nodeMap.get(pn.id);
    return {
      id: pn.id,
      type: "blockNode",
      position: { x: pn.x, y: pn.y },
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
        name: pn.name,
        role: origNode?.role,
        layer: pn.layer,
        needs_model: origNode?.needs_model,
        ai_role: origNode?.ai_role,
        isEntry: entryIds.has(pn.id),
        isExit: exitIds.has(pn.id),
        diffStatus: (origNode as { diffStatus?: "added" | "removed" | "edited" | "unchanged" })?.diffStatus,
        width: pn.width,
        height: pn.height,
      },
    };
  });

  return [...headerNodes, ...cardNodes];
}

function buildFlowEdges(
  layout: BlockLayoutResult,
  spec: ArchitectureSpec | UnionArchitectureSpec,
): Edge<BlockEdgeData>[] {
  const edgeMap = new Map<string, (typeof spec.edges)[number]>();
  for (const edge of spec.edges) {
    edgeMap.set(`${edge.from}->${edge.to}`, edge);
  }

  return layout.edges.map((le) => {
    const origEdge = edgeMap.get(`${le.from}->${le.to}`);
    const isRemoved = (origEdge as { diffStatus?: string })?.diffStatus === "removed";
    return {
      id: le.id,
      source: le.from,
      target: le.to,
      type: "blockEdge",
      data: {
        isBackward: le.isBackward,
        diffStatus: (origEdge as { diffStatus?: "added" | "removed" | "edited" | "unchanged" })?.diffStatus,
      },
      zIndex: isRemoved ? 0 : 1,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: isRemoved ? "#f43f5e" : "var(--edge-stroke)",
      },
    };
  });
}

/**
 * BlockDiagramView: High-level layered conceptual block diagram view.
 *
 * Implements Stage V3-4B (D-396):
 * - Replaces dagre graph with pure deterministic computeBlockLayout.
 * - Swimlane column headers rendered as non-interactive BlockLayerHeader nodes at y=0.
 * - Compact 240x92px rectangular node cards arranged inside swimlane columns.
 * - Smooth-step edges with backward edges automatically dashed.
 * - Supports legacy/unlayered designs through DAG depth fallback ("Stage 1", "Stage 2"...).
 * - Read-only: nodesDraggable={false}, nodesConnectable={false}, elementsSelectable={false}.
 * - Standard Controls, Background dots using CSS token var(--flow-pattern-dots), fitView padding 0.2.
 */
export function BlockDiagramView({
  spec,
  fitViewTrigger,
  nodesKey,
  className,
}: BlockDiagramViewProps): React.ReactElement {
  // Pure deterministic swimlane column layout calculation
  const layout = useMemo(() => computeBlockLayout(spec), [spec]);

  const computedNodesKey = useMemo(
    () => nodesKey ?? spec.nodes.map((n) => n.id).sort().join(","),
    [nodesKey, spec.nodes],
  );

  const entryIds = useMemo(() => new Set(spec.entry_ids || []), [spec.entry_ids]);
  const exitIds = useMemo(() => new Set(spec.exit_ids || []), [spec.exit_ids]);

  // Combine swimlane column headers and node cards into React Flow node structure
  const nodes = useMemo(
    () => buildFlowNodes(layout, spec, entryIds, exitIds),
    [layout, spec, entryIds, exitIds],
  );

  // Transform layout edges to React Flow Edge structure without flow labels
  const edges = useMemo(
    () => buildFlowEdges(layout, spec),
    [layout, spec],
  );

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
