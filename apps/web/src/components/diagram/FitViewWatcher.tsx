"use client";

import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";

export interface FitViewWatcherProps {
  trigger?: unknown;
  nodesKey?: string;
}

/**
 * FitViewWatcher: Re-fits diagram viewport when trigger changes or nodes update.
 *
 * Requirements (Phase 7C3c, D-234, D-235):
 * - Rendered as a child of <ReactFlow> in DiagramView and BlockDiagramView.
 * - Skips the very first mount (existing ReactFlow fitView prop handles initial layout fit).
 * - Invokes useReactFlow().fitView({ padding: 0.2 }) via requestAnimationFrame when trigger or nodesKey changes.
 * - Deferral via requestAnimationFrame ensures React Flow has processed node removals/additions
 *   and updated internal bounding boxes before measuring viewport.
 * - Respects prefers-reduced-motion by omitting animation duration (instant fit).
 */
export function FitViewWatcher({ trigger, nodesKey }: FitViewWatcherProps): null {
  const { fitView } = useReactFlow();
  const isFirstMountRef = useRef(true);
  const prevTriggerRef = useRef(trigger);
  const prevNodesKeyRef = useRef(nodesKey);

  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      prevTriggerRef.current = trigger;
      prevNodesKeyRef.current = nodesKey;
      return;
    }

    const triggerChanged = prevTriggerRef.current !== trigger;
    const nodesChanged = nodesKey !== undefined && prevNodesKeyRef.current !== nodesKey;

    prevTriggerRef.current = trigger;
    if (nodesKey !== undefined) {
      prevNodesKeyRef.current = nodesKey;
    }

    if (triggerChanged || nodesChanged) {
      let innerRafId: number | null = null;
      const outerRafId = requestAnimationFrame(() => {
        innerRafId = requestAnimationFrame(() => {
          fitView({ padding: 0.2 });
        });
      });
      return () => {
        cancelAnimationFrame(outerRafId);
        if (innerRafId !== null) {
          cancelAnimationFrame(innerRafId);
        }
      };
    }
  }, [trigger, nodesKey, fitView]);

  return null;
}
