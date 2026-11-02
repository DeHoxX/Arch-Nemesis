import { beforeEach, describe, expect, it } from "vitest";
import {
  clearIntakeState,
  INTAKE_STORAGE_KEY,
  INTAKE_STORAGE_MAX_BYTES,
  loadIntakeState,
  saveIntakeState,
} from "./intakeStorage";
import type { RequirementBrief } from "./types";

const sampleBrief: RequirementBrief = {
  summary: "Enterprise Policy Evaluator",
  users: "Compliance Officers",
  data_involved: ["claims", "policies"],
  domain_hint: "insurance",
  stated_constraints: [{ id: "c1", text: "Must enforce data privacy" }],
  unverifiable_requirements: [],
  numbers_given: [{ label: "retention", value: "7", unit: "years" }],
  assumptions: ["All claims are digital"],
};

describe("intakeStorage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("saves and loads intake state successfully", () => {
    saveIntakeState({
      sessionId: "session_test_123",
      inputText: "Draft input text",
      messages: [
        { id: "m1", sender: "user", text: "Hello" },
        { id: "m2", sender: "assistant", questions: ["What is your SLA?"] },
      ],
      brief: sampleBrief,
      designId: "design_xyz",
    });

    const loaded = loadIntakeState();
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe("v1");
    expect(loaded?.sessionId).toBe("session_test_123");
    expect(loaded?.inputText).toBe("Draft input text");
    expect(loaded?.messages).toHaveLength(2);
    expect(loaded?.messages?.[1]?.questions).toEqual(["What is your SLA?"]);
    expect(loaded?.brief?.summary).toBe("Enterprise Policy Evaluator");
    expect(loaded?.designId).toBe("design_xyz");
  });

  it("returns null when storage is empty", () => {
    expect(loadIntakeState()).toBeNull();
  });

  it("returns null when JSON is corrupt or unparseable", () => {
    window.sessionStorage.setItem(INTAKE_STORAGE_KEY, "invalid-json{");
    expect(loadIntakeState()).toBeNull();
  });

  it("returns null when schema version mismatches", () => {
    window.sessionStorage.setItem(
      INTAKE_STORAGE_KEY,
      JSON.stringify({
        version: "v2",
        sessionId: "session_old",
        inputText: "Old input",
        messages: [],
        brief: null,
      }),
    );
    expect(loadIntakeState()).toBeNull();
  });

  it("drops payloads exceeding INTAKE_STORAGE_MAX_BYTES (500 KB)", () => {
    const hugeText = "X".repeat(INTAKE_STORAGE_MAX_BYTES + 100);
    saveIntakeState({
      sessionId: "session_oversized",
      inputText: hugeText,
      messages: [],
      brief: null,
    });

    expect(window.sessionStorage.getItem(INTAKE_STORAGE_KEY)).toBeNull();
    expect(loadIntakeState()).toBeNull();
  });

  it("clears intake state from sessionStorage without touching localStorage", () => {
    saveIntakeState({
      sessionId: "session_to_clear",
      inputText: "Will be cleared",
      messages: [],
      brief: null,
    });
    window.localStorage.setItem("other.key", "preserve_me");

    expect(window.sessionStorage.getItem(INTAKE_STORAGE_KEY)).not.toBeNull();
    clearIntakeState();
    expect(window.sessionStorage.getItem(INTAKE_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem("other.key")).toBe("preserve_me");
  });

  it("never writes intake text to localStorage", () => {
    saveIntakeState({
      sessionId: "session_private",
      inputText: "Highly confidential user specification",
      messages: [
        {
          id: "m_priv",
          sender: "user",
          text: "Confidential architecture detail",
        },
      ],
      brief: null,
    });

    expect(window.localStorage.getItem(INTAKE_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });
});
