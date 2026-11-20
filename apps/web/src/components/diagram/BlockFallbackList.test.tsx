import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ArchitectureSpec } from "@/lib/types";
import { BlockFallbackList } from "./BlockFallbackList";
import { FallbackList } from "./FallbackList";

describe("BlockFallbackList component (Stage V3-4C, D-398)", () => {
  beforeEach(() => {
    document.documentElement.className = "";
  });

  afterEach(() => {
    document.documentElement.className = "";
  });

  const layeredSpec: ArchitectureSpec = {
    nodes: [
      {
        id: "node_store",
        name: "Database Sink",
        type: "database",
        layer: "Storage",
        role: "Persists validated financial records into durable storage. Long description follows.",
        inputs: ["transaction_record"],
        outputs: [],
        tech_options: ["PostgreSQL"],
        needs_model: false,
      },
      {
        id: "node_proc",
        name: "Validation Worker",
        type: "worker",
        layer: "Processing",
        role: "Executes business logic validation on stream batches.",
        inputs: ["raw_event"],
        outputs: ["transaction_record"],
        tech_options: ["Go Worker"],
        needs_model: true,
      },
      {
        id: "node_ingest",
        name: "API Gateway",
        type: "api_gateway",
        layer: "Ingest",
        role: "Terminates TLS and authenticates ingress HTTP requests.",
        inputs: ["http_request"],
        outputs: ["raw_event"],
        tech_options: ["Envoy"],
        needs_model: false,
      },
    ],
    edges: [
      { from: "node_ingest", to: "node_proc", flows: "raw_event" },
      { from: "node_proc", to: "node_store", flows: "transaction_record" },
    ],
    constraints: [],
    entry_ids: ["node_ingest"],
    exit_ids: ["node_store"],
  };

  it("grouped list follows layer order and omits node type", () => {
    const flowOrder = ["node_ingest", "node_proc", "node_store"];
    render(<BlockFallbackList spec={layeredSpec} flowOrder={flowOrder} />);

    // Layer headings (level 3): Ingest -> Processing -> Storage
    const layerHeadings = screen.getAllByRole("heading", { level: 3 });
    expect(layerHeadings.length).toBe(3);
    expect(layerHeadings[0]?.textContent).toContain("Ingest");
    expect(layerHeadings[0]?.textContent).toContain("1 part");
    expect(layerHeadings[1]?.textContent).toContain("Processing");
    expect(layerHeadings[1]?.textContent).toContain("1 part");
    expect(layerHeadings[2]?.textContent).toContain("Storage");
    expect(layerHeadings[2]?.textContent).toContain("1 part");

    // Node headings (level 4)
    const nodeHeadings = screen.getAllByRole("heading", { level: 4 });
    expect(nodeHeadings.length).toBe(3);
    expect(nodeHeadings[0]?.textContent).toBe("API Gateway");
    expect(nodeHeadings[1]?.textContent).toBe("Validation Worker");
    expect(nodeHeadings[2]?.textContent).toBe("Database Sink");

    // Requirement: Node type is NOT shown anywhere
    expect(screen.queryByText("api_gateway")).toBeNull();
    expect(screen.queryByText("worker")).toBeNull();
    expect(screen.queryByText("database")).toBeNull();

    // Outgoing destinations derived from edges
    expect(screen.getByText("Validation Worker", { selector: "span" })).toBeDefined();
    expect(screen.getByText("Database Sink", { selector: "span" })).toBeDefined();
    expect(screen.getByText("None (exit node)")).toBeDefined();

    // Entry / Exit / AI badges
    expect(screen.getByText("Entry")).toBeDefined();
    expect(screen.getByText("Exit")).toBeDefined();
    expect(screen.getByText("AI model")).toBeDefined();
  });

  it("fallback Stage N for a spec without layers", () => {
    const unlayeredSpec: ArchitectureSpec = {
      nodes: [
        {
          id: "step1",
          name: "Producer",
          type: "service",
          role: "Produces raw stream items.",
          inputs: [],
          outputs: ["stream"],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "step2",
          name: "Consumer",
          type: "service",
          role: "Consumes stream items.",
          inputs: ["stream"],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
      ],
      edges: [{ from: "step1", to: "step2", flows: "stream" }],
      constraints: [],
      entry_ids: ["step1"],
      exit_ids: ["step2"],
    };

    render(<BlockFallbackList spec={unlayeredSpec} flowOrder={["step1", "step2"]} />);

    const layerHeadings = screen.getAllByRole("heading", { level: 3 });
    expect(layerHeadings.length).toBe(2);
    expect(layerHeadings[0]?.textContent).toContain("Stage 1");
    expect(layerHeadings[1]?.textContent).toContain("Stage 2");
  });

  it("places Other parts group last for unassigned layer nodes", () => {
    const specWithUnassigned: ArchitectureSpec = {
      nodes: [
        {
          id: "node_unassigned",
          name: "Background Telemetry",
          type: "service",
          // No layer specified
          role: "Collects auxiliary runtime metrics.",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "node_ingest",
          name: "Ingest Node",
          type: "service",
          layer: "Ingest",
          role: "Ingests user events.",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
        {
          id: "node_store",
          name: "Storage Node",
          type: "service",
          layer: "Storage",
          role: "Stores user events.",
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
      ],
      edges: [],
      constraints: [],
      entry_ids: [],
      exit_ids: [],
    };

    render(<BlockFallbackList spec={specWithUnassigned} />);

    const layerHeadings = screen.getAllByRole("heading", { level: 3 });
    expect(layerHeadings.length).toBe(3);
    expect(layerHeadings[0]?.textContent).toContain("Ingest");
    expect(layerHeadings[1]?.textContent).toContain("Storage");
    expect(layerHeadings[2]?.textContent).toContain("Other parts");
  });

  it("renders hostile strings literal without HTML injection or crash", () => {
    const hostileName = "<script>alert(1)</script>";
    const hostileLayer = "<b>40CharLayerName12345678901234567890123456</b>";
    const long500Char = "A".repeat(500);
    const hostileRole = `**bold text** and ${long500Char}`;

    const hostileSpec: ArchitectureSpec = {
      nodes: [
        {
          id: "hostile_node",
          name: hostileName,
          type: "service",
          layer: hostileLayer,
          role: hostileRole,
          inputs: [],
          outputs: [],
          tech_options: [],
          needs_model: false,
        },
      ],
      edges: [],
      constraints: [],
      entry_ids: [],
      exit_ids: [],
    };

    render(<BlockFallbackList spec={hostileSpec} />);

    // Assert script and bold tags were NOT parsed as DOM elements
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("b")).toBeNull();

    // Assert literal text is rendered safely as plain string
    expect(screen.getByText(hostileName)).toBeDefined();
    expect(screen.getByText(new RegExp(hostileLayer.slice(0, 30)))).toBeDefined();
    expect(screen.getByText(new RegExp("\\*\\*bold text\\*\\*"))).toBeDefined();
  });

  it("Architecture list unchanged: flat order test via FallbackList", () => {
    const flowOrder = ["node_store", "node_ingest", "node_proc"];

    render(<FallbackList spec={layeredSpec} flowOrder={flowOrder} />);

    // Architecture list renders a single level 3 heading
    const mainHeading = screen.getByRole("heading", { level: 3 });
    expect(mainHeading.textContent).toContain("Components (Flow Order)");

    // Nodes are rendered in exact flat flow_order
    const nodeHeadings = screen.getAllByRole("heading", { level: 4 });
    expect(nodeHeadings.length).toBe(3);
    expect(nodeHeadings[0]?.textContent).toBe("Database Sink");
    expect(nodeHeadings[1]?.textContent).toBe("API Gateway");
    expect(nodeHeadings[2]?.textContent).toBe("Validation Worker");

    // Architecture list DOES show node types
    expect(screen.getByText("database")).toBeDefined();
    expect(screen.getByText("api_gateway")).toBeDefined();
    expect(screen.getByText("worker")).toBeDefined();
  });

  it("hermetic light/dark theme class assertions", () => {
    // 1. Light theme
    document.documentElement.className = "light";
    const { container: lightContainer, unmount: unmountLight } = render(
      <BlockFallbackList spec={layeredSpec} flowOrder={["node_ingest", "node_proc", "node_store"]} />,
    );

    const lightCard = lightContainer.querySelector("li");
    expect(lightCard?.className).toContain("border-line");
    expect(lightCard?.className).toContain("bg-surface");
    expect(lightCard?.className).toContain("dark:bg-card");

    const lightRole = lightContainer.querySelector("p");
    expect(lightRole?.className).toContain("text-text-muted");
    unmountLight();

    // 2. Dark theme
    document.documentElement.className = "dark";
    const { container: darkContainer, unmount: unmountDark } = render(
      <BlockFallbackList spec={layeredSpec} flowOrder={["node_ingest", "node_proc", "node_store"]} />,
    );

    const darkCard = darkContainer.querySelector("li");
    expect(darkCard?.className).toContain("border-line");
    expect(darkCard?.className).toContain("bg-surface");
    expect(darkCard?.className).toContain("dark:bg-card");
    unmountDark();
  });
});
