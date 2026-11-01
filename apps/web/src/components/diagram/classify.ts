import type { ArchitectureSpec, EdgeSpec, NodeSpec } from "@/lib/types";

export type BorderColor = "emerald" | "violet" | "amber" | "slate";
export type NodeBadge = "Entry" | "Exit" | "AI model" | "Agent";
export type NodeShape = "pill" | "diamond" | "hexagon" | "rectangle";

export interface ClassifiedNode {
  borderColor: BorderColor;
  badges: NodeBadge[];
  locked: boolean;
  shape: NodeShape;
}

/**
 * Pure structural classifier for a node's geometric shape.
 *
 * Rules (Stage B4b Priority):
 * 1. Node in entry_ids or exit_ids -> pill
 * 2. Diamond decision: 2+ outgoing edges where >=1 has condition -> diamond
 * 3. needs_model true (or ai_role model/agent) -> hexagon
 * 4. otherwise -> rectangle
 */
export function classifyNodeShape(
  node: Pick<NodeSpec, "id" | "needs_model"> & { ai_role?: "none" | "model" | "agent" },
  spec: Pick<ArchitectureSpec, "entry_ids" | "exit_ids"> & { edges?: EdgeSpec[] },
): NodeShape {
  const isEntry = spec.entry_ids.includes(node.id);
  const isExit = spec.exit_ids.includes(node.id);
  if (isEntry || isExit) {
    return "pill";
  }

  if (spec.edges) {
    const outgoing = spec.edges.filter((e) => e.from === node.id);
    const hasCondition = outgoing.some((e) => Boolean(e.condition && e.condition.trim()));
    if (outgoing.length >= 2 && hasCondition) {
      return "diamond";
    }
  }

  if (Boolean(node.needs_model) || node.ai_role === "model" || node.ai_role === "agent") {
    return "hexagon";
  }
  return "rectangle";
}

/**
 * Pure structural classifier for an architecture node.
 *
 * Rules (BUILD_PLAN.md:437, B4a & B4b):
 * - Shape: pill (entry/exit) > diamond (decision branch) > hexagon (AI) > rectangle (plain).
 * - Badges: Entry, Exit, AI model, Agent (a node can have several).
 * - Border colour by priority: entry emerald, exit violet, needs_model amber, otherwise slate.
 * - Locked boolean: true if node is named in any constraint (in node_id, a or b).
 * - Type text is shown as small grey text and NEVER changes any style.
 */
export function classifyNode(
  node: NodeSpec,
  spec: Pick<ArchitectureSpec, "entry_ids" | "exit_ids" | "constraints"> & { edges?: EdgeSpec[] },
): ClassifiedNode {
  const isEntry = spec.entry_ids.includes(node.id);
  const isExit = spec.exit_ids.includes(node.id);
  const needsModel = Boolean(node.needs_model) || node.ai_role === "model" || node.ai_role === "agent";
  const isAgent = node.ai_role === "agent";
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

  // Badges: Entry, Exit, AI model, Agent (several allowed)
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
  if (isAgent) {
    badges.push("Agent");
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

