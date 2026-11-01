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

import type { ArchitectureSpec } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BlockNode, type BlockNodeData } from "./BlockNode";
import { computeLayout } from "./layout";

export interface BlockDiagramViewProps {
  spec: ArchitectureSpec;
  className?: string;
}

const nodeTypes = {
  blockNode: BlockNode,
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
  className,
}: BlockDiagramViewProps): React.ReactElement {
  // Pure Dagre top-to-bottom layout calculation
  const layout = useMemo(() => computeLayout(spec), [spec]);

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
          position: Position.Top,
          x: pn.width / 2,
          y: 0,
          width: 6,
          height: 6,
        },
        {
          id: null,
          type: "source",
          position: Position.Bottom,
          x: pn.width / 2,
          y: pn.height,
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
        width: pn.width,
        height: pn.height,
      },
    }));
  }, [layout.nodes, entryIds, exitIds, spec.edges]);

  // Transform layout edges to React Flow Edge structure without flow labels
  const edges: Edge[] = useMemo(() => {
    return layout.edges.map((pe) => ({
      id: pe.id,
      source: pe.source,
      target: pe.target,
      type: "default",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
      },
    }));
  }, [layout.edges]);

  return (
    <div
      role="region"
      aria-label="Block Diagram"
      className={cn(
        "relative h-full w-full overflow-hidden rounded-xl border bg-card outline-none",
        className,
      )}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={true}
        zoomOnScroll={true}
        minZoom={0.3}
        maxZoom={1.5}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
