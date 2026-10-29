"use client";

import React, { useMemo } from "react";
import {
  Background,
  Controls,
  type Edge,
  type Node,
  Position,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { ArchitectureSpec } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DiagramEdge } from "./DiagramEdge";
import { DiagramNode, type DiagramNodeData } from "./DiagramNode";
import { NODE_HEIGHT, NODE_WIDTH, computeLayout } from "./layout";

export interface DiagramViewProps {
  spec: ArchitectureSpec;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  className?: string;
}

const nodeTypes = {
  customNode: DiagramNode,
};

const edgeTypes = {
  customEdge: DiagramEdge,
};

/**
 * DiagramView: read-only interactive architecture diagram powered by @xyflow/react.
 *
 * Requirements (BUILD_PLAN.md:436-439 & User Decisions):
 * - Read-only: nodesDraggable=false, nodesConnectable=false.
 * - Pan and zoom enabled; fitView padding 0.2.
 * - Standard React Flow Controls (zoom in/out, fit view).
 * - NO minimap element.
 * - Layout computed purely via computeLayout (dagre, rankdir LR).
 * - Fixed node card size (220x72) and explicit handle anchors passed to nodes.
 * - Node selection synchronized via onSelectNode.
 * - Escape key clears node selection.
 * - Plain React text everywhere (no dangerouslySetInnerHTML).
 */
export function DiagramView({
  spec,
  selectedNodeId,
  onSelectNode,
  className,
}: DiagramViewProps): React.ReactElement {
  // Pure Dagre layout calculation
  const layout = useMemo(() => computeLayout(spec), [spec]);

  // Transform layout nodes to React Flow Node structure with explicit dimensions & handle positions
  const nodes: Node<DiagramNodeData>[] = useMemo(() => {
    return layout.nodes.map((pn) => ({
      id: pn.id,
      type: "customNode",
      position: pn.position,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      initialWidth: NODE_WIDTH,
      initialHeight: NODE_HEIGHT,
      handles: [
        {
          id: null,
          type: "target",
          position: Position.Left,
          x: 0,
          y: NODE_HEIGHT / 2,
          width: 6,
          height: 6,
        },
        {
          id: null,
          type: "source",
          position: Position.Right,
          x: NODE_WIDTH,
          y: NODE_HEIGHT / 2,
          width: 6,
          height: 6,
        },
      ],
      selected: pn.id === selectedNodeId,
      data: {
        ...pn.data,
        entry_ids: spec.entry_ids,
        exit_ids: spec.exit_ids,
        constraints: spec.constraints,
        onSelect: onSelectNode ? () => onSelectNode(pn.id) : undefined,
      },
    }));
  }, [layout.nodes, spec.entry_ids, spec.exit_ids, spec.constraints, selectedNodeId, onSelectNode]);

  // Transform layout edges to React Flow Edge structure
  const edges: Edge[] = useMemo(() => {
    return layout.edges.map((pe) => ({
      id: pe.id,
      source: pe.source,
      target: pe.target,
      type: "customEdge",
      data: {
        flows: pe.data.flows,
      },
    }));
  }, [layout.edges]);

  // Keyboard navigation: Escape key clears selection
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onSelectNode?.(null);
    }
  };

  return (
    <div
      role="region"
      aria-label="Architecture Diagram"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative h-full w-full overflow-hidden rounded-xl border bg-card outline-none focus-visible:ring-1 focus-visible:ring-ring",
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
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        onNodeClick={(_, node) => onSelectNode?.(node.id)}
        onPaneClick={() => onSelectNode?.(null)}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
