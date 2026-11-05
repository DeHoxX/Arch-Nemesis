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

import type { ArchitectureSpec, UnionArchitectureSpec } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DiagramEdge } from "./DiagramEdge";
import { DiagramNode, type DiagramNodeData } from "./DiagramNode";
import { FitViewWatcher } from "./FitViewWatcher";
import { computeLayout } from "./layout";

export interface DiagramViewProps {
  spec: ArchitectureSpec | UnionArchitectureSpec;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  fitViewTrigger?: unknown;
  nodesKey?: string;
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
 * Requirements (Stage B4e1):
 * - Read-only: nodesDraggable=false, nodesConnectable=false.
 * - Top-to-bottom layout with custom node heights and width 240px.
 * - Handles: Top (target) and Bottom (source).
 * - ReactFlow minZoom 0.3, maxZoom 1.5, fitView padding 0.2.
 * - Standard React Flow Controls (zoom in/out, fit view); NO minimap.
 * - Node selection synchronized via onSelectNode.
 * - Escape key clears node selection.
 * - Plain React text everywhere (no dangerouslySetInnerHTML).
 */
export function DiagramView({
  spec,
  selectedNodeId,
  onSelectNode,
  fitViewTrigger,
  nodesKey,
  className,
}: DiagramViewProps): React.ReactElement {
  // Pure Dagre top-to-bottom layout calculation
  const layout = useMemo(() => computeLayout(spec), [spec]);

  const computedNodesKey = useMemo(
    () => nodesKey ?? spec.nodes.map((n) => n.id).sort().join(","),
    [nodesKey, spec.nodes],
  );

  // Transform layout nodes to React Flow Node structure with explicit dimensions & handle positions
  const nodes: Node<DiagramNodeData>[] = useMemo(() => {
    return layout.nodes.map((pn) => ({
      id: pn.id,
      type: "customNode",
      position: pn.position,
      width: pn.width,
      height: pn.height,
      initialWidth: pn.width,
      initialHeight: pn.height,
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
      selected: pn.id === selectedNodeId,
      data: {
        ...pn.data,
        diffStatus: (pn.data as { diffStatus?: "added" | "removed" | "edited" | "unchanged" })?.diffStatus,
        width: pn.width,
        height: pn.height,
        entry_ids: spec.entry_ids,
        exit_ids: spec.exit_ids,
        constraints: spec.constraints,
        edges: spec.edges,
        onSelect: onSelectNode ? () => onSelectNode(pn.id) : undefined,
      },
    }));
  }, [layout.nodes, spec.entry_ids, spec.exit_ids, spec.constraints, spec.edges, selectedNodeId, onSelectNode]);

  // Transform layout edges to React Flow Edge structure
  const edges: Edge[] = useMemo(() => {
    return layout.edges.map((pe) => {
      const isRemoved = (pe.data as { diffStatus?: string })?.diffStatus === "removed";
      return {
        id: pe.id,
        source: pe.source,
        target: pe.target,
        type: "customEdge",
        zIndex: isRemoved ? 0 : 1,
        data: {
          flows: pe.data.flows,
          condition: pe.data.condition,
          pathD: pe.pathD,
          labelX: pe.labelX,
          labelY: pe.labelY,
          labelWidth: pe.labelWidth,
          labelHeight: pe.labelHeight,
          diffStatus: (pe.data as { diffStatus?: "added" | "removed" | "edited" | "unchanged" })?.diffStatus,
        },
      };
    });
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
        minZoom={0.3}
        maxZoom={1.5}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        onNodeClick={(_, node) => onSelectNode?.(node.id)}
        onPaneClick={() => onSelectNode?.(null)}
      >
        <FitViewWatcher trigger={fitViewTrigger} nodesKey={computedNodesKey} />
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
