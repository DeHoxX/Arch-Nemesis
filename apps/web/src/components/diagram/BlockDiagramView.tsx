"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  selectedEdgeId?: string | null;
  onSelectEdge?: (edgeId: string | null) => void;
  selectedLayerName?: string | null;
  onSelectLayer?: (layerName: string | null) => void;
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
  selectedNodeId: string | null,
  selectedLayerName: string | null,
  selectedEdgeId: string | null,
  onSelectNode: (nodeId: string) => void,
  onSelectLayer: (layerName: string) => void,
): Node<BlockNodeData | BlockLayerFrameData>[] {
  const nodeMap = new Map<string, (typeof spec.nodes)[number]>();
  for (const node of spec.nodes) {
    nodeMap.set(node.id, node);
  }

  // Pre-calculate connected nodes for the selected node (if any)
  const connectedNodeIds = new Set<string>();
  if (selectedNodeId) {
    connectedNodeIds.add(selectedNodeId);
    for (const edge of spec.edges) {
      if (edge.from === selectedNodeId) connectedNodeIds.add(edge.to);
      if (edge.to === selectedNodeId) connectedNodeIds.add(edge.from);
    }
  }

  // Pre-calculate endpoints for selected edge (if any)
  const edgeEndpointIds = new Set<string>();
  if (selectedEdgeId) {
    for (const edge of spec.edges) {
      const match =
        `e-${edge.from}-${edge.to}` === selectedEdgeId ||
        `${edge.from}->${edge.to}` === selectedEdgeId ||
        (edge as { id?: string }).id === selectedEdgeId;
      if (match) {
        edgeEndpointIds.add(edge.from);
        edgeEndpointIds.add(edge.to);
      }
    }
  }

  // 1. One dashed swimlane frame per column (covers header and all cards)
  // Ordered left-to-right to establish primary DOM tab order
  const frameNodes: Node<BlockLayerFrameData>[] = layout.columns.map((col) => {
    const isLayerSelected = selectedLayerName === col.name;
    const isLayerDimmed = selectedLayerName !== null && !isLayerSelected;
    return {
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
        selected: isLayerSelected,
        dimmed: isLayerDimmed,
        onSelectLayer,
      },
    };
  });

  // Set of node IDs in the selected layer (if any)
  const selectedLayerCol = selectedLayerName
    ? layout.columns.find((c) => c.name === selectedLayerName)
    : null;
  const layerNodeIds = new Set<string>(selectedLayerCol?.nodeIds || []);

  // 2. Compact node cards positioned inside their swimlane columns
  const cardNodes: Node<BlockNodeData>[] = layout.nodes.map((pn) => {
    const origNode = nodeMap.get(pn.id);
    const isSelected = pn.id === selectedNodeId;

    let isDimmed = false;
    if (selectedNodeId !== null) {
      isDimmed = !connectedNodeIds.has(pn.id);
    } else if (selectedEdgeId !== null) {
      isDimmed = !edgeEndpointIds.has(pn.id);
    } else if (selectedLayerName !== null) {
      isDimmed = !layerNodeIds.has(pn.id);
    }

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
        selected: isSelected,
        dimmed: isDimmed,
        onSelect: onSelectNode,
      },
    };
  });

  // Layer headers precede cards to ensure left-to-right column header tab order
  return [...frameNodes, ...cardNodes];
}

function buildFlowEdges(
  layout: BlockLayoutResult,
  spec: ArchitectureSpec | UnionArchitectureSpec,
  hoveredNodeId: string | null,
  selectedNodeId: string | null,
  selectedEdgeId: string | null,
  selectedLayerName: string | null,
  onSelectEdge: (edgeId: string) => void,
): Edge<BlockEdgeData>[] {
  const edgeMap = new Map<string, (typeof spec.edges)[number]>();
  for (const edge of spec.edges) {
    edgeMap.set(`${edge.from}->${edge.to}`, edge);
  }

  const selectedLayerCol = selectedLayerName
    ? layout.columns.find((c) => c.name === selectedLayerName)
    : null;
  const layerNodeIds = new Set<string>(selectedLayerCol?.nodeIds || []);

  const routing = computeBlockRoutes(spec, layout);

  return layout.edges.map((le) => {
    const origEdge = edgeMap.get(`${le.from}->${le.to}`);
    const isRemoved = (origEdge as { diffStatus?: string })?.diffStatus === "removed";
    const route = routing.routes.get(le.id);

    const isSelected =
      selectedEdgeId !== null &&
      (le.id === selectedEdgeId ||
        `e-${le.from}-${le.to}` === selectedEdgeId ||
        `${le.from}->${le.to}` === selectedEdgeId);

    let isHighlighted = false;
    let isDimmed = false;

    if (selectedEdgeId !== null) {
      isHighlighted = isSelected;
      isDimmed = !isSelected;
    } else if (selectedNodeId !== null) {
      const isIncident = le.from === selectedNodeId || le.to === selectedNodeId;
      isHighlighted = isIncident;
      isDimmed = !isIncident;
    } else if (selectedLayerName !== null) {
      const isLayerEdge = layerNodeIds.has(le.from) && layerNodeIds.has(le.to);
      isHighlighted = isLayerEdge;
      isDimmed = !isLayerEdge;
    } else if (hoveredNodeId !== null) {
      const isConnectedToHovered = le.from === hoveredNodeId || le.to === hoveredNodeId;
      isHighlighted = isConnectedToHovered;
      isDimmed = !isConnectedToHovered;
    }

    return {
      id: le.id,
      source: le.from,
      target: le.to,
      type: "blockEdge",
      data: {
        pathD: route?.pathD,
        isBackward: route ? route.isBackward : le.isBackward,
        isHighlighted,
        isSelected,
        isDimmed,
        diffStatus: (origEdge as { diffStatus?: "added" | "removed" | "edited" | "unchanged" })?.diffStatus,
        onSelect: onSelectEdge,
      },
      zIndex: isRemoved ? 1 : isHighlighted || isSelected ? 20 : 5,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: isRemoved
          ? "var(--block-edge-removed, #f43f5e)"
          : isHighlighted || isSelected
            ? "var(--block-edge-highlight, var(--brand-accent, #2dd4bf))"
            : "var(--edge-stroke)",
      },
    };
  });
}

/**
 * BlockDiagramView: High-level layered conceptual block diagram view.
 *
 * Implements Stage V3-4B, V3-4B2, V3-4D1 (D-396, D-397, D-399):
 * - Pure deterministic swimlane column layout calculation.
 * - Each column enclosed in a dashed swimlane frame (BlockLayerFrame).
 * - Interactive: supports selecting nodes, edges, and layer headers with keyboard and click.
 * - Dimming of unrelated elements when an element or layer is selected.
 * - Obstacle-avoiding edge routing (computeBlockRoutes): zero card intersections.
 * - Standard Controls, Background dots using CSS token var(--flow-pattern-dots), fitView padding 0.2.
 */
export function BlockDiagramView({
  spec,
  selectedNodeId: propSelectedNodeId,
  onSelectNode: propOnSelectNode,
  selectedEdgeId: propSelectedEdgeId,
  onSelectEdge: propOnSelectEdge,
  selectedLayerName: propSelectedLayerName,
  onSelectLayer: propOnSelectLayer,
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

  // Internal selection state if not controlled externally
  const [internalSelectedNodeId, setInternalSelectedNodeId] = useState<string | null>(null);
  const [internalSelectedEdgeId, setInternalSelectedEdgeId] = useState<string | null>(null);
  const [internalSelectedLayerName, setInternalSelectedLayerName] = useState<string | null>(null);

  const selectedNodeId = propSelectedNodeId !== undefined ? propSelectedNodeId : internalSelectedNodeId;
  const selectedEdgeId = propSelectedEdgeId !== undefined ? propSelectedEdgeId : internalSelectedEdgeId;
  const selectedLayerName = propSelectedLayerName !== undefined ? propSelectedLayerName : internalSelectedLayerName;

  const handleSelectNode = useCallback(
    (nodeId: string | null) => {
      if (propOnSelectNode) propOnSelectNode(nodeId);
      else setInternalSelectedNodeId(nodeId);
      if (nodeId !== null) {
        if (propOnSelectEdge) propOnSelectEdge(null);
        else setInternalSelectedEdgeId(null);
        if (propOnSelectLayer) propOnSelectLayer(null);
        else setInternalSelectedLayerName(null);
      }
    },
    [propOnSelectNode, propOnSelectEdge, propOnSelectLayer],
  );

  const handleSelectEdge = useCallback(
    (edgeId: string | null) => {
      if (propOnSelectEdge) propOnSelectEdge(edgeId);
      else setInternalSelectedEdgeId(edgeId);
      if (edgeId !== null) {
        if (propOnSelectNode) propOnSelectNode(null);
        else setInternalSelectedNodeId(null);
        if (propOnSelectLayer) propOnSelectLayer(null);
        else setInternalSelectedLayerName(null);
      }
    },
    [propOnSelectNode, propOnSelectEdge, propOnSelectLayer],
  );

  const handleSelectLayer = useCallback(
    (layerName: string | null) => {
      if (propOnSelectLayer) propOnSelectLayer(layerName);
      else setInternalSelectedLayerName(layerName);
      if (layerName !== null) {
        if (propOnSelectNode) propOnSelectNode(null);
        else setInternalSelectedNodeId(null);
        if (propOnSelectEdge) propOnSelectEdge(null);
        else setInternalSelectedEdgeId(null);
      }
    },
    [propOnSelectNode, propOnSelectEdge, propOnSelectLayer],
  );

  const clearSelection = useCallback(() => {
    if (propOnSelectNode) propOnSelectNode(null);
    else setInternalSelectedNodeId(null);
    if (propOnSelectEdge) propOnSelectEdge(null);
    else setInternalSelectedEdgeId(null);
    if (propOnSelectLayer) propOnSelectLayer(null);
    else setInternalSelectedLayerName(null);
  }, [propOnSelectNode, propOnSelectEdge, propOnSelectLayer]);

  // Keyboard accessibility: Escape clears block selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearSelection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection]);

  // Hover state for edge highlighting (when no element is selected)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const handleNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === "blockNode") {
      setHoveredNodeId(node.id);
    }
  }, []);

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === "blockNode") {
        handleSelectNode(node.id === selectedNodeId ? null : node.id);
      }
    },
    [handleSelectNode, selectedNodeId],
  );

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      handleSelectEdge(edge.id === selectedEdgeId ? null : edge.id);
    },
    [handleSelectEdge, selectedEdgeId],
  );

  // Combine swimlane column frames and node cards into React Flow node structure
  const nodes = useMemo(
    () =>
      buildFlowNodes(
        layout,
        spec,
        entryIds,
        exitIds,
        selectedNodeId,
        selectedLayerName,
        selectedEdgeId,
        (id) => handleSelectNode(id === selectedNodeId ? null : id),
        (name) => handleSelectLayer(name === selectedLayerName ? null : name),
      ),
    [
      layout,
      spec,
      entryIds,
      exitIds,
      selectedNodeId,
      selectedLayerName,
      selectedEdgeId,
      handleSelectNode,
      handleSelectLayer,
    ],
  );

  // Transform layout edges with custom obstacle-avoiding routing and hover/selection state
  const edges = useMemo(
    () =>
      buildFlowEdges(
        layout,
        spec,
        hoveredNodeId,
        selectedNodeId,
        selectedEdgeId,
        selectedLayerName,
        (id) => handleSelectEdge(id === selectedEdgeId ? null : id),
      ),
    [
      layout,
      spec,
      hoveredNodeId,
      selectedNodeId,
      selectedEdgeId,
      selectedLayerName,
      handleSelectEdge,
    ],
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
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={clearSelection}
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
