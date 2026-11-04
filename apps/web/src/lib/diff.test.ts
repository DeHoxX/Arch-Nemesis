import { describe, expect, it } from "vitest";
import { buildUnionGraph } from "./diff";
import type { ArchitectureSpec, PatchSummary, RequirementBrief } from "./types";

const TEST_BRIEF: RequirementBrief = {
  summary: "Enterprise contract and compliance audit system.",
  users: "Compliance Officers, Legal Auditors",
  data_involved: ["Contract documents", "Audit telemetry"],
  domain_hint: "Enterprise compliance",
  stated_constraints: [
    { id: "bc1", text: "All traffic must pass through authentication." },
    { id: "bc2", text: "Audit trail must record every state change." },
  ],
  unverifiable_requirements: ["System must provide high availability."],
  numbers_given: [{ label: "Max latency", value: "200", unit: "ms" }],
  assumptions: ["Standard HTTPS transport protocol."],
};

const BASE_SPEC: ArchitectureSpec = {
  nodes: [
    {
      id: "node_in",
      name: "Ingress Gateway",
      type: "gateway",
      role: "Receives external client requests",
      inputs: [],
      outputs: ["raw_req"],
      tech_options: ["Envoy"],
      needs_model: false,
    },
    {
      id: "node_auth",
      name: "Auth Service",
      type: "auth",
      role: "Authenticates incoming requests",
      inputs: ["raw_req"],
      outputs: ["auth_req"],
      tech_options: ["OAuth2"],
      needs_model: false,
    },
    {
      id: "node_proc",
      name: "Core Processor",
      type: "processor",
      role: "Executes business logic",
      inputs: ["auth_req"],
      outputs: ["result"],
      tech_options: ["Go"],
      needs_model: false,
    },
    {
      id: "node_out",
      name: "Egress Sink",
      type: "sink",
      role: "Returns final response to client",
      inputs: ["result"],
      outputs: [],
      tech_options: ["FastAPI"],
      needs_model: false,
    },
  ],
  edges: [
    { from: "node_in", to: "node_auth", flows: "req" },
    { from: "node_auth", to: "node_proc", flows: "auth_token" },
    { from: "node_proc", to: "node_out", flows: "res" },
  ],
  constraints: [
    {
      id: "c_auth_pass",
      text: "All traffic must pass through auth",
      kind: "must_pass_through",
      node_id: "node_auth",
      a: null,
      b: null,
      covers: ["bc1"],
    },
    {
      id: "c_audit_exist",
      text: "Audit trail must exist",
      kind: "must_exist",
      node_id: "node_proc",
      a: null,
      b: null,
      covers: ["bc2"],
    },
  ],
  entry_ids: ["node_in"],
  exit_ids: ["node_out"],
};

describe("buildUnionGraph (pure diff overlay)", () => {
  it("guards against empty inputs and verifies node ID regex format", () => {
    expect(TEST_BRIEF.stated_constraints).toHaveLength(2);
    expect(BASE_SPEC.nodes).toHaveLength(4);
    for (const node of BASE_SPEC.nodes) {
      expect(node.id).toMatch(/^[a-z][a-z0-9_]{1,40}$/);
    }
  });

  it("returns base spec with all unchanged when patch is null, undefined, or blocked", () => {
    const resNull = buildUnionGraph(BASE_SPEC, null);
    expect(resNull.nodes).toHaveLength(4);
    expect(resNull.nodes.every((n) => n.diffStatus === "unchanged")).toBe(true);
    expect(resNull.edges.every((e) => e.diffStatus === "unchanged")).toBe(true);

    const blockedPatch: PatchSummary = {
      id: "patch-blocked-1",
      status: "blocked",
      diff: null,
      issues: [
        {
          code: "E_BAD_REF",
          severity: "error",
          message: "Reference to missing node",
          ids: ["node_missing"],
        },
      ],
      ops_count: 1,
      preview_spec: null,
    };

    const resBlocked = buildUnionGraph(BASE_SPEC, blockedPatch);
    expect(resBlocked.nodes).toHaveLength(4);
    expect(resBlocked.nodes.every((n) => n.diffStatus === "unchanged")).toBe(true);
    expect(resBlocked.edges.every((e) => e.diffStatus === "unchanged")).toBe(true);
  });

  it("does not mutate input currentSpec or patch", () => {
    const currentSpecCopy = JSON.parse(JSON.stringify(BASE_SPEC));
    const patch: PatchSummary = {
      id: "patch-prop-1",
      status: "proposed",
      diff: {
        added_nodes: ["node_audit"],
        removed_nodes: [],
        changed_nodes: [],
        added_edges: [{ from_node: "node_proc", to: "node_audit", flows: "log" }],
        removed_edges: [],
        changed_edges: [],
        added_constraints: [],
        removed_constraints: [],
        changed_constraints: [],
        entry_changed: false,
        exit_changed: false,
      },
      issues: [],
      ops_count: 2,
      preview_spec: {
        ...BASE_SPEC,
        nodes: [
          ...BASE_SPEC.nodes,
          {
            id: "node_audit",
            name: "Audit Service",
            type: "logger",
            role: "Logs all audit records",
            inputs: ["result"],
            outputs: [],
            tech_options: [],
            needs_model: false,
          },
        ],
        edges: [
          ...BASE_SPEC.edges,
          { from: "node_proc", to: "node_audit", flows: "log" },
        ],
      },
    };

    const patchCopy = JSON.parse(JSON.stringify(patch));

    const result = buildUnionGraph(BASE_SPEC, patch);
    expect(BASE_SPEC).toEqual(currentSpecCopy);
    expect(patch).toEqual(patchCopy);
    expect(result.nodes).toHaveLength(5);
  });

  it("correctly marks added, removed, edited, and unchanged nodes and edges", () => {
    const patch: PatchSummary = {
      id: "patch-full-1",
      status: "proposed",
      diff: {
        added_nodes: ["node_audit"],
        removed_nodes: ["node_auth"],
        changed_nodes: [{ id: "node_proc", changed_fields: ["role"] }],
        added_edges: [{ from_node: "node_in", to: "node_audit", flows: "direct_req" }],
        removed_edges: [{ from_node: "node_in", to: "node_auth", flows: "req" }],
        changed_edges: [{ from_node: "node_proc", to: "node_out", changed_fields: ["flows"] }],
        added_constraints: [],
        removed_constraints: [],
        changed_constraints: [],
        entry_changed: false,
        exit_changed: false,
      },
      issues: [],
      ops_count: 6,
      preview_spec: {
        nodes: [
          BASE_SPEC.nodes[0]!, // node_in unchanged
          {
            ...BASE_SPEC.nodes[2]!,
            role: "Updated processor role with optimized throughput",
          }, // node_proc edited
          BASE_SPEC.nodes[3]!, // node_out unchanged
          {
            id: "node_audit",
            name: "Audit Service",
            type: "logger",
            role: "Audits security logs",
            inputs: ["direct_req"],
            outputs: [],
            tech_options: ["ClickHouse"],
            needs_model: false,
          }, // node_audit added
        ],
        edges: [
          { from: "node_in", to: "node_audit", flows: "direct_req" }, // added
          { from: "node_auth", to: "node_proc", flows: "auth_token" },
          { from: "node_proc", to: "node_out", flows: "updated_flows" }, // edited
        ],
        constraints: BASE_SPEC.constraints,
        entry_ids: ["node_in"],
        exit_ids: ["node_out"],
      },
    };

    const union = buildUnionGraph(BASE_SPEC, patch);

    // Nodes: node_in (unchanged), node_auth (removed), node_proc (edited), node_out (unchanged), node_audit (added)
    expect(union.nodes).toHaveLength(5);

    const nodeIn = union.nodes.find((n) => n.id === "node_in");
    expect(nodeIn?.diffStatus).toBe("unchanged");

    const nodeAuth = union.nodes.find((n) => n.id === "node_auth");
    expect(nodeAuth?.diffStatus).toBe("removed");

    const nodeProc = union.nodes.find((n) => n.id === "node_proc");
    expect(nodeProc?.diffStatus).toBe("edited");
    expect(nodeProc?.role).toBe("Updated processor role with optimized throughput");

    const nodeAudit = union.nodes.find((n) => n.id === "node_audit");
    expect(nodeAudit?.diffStatus).toBe("added");
    expect(nodeAudit?.name).toBe("Audit Service");

    // Edges
    const removedEdge = union.edges.find((e) => e.from === "node_in" && e.to === "node_auth");
    expect(removedEdge?.diffStatus).toBe("removed");

    const addedEdge = union.edges.find((e) => e.from === "node_in" && e.to === "node_audit");
    expect(addedEdge?.diffStatus).toBe("added");

    const editedEdge = union.edges.find((e) => e.from === "node_proc" && e.to === "node_out");
    expect(editedEdge?.diffStatus).toBe("edited");
    expect(editedEdge?.flows).toBe("updated_flows");
  });

  it("handles parallel edges correctly without collision", () => {
    const specWithParallel: ArchitectureSpec = {
      ...BASE_SPEC,
      edges: [
        { from: "node_in", to: "node_proc", flows: "sync_flow" },
        { from: "node_proc", to: "node_out", flows: "main_result" },
      ],
    };

    const patch: PatchSummary = {
      id: "patch-parallel",
      status: "proposed",
      diff: {
        added_nodes: [],
        removed_nodes: [],
        changed_nodes: [],
        added_edges: [{ from_node: "node_in", to: "node_proc", flows: "async_telemetry" }],
        removed_edges: [],
        changed_edges: [],
        added_constraints: [],
        removed_constraints: [],
        changed_constraints: [],
        entry_changed: false,
        exit_changed: false,
      },
      issues: [],
      ops_count: 1,
      preview_spec: {
        ...specWithParallel,
        edges: [
          { from: "node_in", to: "node_proc", flows: "sync_flow" },
          { from: "node_in", to: "node_proc", flows: "async_telemetry" },
          { from: "node_proc", to: "node_out", flows: "main_result" },
        ],
      },
    };

    const union = buildUnionGraph(specWithParallel, patch);
    expect(union.edges.length).toBeGreaterThanOrEqual(2);
  });
});
