import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NotesPanel } from "./NotesPanel";

describe("NotesPanel component", () => {
  it("renders null when both warnings and unverifiable requirements are empty or undefined", () => {
    const { container: c1 } = render(<NotesPanel />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <NotesPanel warnings={[]} unverifiableRequirements={[]} />,
    );
    expect(c2.firstChild).toBeNull();
  });

  it("renders warnings under 'Notes' and hides 'Not verified by checks' when unverifiable is empty", () => {
    render(
      <NotesPanel
        warnings={[
          "Node 'auth_service' has high fan-out with 6 dependent services.",
        ]}
      />,
    );

    expect(screen.getByText("Notes")).toBeDefined();
    expect(
      screen.getByText(
        "Node 'auth_service' has high fan-out with 6 dependent services.",
      ),
    ).toBeDefined();
    expect(screen.queryByText("Not verified by checks")).toBeNull();
  });

  it("renders unverifiable requirements under 'Not verified by checks' and hides 'Notes' when warnings empty", () => {
    render(
      <NotesPanel
        unverifiableRequirements={[
          "System must ensure 99.999% uptime during peak holiday season.",
        ]}
      />,
    );

    expect(screen.getByText("Not verified by checks")).toBeDefined();
    expect(
      screen.getByText(
        "System must ensure 99.999% uptime during peak holiday season.",
      ),
    ).toBeDefined();
    expect(screen.queryByText("Notes")).toBeNull();
  });

  it("renders both sections when both warnings and unverifiable requirements are provided", () => {
    render(
      <NotesPanel
        warnings={["Cycle detected but resolved via acyclic ordering heuristic."]}
        unverifiableRequirements={[
          "All data must remain within EU geographical jurisdiction.",
        ]}
      />,
    );

    expect(screen.getByText("Notes")).toBeDefined();
    expect(
      screen.getByText("Cycle detected but resolved via acyclic ordering heuristic."),
    ).toBeDefined();
    expect(screen.getByText("Not verified by checks")).toBeDefined();
    expect(
      screen.getByText("All data must remain within EU geographical jurisdiction."),
    ).toBeDefined();
  });
});

