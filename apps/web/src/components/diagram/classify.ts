import type { ArchitectureSpec, NodeSpec } from "@/lib/types";

export type BorderColor = "emerald" | "violet" | "amber" | "slate";
export type NodeBadge = "Entry" | "Exit" | "AI model";
export type NodeShape = "pill" | "hexagon" | "rectangle";

export interface ClassifiedNode {
  borderColor: BorderColor;
  badges: NodeBadge[];
  locked: boolean;
  shape: NodeShape;
}

/**
 * Pure structural classifier for a node's geometric shape.
 *
 * Rules (Stage B4a Priority):
 * 1. Node in entry_ids or exit_ids -> pill
 * 2. needs_model true -> hexagon
 * 3. otherwise -> rectangle
 */
export function classifyNodeShape(
  node: Pick<NodeSpec, "id" | "needs_model">,
  spec: Pick<ArchitectureSpec, "entry_ids" | "exit_ids">,
): NodeShape {
  const isEntry = spec.entry_ids.includes(node.id);
  const isExit = spec.exit_ids.includes(node.id);
  if (isEntry || isExit) {
    return "pill";
  }
  if (Boolean(node.needs_model)) {
    return "hexagon";
  }
  return "rectangle";
}

/**
 * Pure structural classifier for an architecture node.
 *
 * Rules (BUILD_PLAN.md:437 & B4a):
 * - Shape: pill (entry/exit), hexagon (needs_model), rectangle (plain).
 * - Badges: Entry, Exit, AI model (a node can have several).
 * - Border colour by priority: entry emerald, exit violet, needs_model amber, otherwise slate.
 * - Locked boolean: true if node is named in any constraint (in node_id, a or b).
 * - Type text is shown as small grey text and NEVER changes any style.
 */
export function classifyNode(
  node: NodeSpec,
  spec: Pick<ArchitectureSpec, "entry_ids" | "exit_ids" | "constraints">,
): ClassifiedNode {
  const isEntry = spec.entry_ids.includes(node.id);
  const isExit = spec.exit_ids.includes(node.id);
  const needsModel = Boolean(node.needs_model);
  const shape = classifyNodeShape(node, spec);

  // Border colour by priority: entry emerald, exit violet, needs_model amber, otherwise slate
  let borderColor: BorderColor = "slate";
  if (isEntry) {
    borderColor = "emerald";
  } else if (isExit) {
    borderColor = "violet";
  } else if (needsModel) {
    borderColor = "amber";
  }

  // Badges: Entry, Exit, AI model (several allowed)
  const badges: NodeBadge[] = [];
  if (isEntry) {
    badges.push("Entry");
  }
  if (isExit) {
    badges.push("Exit");
  }
  if (needsModel) {
    badges.push("AI model");
  }

  // A small lock icon marks nodes named by any constraint (in node_id, a or b)
  const locked = spec.constraints.some(
    (c) => c.node_id === node.id || c.a === node.id || c.b === node.id,
  );

  return {
    borderColor,
    badges,
    locked,
    shape,
  };
}

