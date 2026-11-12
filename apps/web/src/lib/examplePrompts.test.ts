import { describe, expect, it, vi } from "vitest";
import {
  EXAMPLE_PROMPTS,
  pickRandomExamplePrompts,
} from "./examplePrompts";
import { MAX_INPUT_CHARS } from "./types";

describe("examplePrompts catalog and helper", () => {
  it("contains between 8 and 10 prompts (D-346)", () => {
    expect(EXAMPLE_PROMPTS.length).toBeGreaterThanOrEqual(8);
    expect(EXAMPLE_PROMPTS.length).toBeLessThanOrEqual(10);
    expect(EXAMPLE_PROMPTS.length).toBe(9);
  });

  it("assigns unique IDs, titles, and non-empty prompts within MAX_INPUT_CHARS", () => {
    const ids = new Set<string>();
    const titles = new Set<string>();

    for (const p of EXAMPLE_PROMPTS) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);

      expect(titles.has(p.title)).toBe(false);
      titles.add(p.title);

      expect(p.prompt.length).toBeGreaterThan(20);
      expect(p.prompt.length).toBeLessThanOrEqual(MAX_INPUT_CHARS);
    }
  });

  it("contains zero cost, price, effort, or timeline figures (Rule 4)", () => {
    const prohibitedPatterns = [
      /\$\d+/i,
      /\b\d+\s*(?:dollars?|usd|eur|gbp)\b/i,
      /\b(?:cost|price|pricing|budget)\b/i,
      /\b\d+\s*(?:weeks?|months?|hours?)\s+to\s+(?:build|deliver|implement)\b/i,
      /\b(?:timeline|milestones?)\b/i,
    ];

    for (const p of EXAMPLE_PROMPTS) {
      for (const pattern of prohibitedPatterns) {
        expect(p.prompt).not.toMatch(pattern);
      }
    }
  });

  it("contains zero legal or regulatory compliance claims (Rule 8)", () => {
    const compliancePatterns = [
      /\b(?:hipaa|gdpr|pci[- ]?dss|soc\s?2|sox|fedramp|iso\s?27001)\b/i,
      /\bcompliant\b/i,
      /\bcompliance\b/i,
    ];

    for (const p of EXAMPLE_PROMPTS) {
      for (const pattern of compliancePatterns) {
        expect(p.prompt).not.toMatch(pattern);
      }
    }
  });

  it("pickRandomExamplePrompts returns 3 distinct items without mutating source array", () => {
    const originalLength = EXAMPLE_PROMPTS.length;
    const sampled = pickRandomExamplePrompts(EXAMPLE_PROMPTS, 3);

    expect(EXAMPLE_PROMPTS).toHaveLength(originalLength);
    expect(sampled).toHaveLength(3);

    const ids = new Set(sampled.map((s) => s.id));
    expect(ids.size).toBe(3);
  });

  it("pickRandomExamplePrompts responds deterministically when Math.random is mocked", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const sampled = pickRandomExamplePrompts(EXAMPLE_PROMPTS, 3);

    expect(sampled).toHaveLength(3);
    expect(sampled[0]?.id).toBe("ecommerce-infra");
    expect(sampled[1]?.id).toBe("ai-support-platform");
    expect(sampled[2]?.id).toBe("realtime-monitoring");

    randomSpy.mockRestore();
  });
});

