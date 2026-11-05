import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  acceptPatch,
  apiErrorEnvelopeSchema,
  chatResponseSchema,
  designResponseSchema,
  diffResultSchema,
  edgeSpecSchema,
  getDesignVersion,
  getMessages,
  getVersions,
  messagesResponseSchema,
  nodeSpecSchema,
  patchSummarySchema,
  postChat,
  postSuggestions,
  refinedDesignResponseSchema,
  rejectPatch,
  rejectPatchResponseSchema,
  restoreVersion,
  validationIssueSchema,
  versionsResponseSchema,
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

  it("parses NodeSpec and EdgeSpec with optional condition, ai_role, and tools", () => {
    const nodePayload = {
      id: "agent_evaluator",
      name: "Agent Evaluator",
      type: "agent",
      role: "Autonomous review agent",
      inputs: ["contract_doc"],
      outputs: ["risk_verdict"],
      tech_options: [],
      needs_model: true,
      ai_role: "agent",
      tools: ["code_interpreter", "legal_search"],
    };
    const nodeResult = nodeSpecSchema.safeParse(nodePayload);
    expect(nodeResult.success).toBe(true);
    if (nodeResult.success) {
      expect(nodeResult.data.ai_role).toBe("agent");
      expect(nodeResult.data.tools).toEqual(["code_interpreter", "legal_search"]);
    }

    const edgePayload = {
      from: "agent_evaluator",
      to: "review_queue",
      flows: "risk dossier",
      condition: "score > 85",
    };
    const edgeResult = edgeSpecSchema.safeParse(edgePayload);
    expect(edgeResult.success).toBe(true);
    if (edgeResult.success) {
      expect(edgeResult.data.condition).toBe("score > 85");
    }
  });

  describe("Phase 7 Refinement Schemas", () => {
    it("parses real ValidationIssue schema with exact backend fields", () => {
      const issuePayload = {
        code: "E_BAD_REF",
        severity: "error",
        message: "Node 'missing_target' does not exist in the spec.",
        ids: ["missing_target"],
      };
      const res = validationIssueSchema.safeParse(issuePayload);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.code).toBe("E_BAD_REF");
        expect(res.data.severity).toBe("error");
        expect(res.data.ids).toEqual(["missing_target"]);
      }
    });

    it("parses real DiffResult schema with from_node edge mapping", () => {
      const diffPayload = {
        added_nodes: ["node_audit"],
        removed_nodes: ["node_legacy"],
        changed_nodes: [{ id: "node_proc", changed_fields: ["role"] }],
        added_edges: [{ from_node: "node_in", to: "node_audit", flows: "audit_data" }],
        removed_edges: [{ from_node: "node_in", to: "node_legacy", flows: "old_data" }],
        changed_edges: [{ from_node: "node_proc", to: "node_out", changed_fields: ["flows"] }],
        added_constraints: ["c_audit"],
        removed_constraints: [],
        changed_constraints: [],
        entry_changed: false,
        exit_changed: false,
      };
      const res = diffResultSchema.safeParse(diffPayload);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.added_nodes).toEqual(["node_audit"]);
        expect(res.data.removed_nodes).toEqual(["node_legacy"]);
        expect(res.data.added_edges[0]?.to).toBe("node_audit");
      }
    });

    it("parses PatchSummary with optional preview_spec", () => {
      const summaryPayload = {
        id: "patch-test-uuid",
        status: "proposed",
        diff: null,
        issues: [],
        ops_count: 3,
        preview_spec: VALID_DESIGN_FIXTURE.spec,
      };
      const res = patchSummarySchema.safeParse(summaryPayload);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.status).toBe("proposed");
        expect(res.data.ops_count).toBe(3);
        expect(res.data.preview_spec).not.toBeNull();
        expect(res.data.preview_spec?.nodes).toHaveLength(3);
      }
    });

    it("parses ChatResponse payload", () => {
      const chatPayload = {
        message_id: "msg-uuid-1",
        reply: "I have added an audit logger as requested.",
        patch: {
          id: "patch-1",
          status: "proposed",
          diff: null,
          issues: [],
          ops_count: 1,
          preview_spec: null,
        },
      };
      const res = chatResponseSchema.safeParse(chatPayload);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.message_id).toBe("msg-uuid-1");
        expect(res.data.patch?.status).toBe("proposed");
      }
    });

    it("parses RefinedDesignResponse and RejectPatchResponse", () => {
      const refinedPayload = {
        ...VALID_DESIGN_FIXTURE,
        current_version: 2,
        prompt_version: "refine_v3",
        warnings: [],
        flow_order: ["contract_client", "clause_extractor", "review_queue"],
        explanation: null,
      };
      const resRefined = refinedDesignResponseSchema.safeParse(refinedPayload);
      expect(resRefined.success).toBe(true);

      const rejectPayload = {
        id: "patch-rejected-uuid",
        status: "rejected",
      };
      const resReject = rejectPatchResponseSchema.safeParse(rejectPayload);
      expect(resReject.success).toBe(true);
      if (resReject.success) {
        expect(resReject.data.status).toBe("rejected");
      }
    });

    it("parses MessagesResponse and VersionsResponse", () => {
      const messagesPayload = {
        messages: [
          {
            id: "m1",
            role: "user",
            text: "Add an audit logger",
            created_at: "2026-11-04T12:00:00Z",
          },
          {
            id: "m2",
            role: "assistant",
            text: "Here is the proposal",
            created_at: "2026-11-04T12:00:02Z",
          },
        ],
      };
      const resMessages = messagesResponseSchema.safeParse(messagesPayload);
      expect(resMessages.success).toBe(true);
      if (resMessages.success) {
        expect(resMessages.data.messages).toHaveLength(2);
      }

      const versionsPayload = {
        versions: [
          {
            version_no: 2,
            created_at: "2026-11-04T12:05:00Z",
            change_note: "Added audit logger.",
          },
          {
            version_no: 1,
            created_at: "2026-11-04T12:00:00Z",
            change_note: null,
          },
        ],
      };
      const resVersions = versionsResponseSchema.safeParse(versionsPayload);
      expect(resVersions.success).toBe(true);
      if (resVersions.success) {
        expect(resVersions.data.versions[0]?.version_no).toBe(2);
      }
    });
  });

  describe("Phase 7 Refinement Error Envelopes", () => {
    it.each([
      ["STALE_PATCH", "This proposal is from an older version of the design."],
      ["PATCH_BLOCKED", "Patch failed server-side re-validation."],
      ["CONFIRMATION_REQUIRED", "Dropping constraints requires explicit confirmation."],
      ["CAP_TURNS", "This design has reached the limit of 20 change requests."],
      ["CAP_VERSIONS", "This design has reached the limit of 15 versions."],
      ["RESTORE_CURRENT_VERSION", "Cannot restore the active design version."],
    ])("parses 409 %s error envelope into ApiError with readable code", (code, message) => {
      const errorPayload = {
        error: {
          code,
          message,
        },
      };

      const parsed = apiErrorEnvelopeSchema.safeParse(errorPayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.error.code).toBe(code);
        expect(parsed.data.error.message).toBe(message);

        const apiErr = new ApiError(parsed.data.error.message, parsed.data.error.code, 409);
        expect(apiErr.code).toBe(code);
        expect(apiErr.status).toBe(409);
      }
    });
  });

  describe("Phase 7 Fetch Helper Boundary Mocks", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("postChat issues POST to /api/designs/:id/chat and handles response", async () => {
      const mockChatRes = {
        message_id: "msg-123",
        reply: "Proposal generated.",
        patch: null,
      };

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockChatRes), { status: 200 }),
      );

      const res = await postChat("des-1", "Add a logger");
      expect(fetch).toHaveBeenCalledWith("/api/designs/des-1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Add a logger" }),
      });
      expect(res.message_id).toBe("msg-123");
    });

    it("getMessages issues GET to /api/designs/:id/messages", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ messages: [] }), { status: 200 }),
      );

      const res = await getMessages("des-1");
      expect(fetch).toHaveBeenCalledWith("/api/designs/des-1/messages");
      expect(res.messages).toEqual([]);
    });

    it("getVersions issues GET to /api/designs/:id/versions", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ versions: [] }), { status: 200 }),
      );

      const res = await getVersions("des-1");
      expect(fetch).toHaveBeenCalledWith("/api/designs/des-1/versions");
      expect(res.versions).toEqual([]);
    });

    it("getDesignVersion issues GET to /api/designs/:id/versions/:n", async () => {
      const mockVer = {
        ...VALID_DESIGN_FIXTURE,
        current_version: 1,
        prompt_version: "refine_v3",
        warnings: [],
        flow_order: ["contract_client", "clause_extractor", "review_queue"],
      };

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockVer), { status: 200 }),
      );

      const res = await getDesignVersion("des-1", 1);
      expect(fetch).toHaveBeenCalledWith("/api/designs/des-1/versions/1");
      expect(res.id).toBe(VALID_DESIGN_FIXTURE.id);
    });

    it("acceptPatch issues POST with confirm_drop", async () => {
      const mockVer = {
        ...VALID_DESIGN_FIXTURE,
        current_version: 2,
        prompt_version: "refine_v3",
        warnings: [],
        flow_order: ["contract_client", "clause_extractor", "review_queue"],
      };

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockVer), { status: 200 }),
      );

      const res = await acceptPatch("des-1", "patch-1", true);
      expect(fetch).toHaveBeenCalledWith("/api/designs/des-1/patches/patch-1/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_drop: true }),
      });
      expect(res.current_version).toBe(2);
    });

    it("rejectPatch issues POST without body", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "patch-1", status: "rejected" }), { status: 200 }),
      );

      const res = await rejectPatch("des-1", "patch-1");
      expect(fetch).toHaveBeenCalledWith("/api/designs/des-1/patches/patch-1/reject", {
        method: "POST",
      });
      expect(res.status).toBe("rejected");
    });

    it("restoreVersion issues POST with version_no", async () => {
      const mockVer = {
        ...VALID_DESIGN_FIXTURE,
        current_version: 3,
        prompt_version: "refine_v3",
        warnings: [],
        flow_order: ["contract_client", "clause_extractor", "review_queue"],
      };

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockVer), { status: 200 }),
      );

      const res = await restoreVersion("des-1", 1);
      expect(fetch).toHaveBeenCalledWith("/api/designs/des-1/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_no: 1 }),
      });
      expect(res.current_version).toBe(3);
    });

    it("postSuggestions issues POST to /api/designs/:id/suggestions and parses response", async () => {
      const mockSuggestionsRes = {
        suggestions: [
          {
            patch_id: "sugg-1",
            title: "Add rate limiter",
            reason: "Protects backend from surges",
            status: "proposed",
            diff: {
              added_nodes: ["rate_limiter"],
              removed_nodes: [],
              changed_nodes: [],
              added_edges: [],
              removed_edges: [],
              changed_edges: [],
              added_constraints: [],
              removed_constraints: [],
              changed_constraints: [],
              entry_changed: false,
              exit_changed: false,
            },
            preview_spec: VALID_DESIGN_FIXTURE.spec,
            issues: [],
          },
        ],
        discarded_count: 2,
        discarded_issue_codes: [["E_BAD_REF"]],
      };

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockSuggestionsRes), { status: 200 }),
      );

      const res = await postSuggestions("des-1");
      expect(fetch).toHaveBeenCalledWith("/api/designs/des-1/suggestions", {
        method: "POST",
      });
      expect(res.suggestions).toHaveLength(1);
      const sugg = res.suggestions[0];
      expect(sugg).toBeDefined();
      expect(sugg?.patch_id).toBe("sugg-1");
      expect(sugg?.title).toBe("Add rate limiter");
      expect(sugg?.status).toBe("proposed");
      expect(sugg?.preview_spec).not.toBeNull();
      expect(res.discarded_count).toBe(2);
      expect(res.discarded_issue_codes).toEqual([["E_BAD_REF"]]);
    });
  });
});
