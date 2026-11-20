"use client";

import React, { useCallback, useMemo, useState } from "react";
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
import { BlockLayerFrame, type BlockLayerFrameData } from "./BlockLayerFrame";
import { BlockLayerHeader } from "./BlockLayerHeader";
import {
  type BlockLayoutResult,
  computeBlockLayout,
} from "./blockLayout";
import { BlockNode, type BlockNodeData } from "./BlockNode";
import { computeBlockRoutes } from "./blockRouting";
import { FitViewWatcher } from "./FitViewWatcher";

export interface BlockDiagramViewProps {
  spec: ArchitectureSpec | UnionArchitectureSpec;
  fitViewTrigger?: unknown;
  nodesKey?: string;
  className?: string;
}

const nodeTypes = {
  blockNode: BlockNode,
  blockLayerFrame: BlockLayerFrame,
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
): Node<BlockNodeData | BlockLayerFrameData>[] {
  const nodeMap = new Map<string, (typeof spec.nodes)[number]>();
  for (const node of spec.nodes) {
    nodeMap.set(node.id, node);
  }

  // 1. One dashed swimlane frame per column (covers header and all cards)
  const frameNodes: Node<BlockLayerFrameData>[] = layout.columns.map((col) => ({
    id: `frame-${col.id}`,
    type: "blockLayerFrame",
    position: { x: col.x, y: col.y },
    width: col.width,
    height: col.height,
    initialWidth: col.width,
    initialHeight: col.height,
    selectable: false,
    draggable: false,
    focusable: false,
    zIndex: -1,
    data: {
      id: col.id,
      name: col.name,
      count: col.nodeIds.length,
      width: col.width,
      height: col.height,
    },
  }));

  // 2. Compact node cards positioned inside their swimlane columns
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
      zIndex: 10,
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

  return [...frameNodes, ...cardNodes];
}

function buildFlowEdges(
  layout: BlockLayoutResult,
  spec: ArchitectureSpec | UnionArchitectureSpec,
  hoveredNodeId: string | null,
): Edge<BlockEdgeData>[] {
  const edgeMap = new Map<string, (typeof spec.edges)[number]>();
  for (const edge of spec.edges) {
    edgeMap.set(`${edge.from}->${edge.to}`, edge);
  }

  const routing = computeBlockRoutes(spec, layout);

  return layout.edges.map((le) => {
    const origEdge = edgeMap.get(`${le.from}->${le.to}`);
    const isRemoved = (origEdge as { diffStatus?: string })?.diffStatus === "removed";
    const route = routing.routes.get(le.id);

    const isConnectedToHovered =
      hoveredNodeId !== null && (le.from === hoveredNodeId || le.to === hoveredNodeId);
    const isHighlighted = isConnectedToHovered;
    const isDimmed = hoveredNodeId !== null && !isConnectedToHovered;

    return {
      id: le.id,
      source: le.from,
      target: le.to,
      type: "blockEdge",
      data: {
        pathD: route?.pathD,
        isBackward: route ? route.isBackward : le.isBackward,
        isHighlighted,
        isDimmed,
        diffStatus: (origEdge as { diffStatus?: "added" | "removed" | "edited" | "unchanged" })?.diffStatus,
      },
      zIndex: isRemoved ? 1 : isHighlighted ? 20 : 5,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: isRemoved ? "#f43f5e" : isHighlighted ? "var(--brand-accent, #2dd4bf)" : "var(--edge-stroke)",
      },
    };
  });
}

/**
 * BlockDiagramView: High-level layered conceptual block diagram view.
 *
 * Implements Stage V3-4B & V3-4B2 (D-396, D-397):
 * - Replaces dagre graph with pure deterministic computeBlockLayout.
 * - Each column is enclosed in a dashed swimlane frame (BlockLayerFrame).
 * - Obstacle-avoiding edge routing (computeBlockRoutes): zero card intersections.
 * - Adjacent edges route in inter-column gutters; skip/backward edges in bottom channel.
 * - Card hover interaction: hovering a card brightens its edges and dims others.
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

  // Hover state for edge highlighting (read-only, no selection change)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const handleNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === "blockNode") {
      setHoveredNodeId(node.id);
    }
  }, []);

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  // Combine swimlane column frames and node cards into React Flow node structure
  const nodes = useMemo(
    () => buildFlowNodes(layout, spec, entryIds, exitIds),
    [layout, spec, entryIds, exitIds],
  );

  // Transform layout edges with custom obstacle-avoiding routing and hover state
  const edges = useMemo(
    () => buildFlowEdges(layout, spec, hoveredNodeId),
    [layout, spec, hoveredNodeId],
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
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
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
