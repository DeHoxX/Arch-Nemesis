import { describe, expect, it } from "vitest";
import type { ArchitectureSpec } from "@/lib/types";
import { buildFlowPlaybackSteps } from "./playback";

describe("playback.ts - buildFlowPlaybackSteps (Stage 1C, D-328)", () => {
  it("generates steps for a linear chain in exact topological order with matching layout edge IDs", () => {
    const spec: ArchitectureSpec = {
      nodes: [
        {
          id: "node_a",
          name: "Ingest Service",
          type: "gateway",
          role: "Ingests raw telemetry",
          inputs: [],
          outputs: ["raw_stream"],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "node_b",
          name: "Processing Worker",
          type: "worker",
          role: "Transforms stream",
          inputs: ["raw_stream"],
          outputs: ["clean_stream"],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "node_c",
          name: "Sink Store",
          type: "database",
          role: "Stores metrics",
          inputs: ["clean_stream"],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
      ],
      edges: [
        { from: "node_a", to: "node_b", flows: "raw telemetry" },
        { from: "node_b", to: "node_c", flows: "filtered metrics" },
      ],
      constraints: [],
      entry_ids: ["node_a"],
      exit_ids: ["node_c"],
    };

    const steps = buildFlowPlaybackSteps(spec, ["node_a", "node_b", "node_c"]);
    expect(steps.length).toBe(2);

    expect(steps[0]!.stepNumber).toBe(1);
    expect(steps[0]!.edgeId).toBe("e-node_a-node_b-0");
    expect(steps[0]!.from).toBe("node_a");
    expect(steps[0]!.to).toBe("node_b");
    expect(steps[0]!.fromName).toBe("Ingest Service");
    expect(steps[0]!.toName).toBe("Processing Worker");
    expect(steps[0]!.flows).toBe("raw telemetry");
    expect(steps[0]!.condition).toBeNull();
    expect(steps[0]!.description).toBe(
      "Ingest Service → Processing Worker: raw telemetry",
    );

    expect(steps[1]!.stepNumber).toBe(2);
    expect(steps[1]!.edgeId).toBe("e-node_b-node_c-1");
    expect(steps[1]!.from).toBe("node_b");
    expect(steps[1]!.to).toBe("node_c");
    expect(steps[1]!.fromName).toBe("Processing Worker");
    expect(steps[1]!.toName).toBe("Sink Store");
    expect(steps[1]!.flows).toBe("filtered metrics");
    expect(steps[1]!.description).toBe(
      "Processing Worker → Sink Store: filtered metrics",
    );
  });

  it("interleaves diamond branch edges deterministically according to sender and receiver rank", () => {
    const spec: ArchitectureSpec = {
      nodes: [
        {
          id: "entry_node",
          name: "Entry Service",
          type: "service",
          role: "Entry",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "branch_b",
          name: "Branch B",
          type: "service",
          role: "Worker",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "branch_c",
          name: "Branch C",
          type: "service",
          role: "Worker",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "exit_node",
          name: "Exit Service",
          type: "service",
          role: "Sink",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
      ],
      edges: [
        { from: "entry_node", to: "branch_b", flows: "flow_to_b" },
        { from: "branch_b", to: "exit_node", flows: "flow_b_to_exit" },
        { from: "entry_node", to: "branch_c", flows: "flow_to_c" },
        { from: "branch_c", to: "exit_node", flows: "flow_c_to_exit" },
      ],
      constraints: [],
      entry_ids: ["entry_node"],
      exit_ids: ["exit_node"],
    };

    const flowOrder = ["entry_node", "branch_b", "branch_c", "exit_node"];
    const steps = buildFlowPlaybackSteps(spec, flowOrder);

    expect(steps.length).toBe(4);
    // In layout.ts sortedEdges:
    // 0: branch_b -> exit_node (e-branch_b-exit_node-0)
    // 1: branch_c -> exit_node (e-branch_c-exit_node-1)
    // 2: entry_node -> branch_b (e-entry_node-branch_b-2)
    // 3: entry_node -> branch_c (e-entry_node-branch_c-3)
    //
    // In playback sort:
    // Step 1: from entry_node (rank 0) to branch_b (rank 1) -> e-entry_node-branch_b-2
    // Step 2: from entry_node (rank 0) to branch_c (rank 2) -> e-entry_node-branch_c-3
    // Step 3: from branch_b (rank 1) to exit_node (rank 3) -> e-branch_b-exit_node-0
    // Step 4: from branch_c (rank 2) to exit_node (rank 3) -> e-branch_c-exit_node-1
    expect(steps[0]!.stepNumber).toBe(1);
    expect(steps[0]!.edgeId).toBe("e-entry_node-branch_b-2");

    expect(steps[1]!.stepNumber).toBe(2);
    expect(steps[1]!.edgeId).toBe("e-entry_node-branch_c-3");

    expect(steps[2]!.stepNumber).toBe(3);
    expect(steps[2]!.edgeId).toBe("e-branch_b-exit_node-0");

    expect(steps[3]!.stepNumber).toBe(4);
    expect(steps[3]!.edgeId).toBe("e-branch_c-exit_node-1");
  });

  it("handles multi-rank bypass edges correctly", () => {
    const spec: ArchitectureSpec = {
      nodes: [
        {
          id: "a",
          name: "Node A",
          type: "service",
          role: "A",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "b",
          name: "Node B",
          type: "service",
          role: "B",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "c",
          name: "Node C",
          type: "service",
          role: "C",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
      ],
      edges: [
        { from: "a", to: "b", flows: "step_ab" },
        { from: "a", to: "c", flows: "bypass_ac" },
        { from: "b", to: "c", flows: "step_bc" },
      ],
      constraints: [],
      entry_ids: ["a"],
      exit_ids: ["c"],
    };

    const steps = buildFlowPlaybackSteps(spec, ["a", "b", "c"]);
    expect(steps.length).toBe(3);

    // a -> b (rank 0 to 1), a -> c (rank 0 to 2), b -> c (rank 1 to 2)
    expect(steps[0]!.from).toBe("a");
    expect(steps[0]!.to).toBe("b");

    expect(steps[1]!.from).toBe("a");
    expect(steps[1]!.to).toBe("c");

    expect(steps[2]!.from).toBe("b");
    expect(steps[2]!.to).toBe("c");
  });

  it("falls back to deterministic Kahn topological sort when flowOrder is missing, null, or empty", () => {
    const spec: ArchitectureSpec = {
      nodes: [
        {
          id: "service_z",
          name: "Service Z",
          type: "sink",
          role: "Sink",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "service_a",
          name: "Service A",
          type: "entry",
          role: "Entry",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
      ],
      edges: [{ from: "service_a", to: "service_z", flows: "pipeline" }],
      constraints: [],
      entry_ids: ["service_a"],
      exit_ids: ["service_z"],
    };

    const stepsNull = buildFlowPlaybackSteps(spec, null);
    expect(stepsNull.length).toBe(1);
    expect(stepsNull[0]!.from).toBe("service_a");
    expect(stepsNull[0]!.to).toBe("service_z");

    const stepsEmpty = buildFlowPlaybackSteps(spec, []);
    expect(stepsEmpty.length).toBe(1);
    expect(stepsEmpty[0]!.from).toBe("service_a");
    expect(stepsEmpty[0]!.to).toBe("service_z");
  });

  it("augments partial flowOrder with unranked nodes via Kahn topological sort", () => {
    const spec: ArchitectureSpec = {
      nodes: [
        {
          id: "node_1",
          name: "First",
          type: "svc",
          role: "1",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "node_2",
          name: "Second",
          type: "svc",
          role: "2",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "node_3",
          name: "Third",
          type: "svc",
          role: "3",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
      ],
      edges: [
        { from: "node_1", to: "node_2", flows: "f12" },
        { from: "node_2", to: "node_3", flows: "f23" },
      ],
      constraints: [],
      entry_ids: ["node_1"],
      exit_ids: ["node_3"],
    };

    // flowOrder only lists node_1
    const steps = buildFlowPlaybackSteps(spec, ["node_1"]);
    expect(steps.length).toBe(2);
    expect(steps[0]!.from).toBe("node_1");
    expect(steps[0]!.to).toBe("node_2");
    expect(steps[1]!.from).toBe("node_2");
    expect(steps[1]!.to).toBe("node_3");
  });

  it("preserves distinct layout edge IDs for parallel edges with identical fields", () => {
    const spec: ArchitectureSpec = {
      nodes: [
        {
          id: "src",
          name: "Source",
          type: "svc",
          role: "S",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "tgt",
          name: "Target",
          type: "svc",
          role: "T",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
      ],
      edges: [
        { from: "src", to: "tgt", flows: "identical stream" },
        { from: "src", to: "tgt", flows: "identical stream" },
      ],
      constraints: [],
      entry_ids: ["src"],
      exit_ids: ["tgt"],
    };

    const steps = buildFlowPlaybackSteps(spec, ["src", "tgt"]);
    expect(steps.length).toBe(2);
    expect(steps[0]!.edgeId).toBe("e-src-tgt-0");
    expect(steps[1]!.edgeId).toBe("e-src-tgt-1");
    expect(steps[0]!.stepNumber).toBe(1);
    expect(steps[1]!.stepNumber).toBe(2);
  });

  it("returns empty array when spec has zero edges", () => {
    const spec: ArchitectureSpec = {
      nodes: [
        {
          id: "solo",
          name: "Solo Node",
          type: "svc",
          role: "Isolated",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
      ],
      edges: [],
      constraints: [],
      entry_ids: ["solo"],
      exit_ids: ["solo"],
    };

    const steps = buildFlowPlaybackSteps(spec, ["solo"]);
    expect(steps).toEqual([]);
  });

  it("formats condition on second line when non-empty, and omits condition when whitespace or null", () => {
    const spec: ArchitectureSpec = {
      nodes: [
        {
          id: "a",
          name: "Sender",
          type: "svc",
          role: "S",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "b",
          name: "Receiver",
          type: "svc",
          role: "R",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
      ],
      edges: [
        {
          from: "a",
          to: "b",
          flows: "payload 1",
          condition: "amount > 1000",
        },
        {
          from: "a",
          to: "b",
          flows: "payload 2",
          condition: "   ",
        },
      ],
      constraints: [],
      entry_ids: ["a"],
      exit_ids: ["b"],
    };

    const steps = buildFlowPlaybackSteps(spec, ["a", "b"]);
    expect(steps.length).toBe(2);

    expect(steps[0]!.condition).toBe("amount > 1000");
    expect(steps[0]!.description).toBe(
      "Sender → Receiver: payload 1\nWhen: amount > 1000",
    );

    expect(steps[1]!.condition).toBeNull();
    expect(steps[1]!.description).toBe("Sender → Receiver: payload 2");
  });

  it("preserves hostile strings verbatim without HTML execution", () => {
    const hostileName = "<script>alert('xss')</script>";
    const hostileFlows = "**markdown bold** & <img src=x onerror=alert(1)>";
    const hostileCond = "x < 10 && 'quoted'";

    const spec: ArchitectureSpec = {
      nodes: [
        {
          id: "hostile_src",
          name: hostileName,
          type: "svc",
          role: "H",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "tgt",
          name: "Target",
          type: "svc",
          role: "T",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
      ],
      edges: [
        {
          from: "hostile_src",
          to: "tgt",
          flows: hostileFlows,
          condition: hostileCond,
        },
      ],
      constraints: [],
      entry_ids: ["hostile_src"],
      exit_ids: ["tgt"],
    };

    const steps = buildFlowPlaybackSteps(spec, ["hostile_src", "tgt"]);
    expect(steps.length).toBe(1);
    expect(steps[0]!.fromName).toBe(hostileName);
    expect(steps[0]!.flows).toBe(hostileFlows);
    expect(steps[0]!.condition).toBe(hostileCond);
    expect(steps[0]!.description).toContain(hostileName);
    expect(steps[0]!.description).toContain(hostileFlows);
    expect(steps[0]!.description).toContain(hostileCond);
  });
});
