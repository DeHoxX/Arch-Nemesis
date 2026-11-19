import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BriefCard } from "./BriefCard";
import type { RequirementBrief } from "@/lib/types";

describe("BriefCard", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "dark";
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  const sampleBrief: RequirementBrief = {
    summary: "Cloud Migration Pipeline",
    users: "DevOps Engineers",
    data_involved: ["Terraform configs"],
    domain_hint: "cloud",
    stated_constraints: [{ id: "bc1", text: "Must support AWS and GCP" }],
    unverifiable_requirements: ["SOC2 Type II compliance"],
    numbers_given: [{ label: "Clusters", value: "10", unit: "clusters" }],
    assumptions: ["PostgreSQL 16 deployed in primary region"],
  };

  it("renders Assumed badge on items in brief.assumptions", () => {
    render(<BriefCard brief={sampleBrief} onGenerate={vi.fn()} />);

    expect(screen.getByText("Assumed")).toBeDefined();
    expect(
      screen.getByText("PostgreSQL 16 deployed in primary region")
    ).toBeDefined();
    expect(screen.getByText("Must support AWS and GCP")).toBeDefined();
  });

  it("renders unverifiable requirements header with high-contrast amber in light mode and amber-500 in dark mode", () => {
    render(<BriefCard brief={sampleBrief} onGenerate={vi.fn()} />);

    const unverifiableHeading = screen.getByText("Not verified by checks");
    const classes = unverifiableHeading.className.split(/\s+/);
    expect(classes).toContain("text-amber-700");
    expect(classes).toContain("dark:text-amber-500");
  });
});
