import { describe, expect, it } from "vitest";
import type { ConstraintSpec, NodeSpec } from "@/lib/types";
import { classifyNode, classifyNodeShape } from "./classify";

function createMockNode(overrides: Partial<NodeSpec> = {}): NodeSpec {
  return {
    id: "test_node",
    name: "Test Node",
    type: "service",
    role: "Performs processing tasks",
    inputs: [],
    outputs: [],
    tech_options: [],
    needs_model: false,
    ...overrides,
  };
}

describe("classifyNode structural classifier", () => {
  describe("all 8 permutations of entry, exit, and needs_model", () => {
    // 1. None: Internal plain node
    it("classifies plain node (!entry, !exit, !model) as slate with no badges", () => {
      const node = createMockNode({ needs_model: false });
      const spec = { entry_ids: [], exit_ids: [], constraints: [] };
      const res = classifyNode(node, spec);
      expect(res.borderColor).toBe("slate");
      expect(res.badges).toEqual([]);
    });

    // 2. Entry only
    it("classifies entry node (entry, !exit, !model) as emerald with Entry badge", () => {
      const node = createMockNode({ id: "entry_node", needs_model: false });
      const spec = { entry_ids: ["entry_node"], exit_ids: [], constraints: [] };
      const res = classifyNode(node, spec);
      expect(res.borderColor).toBe("emerald");
      expect(res.badges).toEqual(["Entry"]);
    });

    // 3. Exit only
    it("classifies exit node (!entry, exit, !model) as violet with Exit badge", () => {
      const node = createMockNode({ id: "exit_node", needs_model: false });
      const spec = { entry_ids: [], exit_ids: ["exit_node"], constraints: [] };
      const res = classifyNode(node, spec);
      expect(res.borderColor).toBe("violet");
      expect(res.badges).toEqual(["Exit"]);
    });

    // 4. Model only
    it("classifies AI node (!entry, !exit, model) as amber with AI model badge", () => {
      const node = createMockNode({ needs_model: true });
      const spec = { entry_ids: [], exit_ids: [], constraints: [] };
      const res = classifyNode(node, spec);
      expect(res.borderColor).toBe("amber");
      expect(res.badges).toEqual(["AI model"]);
    });

    // 5. Entry + Exit
    it("classifies single-node pipeline (entry, exit, !model) with emerald priority and both badges", () => {
      const node = createMockNode({ id: "dual_node", needs_model: false });
      const spec = {
        entry_ids: ["dual_node"],
        exit_ids: ["dual_node"],
        constraints: [],
      };
      const res = classifyNode(node, spec);
      expect(res.borderColor).toBe("emerald"); // Entry takes priority over exit
      expect(res.badges).toEqual(["Entry", "Exit"]);
    });

    // 6. Entry + Model
    it("classifies entry AI node (entry, !exit, model) with emerald priority and both badges", () => {
      const node = createMockNode({ id: "ai_entry", needs_model: true });
      const spec = { entry_ids: ["ai_entry"], exit_ids: [], constraints: [] };
      const res = classifyNode(node, spec);
      expect(res.borderColor).toBe("emerald"); // Entry takes priority over model
      expect(res.badges).toEqual(["Entry", "AI model"]);
    });

    // 7. Exit + Model
    it("classifies exit AI node (!entry, exit, model) with violet priority and both badges", () => {
      const node = createMockNode({ id: "ai_exit", needs_model: true });
      const spec = { entry_ids: [], exit_ids: ["ai_exit"], constraints: [] };
      const res = classifyNode(node, spec);
      expect(res.borderColor).toBe("violet"); // Exit takes priority over model
      expect(res.badges).toEqual(["Exit", "AI model"]);
    });

    // 8. Entry + Exit + Model
    it("classifies all-flags node (entry, exit, model) with emerald priority and all 3 badges", () => {
      const node = createMockNode({ id: "all_node", needs_model: true });
      const spec = {
        entry_ids: ["all_node"],
        exit_ids: ["all_node"],
        constraints: [],
      };
      const res = classifyNode(node, spec);
      expect(res.borderColor).toBe("emerald");
      expect(res.badges).toEqual(["Entry", "Exit", "AI model"]);
    });
  });

  describe("constraint lock detection", () => {
    it("marks node locked when referenced in constraint.node_id", () => {
      const node = createMockNode({ id: "protected_node" });
      const constraints: ConstraintSpec[] = [
        {
          id: "c1",
          text: "Must exist",
          kind: "must_exist",
          node_id: "protected_node",
          a: null,
          b: null,
          covers: [],
        },
      ];
      const res = classifyNode(node, {
        entry_ids: [],
        exit_ids: [],
        constraints,
      });
      expect(res.locked).toBe(true);
    });

    it("marks node locked when referenced in constraint.a", () => {
      const node = createMockNode({ id: "node_alpha" });
      const constraints: ConstraintSpec[] = [
        {
          id: "c2",
          text: "Must precede",
          kind: "must_precede",
          node_id: null,
          a: "node_alpha",
          b: "node_beta",
          covers: [],
        },
      ];
      const res = classifyNode(node, {
        entry_ids: [],
        exit_ids: [],
        constraints,
      });
      expect(res.locked).toBe(true);
    });

    it("marks node locked when referenced in constraint.b", () => {
      const node = createMockNode({ id: "node_beta" });
      const constraints: ConstraintSpec[] = [
        {
          id: "c2",
          text: "Must precede",
          kind: "must_precede",
          node_id: null,
          a: "node_alpha",
          b: "node_beta",
          covers: [],
        },
      ];
      const res = classifyNode(node, {
        entry_ids: [],
        exit_ids: [],
        constraints,
      });
      expect(res.locked).toBe(true);
    });

    it("leaves node unlocked when not referenced in any constraint", () => {
      const node = createMockNode({ id: "free_node" });
      const constraints: ConstraintSpec[] = [
        {
          id: "c3",
          text: "Unrelated",
          kind: "must_exist",
          node_id: "other_node",
          a: null,
          b: null,
          covers: [],
        },
      ];
      const res = classifyNode(node, {
        entry_ids: [],
        exit_ids: [],
        constraints,
      });
      expect(res.locked).toBe(false);
    });
  });

  describe("type text independence", () => {
    it("never alters border, badges, or lock status based on free-text type string", () => {
      const baseNode = createMockNode({ id: "shared_id", needs_model: false });
      const spec = { entry_ids: [], exit_ids: [], constraints: [] };

      const res1 = classifyNode({ ...baseNode, type: "database" }, spec);
      const res2 = classifyNode({ ...baseNode, type: "external_saas_api" }, spec);
      const res3 = classifyNode({ ...baseNode, type: "queue_worker_process" }, spec);

      expect(res1).toEqual(res2);
      expect(res2).toEqual(res3);
      expect(res1.borderColor).toBe("slate");
    });
  });

  describe("classifyNodeShape pure function", () => {
    it("returns pill for entry node regardless of needs_model", () => {
      const shape1 = classifyNodeShape({ id: "n1", needs_model: false }, { entry_ids: ["n1"], exit_ids: [] });
      const shape2 = classifyNodeShape({ id: "n1", needs_model: true }, { entry_ids: ["n1"], exit_ids: [] });
      expect(shape1).toBe("pill");
      expect(shape2).toBe("pill");
    });

    it("returns pill for exit node regardless of needs_model", () => {
      const shape1 = classifyNodeShape({ id: "n2", needs_model: false }, { entry_ids: [], exit_ids: ["n2"] });
      const shape2 = classifyNodeShape({ id: "n2", needs_model: true }, { entry_ids: [], exit_ids: ["n2"] });
      expect(shape1).toBe("pill");
      expect(shape2).toBe("pill");
    });

    it("returns hexagon for internal needs_model node", () => {
      const shape = classifyNodeShape({ id: "n3", needs_model: true }, { entry_ids: [], exit_ids: [] });
      expect(shape).toBe("hexagon");
    });

    it("returns rectangle for internal plain code node", () => {
      const shape = classifyNodeShape({ id: "n4", needs_model: false }, { entry_ids: [], exit_ids: [] });
      expect(shape).toBe("rectangle");
    });
  });
});

