import { describe, expect, it } from "vitest";
import {
  ApiError,
  apiErrorEnvelopeSchema,
  designResponseSchema,
} from "./api";

const VALID_DESIGN_FIXTURE = {
  id: "d-test-12345",
  intake_session_id: "s-test-67890",
  current_version: 1,
  brief: {
    summary: "Automated legal contract processing and human review system.",
    users: "Corporate Legal Counsel, Paralegals",
    data_involved: ["PDF Contracts", "Audit Logs"],
    domain_hint: "Legal",
    stated_constraints: [
      { id: "bc1", text: "Human must approve high risk contracts" },
    ],
    unverifiable_requirements: ["System must feel fast and responsive"],
    numbers_given: [{ label: "Max turnaround", value: "24", unit: "hours" }],
    assumptions: ["All uploads are standard PDF/A format"],
  },
  spec: {
    nodes: [
      {
        id: "contract_client",
        name: "Web Portal Client",
        type: "client",
        role: "Allows counsel to submit contracts",
        inputs: [],
        outputs: ["contract_pdf"],
        tech_options: ["Next.js", "React"],
        needs_model: false,
      },
      {
        id: "clause_extractor",
        name: "Clause Extraction Engine",
        type: "ml_service",
        role: "Extracts indemnification and termination clauses",
        inputs: ["contract_pdf"],
        outputs: ["extracted_clauses"],
        tech_options: ["PyTorch", "HuggingFace"],
        needs_model: true,
      },
      {
        id: "review_queue",
        name: "Human Review Queue",
        type: "workflow_queue",
        role: "Queues flagged contracts for human counsel signoff",
        inputs: ["extracted_clauses"],
        outputs: [],
        tech_options: ["PostgreSQL"],
        needs_model: false,
      },
    ],
    edges: [
      {
        from: "contract_client",
        to: "clause_extractor",
        flows: "Contract PDF binary stream",
      },
      {
        from: "clause_extractor",
        to: "review_queue",
        flows: "Flagged clauses for review",
      },
    ],
    constraints: [
      {
        id: "c1",
        text: "High risk contracts must pass through human review",
        kind: "must_pass_through",
        node_id: "review_queue",
        a: null,
        b: null,
        covers: ["bc1"],
      },
    ],
    entry_ids: ["contract_client"],
    exit_ids: ["review_queue"],
  },
  warnings: ["Node 'review_queue' lists no outputs."],
  flow_order: ["contract_client", "clause_extractor", "review_queue"],
  prompt_version: "architect_v1",
};

describe("api client Zod schema parsing", () => {
  it("accepts a valid DesignResponse payload with brief, spec, and string warnings", () => {
    const result = designResponseSchema.safeParse(VALID_DESIGN_FIXTURE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("d-test-12345");
      expect(result.data.brief.summary).toContain("Automated legal contract");
      expect(result.data.brief.unverifiable_requirements).toEqual([
        "System must feel fast and responsive",
      ]);
      expect(result.data.warnings).toEqual([
        "Node 'review_queue' lists no outputs.",
      ]);
      expect(result.data.spec.nodes).toHaveLength(3);
      expect(result.data.spec.edges[0]?.from).toBe("contract_client");
      expect(result.data.flow_order).toEqual([
        "contract_client",
        "clause_extractor",
        "review_queue",
      ]);
    }
  });

  it("rejects payload when a required field is missing", () => {
    // Missing flow_order
    const missingField = { ...VALID_DESIGN_FIXTURE };
    // @ts-expect-error Testing runtime missing field
    delete missingField.flow_order;

    const result = designResponseSchema.safeParse(missingField);
    expect(result.success).toBe(false);
  });

  it("rejects payload when a field has the wrong type", () => {
    const invalidType = {
      ...VALID_DESIGN_FIXTURE,
      spec: {
        ...VALID_DESIGN_FIXTURE.spec,
        nodes: [
          {
            ...VALID_DESIGN_FIXTURE.spec.nodes[0],
            needs_model: "yes", // should be boolean
          },
        ],
      },
    };

    const result = designResponseSchema.safeParse(invalidType);
    expect(result.success).toBe(false);
  });

  it("parses standard error envelope correctly", () => {
    const errorBody = {
      error: {
        code: "NOT_FOUND",
        message: "Design 'missing-123' was not found.",
      },
    };

    const parsed = apiErrorEnvelopeSchema.safeParse(errorBody);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.error.code).toBe("NOT_FOUND");
      expect(parsed.data.error.message).toBe("Design 'missing-123' was not found.");
      expect(parsed.data.error.issues).toBeUndefined();
    }
  });

  it("parses 422 DESIGN_FAILED error envelope including issue messages list", () => {
    const designFailedBody = {
      error: {
        code: "DESIGN_FAILED",
        message:
          "I could not produce a design that passes all checks. Please rephrase your need or try again.",
        issues: [
          "Graph contains an isolated cycle between node_a and node_b.",
          "Node 'orphan_worker' is unreachable from any entry node.",
        ],
      },
    };

    const parsed = apiErrorEnvelopeSchema.safeParse(designFailedBody);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.error.code).toBe("DESIGN_FAILED");
      expect(parsed.data.error.issues).toEqual([
        "Graph contains an isolated cycle between node_a and node_b.",
        "Node 'orphan_worker' is unreachable from any entry node.",
      ]);

      const err = new ApiError(
        parsed.data.error.message,
        parsed.data.error.code,
        422,
        parsed.data.error.issues,
      );
      expect(err.status).toBe(422);
      expect(err.code).toBe("DESIGN_FAILED");
      expect(err.issues).toHaveLength(2);
    }
  });
});
