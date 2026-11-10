"use client";

import React, { useCallback, useMemo, useState } from "react";
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
import { DiagramEdge, type DiagramEdgeData } from "./DiagramEdge";
import { DiagramLegend } from "./DiagramLegend";
import { DiagramNode, type DiagramNodeData } from "./DiagramNode";
import { FitViewWatcher } from "./FitViewWatcher";
import { computeFocusLineage, isEdgeInFocus } from "./focus";
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

  // Uncontrolled selection fallback when selectedNodeId prop is undefined (e.g. admin Architecture tab)
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const isControlled = selectedNodeId !== undefined;
  const effectiveSelectedId = isControlled ? selectedNodeId : internalSelectedId;

  const handleSelect = useCallback(
    (nodeId: string | null) => {
      if (!isControlled) {
        setInternalSelectedId(nodeId);
      }
      onSelectNode?.(nodeId);
    },
    [isControlled, onSelectNode],
  );

  // Upstream and downstream lineage focus computation
  const focusLineage = useMemo(
    () => computeFocusLineage(spec, effectiveSelectedId),
    [spec, effectiveSelectedId],
  );

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
      selected: pn.id === effectiveSelectedId,
      data: {
        ...pn.data,
        diffStatus: (pn.data as { diffStatus?: "added" | "removed" | "edited" | "unchanged" })?.diffStatus,
        width: pn.width,
        height: pn.height,
        entry_ids: spec.entry_ids,
        exit_ids: spec.exit_ids,
        constraints: spec.constraints,
        edges: spec.edges,
        dimmed: focusLineage.isActive && !focusLineage.focusedNodeIds.has(pn.id),
        onSelect: () => handleSelect(pn.id),
      },
    }));
  }, [
    layout.nodes,
    spec.entry_ids,
    spec.exit_ids,
    spec.constraints,
    spec.edges,
    effectiveSelectedId,
    focusLineage,
    handleSelect,
  ]);

  // Transform layout edges to React Flow Edge structure
  const edges: Edge<DiagramEdgeData>[] = useMemo(() => {
    const nodeNameMap = new Map<string, string>(spec.nodes.map((n) => [n.id, n.name]));
    return layout.edges.map((pe) => {
      const isRemoved = (pe.data as { diffStatus?: string })?.diffStatus === "removed";
      const srcName = nodeNameMap.get(pe.source) ?? pe.source;
      const tgtName = nodeNameMap.get(pe.target) ?? pe.target;
      const flows = pe.data.flows || "";
      const condition = (pe.data.condition || "").trim();
      const hasCondition = condition.length > 0;

      const ariaLabel = flows
        ? hasCondition
          ? `Flow from ${srcName} to ${tgtName}: ${flows}, condition: ${condition}`
          : `Flow from ${srcName} to ${tgtName}: ${flows}`
        : hasCondition
          ? `Flow from ${srcName} to ${tgtName}, condition: ${condition}`
          : `Flow from ${srcName} to ${tgtName}`;

      const dimmed = focusLineage.isActive && !isEdgeInFocus(focusLineage, pe.source, pe.target);

      return {
        id: pe.id,
        source: pe.source,
        target: pe.target,
        type: "customEdge",
        ariaLabel,
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
          dimmed,
        },
      };
    });
  }, [layout.edges, spec.nodes, focusLineage]);

  // Keyboard navigation: Escape key clears selection
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      handleSelect(null);
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
      <DiagramLegend />
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
        onNodeClick={(_, node) => handleSelect(node.id)}
        onPaneClick={() => handleSelect(null)}
      >
        <FitViewWatcher trigger={fitViewTrigger} nodesKey={computedNodesKey} />
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
