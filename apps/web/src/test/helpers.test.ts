import { describe, expect, it } from "vitest";
import { normalizeColorToHex } from "./helpers";

describe("normalizeColorToHex helper", () => {
  it("returns lowercase 6-digit hex unchanged", () => {
    expect(normalizeColorToHex("#f43f5e")).toBe("#f43f5e");
    expect(normalizeColorToHex("#10b981")).toBe("#10b981");
  });

  it("converts uppercase 6-digit hex to lowercase", () => {
    expect(normalizeColorToHex("#F43F5E")).toBe("#f43f5e");
  });

  it("expands 3-digit hex to 6-digit lowercase hex", () => {
    expect(normalizeColorToHex("#f00")).toBe("#ff0000");
    expect(normalizeColorToHex("#FFF")).toBe("#ffffff");
  });

  it("converts rgb() strings to 6-digit hex", () => {
    expect(normalizeColorToHex("rgb(244, 63, 94)")).toBe("#f43f5e");
    expect(normalizeColorToHex("rgb(16, 185, 129)")).toBe("#10b981");
    expect(normalizeColorToHex("rgb(0, 0, 0)")).toBe("#000000");
    expect(normalizeColorToHex("rgb(255, 255, 255)")).toBe("#ffffff");
  });

  it("converts rgba() strings to 6-digit hex ignoring alpha", () => {
    expect(normalizeColorToHex("rgba(244, 63, 94, 0.6)")).toBe("#f43f5e");
  });

  it("handles whitespace and null/undefined gracefully", () => {
    expect(normalizeColorToHex("  rgb( 244 , 63 , 94 )  ")).toBe("#f43f5e");
    expect(normalizeColorToHex(null)).toBe("");
    expect(normalizeColorToHex(undefined)).toBe("");
    expect(normalizeColorToHex("")).toBe("");
  });

  it("returns trimmed fallback for unrecognised formats", () => {
    expect(normalizeColorToHex("var(--border)")).toBe("var(--border)");
  });
});

