import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toPng } from "html-to-image";
import {
  COMPLIANCE_BANNER_TEXT,
  DEFAULT_EXPORT_BG_COLOR,
  buildExplanationMarkdown,
  dataUrlToBlob,
  downloadFile,
  exportDiagramToPng,
} from "./export";
import type { Explanation } from "./types";

vi.mock("html-to-image", () => ({
  toPng: vi.fn(),
}));

const mockFilledExplanation: Explanation = {
  overview: "This system processes incoming telemetry and generates analytics dashboards.",
  flow: [
    {
      step: 1,
      node_id: "ingest",
      node_name: "API Gateway",
      text: "Receives raw telemetry events from edge devices.",
    },
    {
      step: 2,
      node_id: "processor",
      node_name: "Stream Worker",
      text: "Normalizes event formats and filters invalid records.",
    },
  ],
  parts: [
    {
      node_id: "ingest",
      node_name: "API Gateway",
      text: "Handles incoming HTTP traffic and rate limits clients.",
    },
    {
      node_id: "processor",
      node_name: "Stream Worker",
      text: "Scalable worker pool running stream transformation jobs.",
    },
  ],
  checks: [
    {
      constraint_id: "bc1",
      text: "Must buffer incoming traffic before persistence.",
    },
    {
      constraint_id: "bc2",
      text: "Must sanitize all incoming payloads.",
    },
  ],
  models: {
    nodes: [],
    text: "No part is marked as using an AI model.",
  },
  source: "llm",
};

describe("Export Module: buildExplanationMarkdown", () => {
  it("builds exact Markdown structure for filled explanation with correct headings in order", () => {
    const markdown = buildExplanationMarkdown({
      designId: "design-xyz-123",
      versionNo: 2,
      explanation: mockFilledExplanation,
    });

    // 1. Design ID and version title
    expect(markdown).toContain("# Design design-xyz-123 (Version 2)");

    // 2. Exact compliance banner
    expect(markdown).toContain(`> ${COMPLIANCE_BANNER_TEXT}`);
    expect(markdown).toContain(
      "> Structurally checked, not guaranteed to be the best design. This is not a compliance claim."
    );

    // 3. Exact headings in order
    const overviewIdx = markdown.indexOf("## Overview");
    const flowIdx = markdown.indexOf("## How a request flows");
    const partsIdx = markdown.indexOf("## Each part");
    const checksIdx = markdown.indexOf("## Why the checks exist");
    const modelsIdx = markdown.indexOf("## Where AI models are used");

    expect(overviewIdx).toBeGreaterThan(0);
    expect(flowIdx).toBeGreaterThan(overviewIdx);
    expect(partsIdx).toBeGreaterThan(flowIdx);
    expect(checksIdx).toBeGreaterThan(partsIdx);
    expect(modelsIdx).toBeGreaterThan(checksIdx);

    // 4. Numbered flow steps
    expect(markdown).toContain(
      "1. **API Gateway**: Receives raw telemetry events from edge devices."
    );
    expect(markdown).toContain(
      "2. **Stream Worker**: Normalizes event formats and filters invalid records."
    );

    // 5. Bulleted parts
    expect(markdown).toContain(
      "- **API Gateway**: Handles incoming HTTP traffic and rate limits clients."
    );
    expect(markdown).toContain(
      "- **Stream Worker**: Scalable worker pool running stream transformation jobs."
    );

    // 6. Bulleted checks
    expect(markdown).toContain(
      "- **bc1**: Must buffer incoming traffic before persistence."
    );
    expect(markdown).toContain(
      "- **bc2**: Must sanitize all incoming payloads."
    );

    // 7. Models text
    expect(markdown).toContain("No part is marked as using an AI model.");
  });

  it("builds exact Markdown structure for null explanation (Option A)", () => {
    const markdown = buildExplanationMarkdown({
      designId: "design-empty-456",
      versionNo: 1,
      explanation: null,
    });

    expect(markdown).toContain("# Design design-empty-456 (Version 1)");
    expect(markdown).toContain(
      "> Structurally checked, not guaranteed to be the best design. This is not a compliance claim."
    );
    expect(markdown).toContain("## Overview");
    expect(markdown).toContain(
      "No explanation has been generated for this design yet. Open the Explanation tab to generate a plain-language walkthrough."
    );

    // Should not contain empty section placeholders if no explanation exists
    expect(markdown).not.toContain("## How a request flows");
  });

  it("renders hostile user strings literally as plain text without execution", () => {
    const hostileExplanation: Explanation = {
      overview: '<script id="evil-overview">alert("xss")</script> & <b>bold</b>',
      flow: [
        {
          step: 1,
          node_id: "hostile-node",
          node_name: '<img src=x onerror=alert("name")>',
          text: '<a href="javascript:alert(1)">Click me</a>',
        },
      ],
      parts: [
        {
          node_id: "hostile-node",
          node_name: "Normal Node",
          text: '<iframe src="evil.com"></iframe>',
        },
      ],
      checks: [
        {
          constraint_id: "<check-id>",
          text: "<alert>hostile check</alert>",
        },
      ],
      models: {
        nodes: [],
        text: "<svg onload=alert(1)>",
      },
      source: "llm",
    };

    const markdown = buildExplanationMarkdown({
      designId: "design-hostile",
      versionNo: 1,
      explanation: hostileExplanation,
    });

    // Content is rendered literally as string text
    expect(markdown).toContain('<script id="evil-overview">alert("xss")</script>');
    expect(markdown).toContain('1. **<img src=x onerror=alert("name")>**: <a href="javascript:alert(1)">Click me</a>');
    expect(markdown).toContain('- **Normal Node**: <iframe src="evil.com"></iframe>');
    expect(markdown).toContain("- **<check-id>**: <alert>hostile check</alert>");
    expect(markdown).toContain("<svg onload=alert(1)>");
  });
});

/**
 * jsdom-safe helpers to read Blob as ArrayBuffer and Text.
 *
 * In jsdom, Blob lacks .arrayBuffer() and .text() methods.
 * IMPORTANT: FileReader is the PRIMARY path. Passing a jsdom Blob to Node's
 * global Response constructor stringifies it to "[object Blob]" instead of
 * decoding binary bytes. Response is only a fallback if FileReader is absent.
 */
function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== "undefined") {
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = reader.result as ArrayBuffer;
        if (!buffer || buffer.byteLength < 8) {
          reject(
            new Error(
              `Blob ArrayBuffer read failed: buffer length is ${
                buffer ? buffer.byteLength : 0
              } bytes (expected at least 8 bytes)`
            )
          );
          return;
        }
        const bytes = new Uint8Array(buffer);
        // Guard: check if buffer was stringified to "[object Blob]"
        if (
          bytes[0] === 91 && // '['
          bytes[1] === 111 && // 'o'
          bytes[2] === 98 // 'b'
        ) {
          reject(
            new Error(
              'Blob ArrayBuffer read resulted in "[object Blob]" stringification instead of binary payload.'
            )
          );
          return;
        }
        resolve(buffer);
      };
      reader.onerror = () =>
        reject(
          reader.error ||
            new Error("FileReader failed to read Blob as ArrayBuffer")
        );
      reader.readAsArrayBuffer(blob);
      return;
    }

    if (typeof Response !== "undefined") {
      new Response(blob)
        .arrayBuffer()
        .then((buffer) => {
          if (!buffer || buffer.byteLength < 8) {
            reject(
              new Error(
                `Blob ArrayBuffer read failed via Response: buffer length is ${
                  buffer ? buffer.byteLength : 0
                } bytes`
              )
            );
            return;
          }
          resolve(buffer);
        })
        .catch(reject);
      return;
    }

    reject(
      new Error(
        "Neither FileReader nor Response is available to read Blob as ArrayBuffer"
      )
    );
  });
}

function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== "undefined") {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        if (text === "[object Blob]") {
          reject(
            new Error(
              'Blob text read returned "[object Blob]" instead of actual content.'
            )
          );
          return;
        }
        resolve(text);
      };
      reader.onerror = () =>
        reject(
          reader.error || new Error("FileReader failed to read Blob as text")
        );
      reader.readAsText(blob);
      return;
    }

    if (typeof Response !== "undefined") {
      new Response(blob)
        .text()
        .then((text) => {
          if (text === "[object Blob]") {
            reject(
              new Error(
                'Blob text read returned "[object Blob]" via Response instead of actual content.'
              )
            );
            return;
          }
          resolve(text);
        })
        .catch(reject);
      return;
    }

    reject(
      new Error(
        "Neither FileReader nor Response is available to read Blob as text"
      )
    );
  });
}

describe("Export Module: dataUrlToBlob and downloadFile", () => {
  beforeEach(() => {
    // Stub anchor click so jsdom does not trigger "Not implemented: navigation"
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Minimal valid 1x1 transparent PNG data URL
  const validPngDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  it("converts PNG data URL to a binary Blob with type image/png and valid PNG signature bytes", async () => {
    const blob = dataUrlToBlob(validPngDataUrl);
    expect(blob.type).toBe("image/png");

    const arrayBuffer = await readBlobAsArrayBuffer(blob);
    const bytes = new Uint8Array(arrayBuffer);

    // PNG standard magic bytes signature: 89 50 4E 47 (0x89, 0x50, 0x4e, 0x47)
    expect(bytes[0]).toBe(0x89); // 137
    expect(bytes[1]).toBe(0x50); // 80 ('P')
    expect(bytes[2]).toBe(0x4e); // 78 ('N')
    expect(bytes[3]).toBe(0x47); // 71 ('G')

    // Crucial check: binary Blob read as text NEVER starts with "data:"
    const textContent = await readBlobAsText(blob);
    expect(textContent.startsWith("data:")).toBe(false);
  });

  it("throws descriptive error when converting an invalid data URL missing a comma", () => {
    expect(() => dataUrlToBlob("data:image/png;base64invalid")).toThrow(
      "Invalid data URL format: missing comma"
    );
  });

  it("downloadFile converts data URL strings into binary Blobs instead of ASCII text Blobs", () => {
    let capturedBlob: Blob | null = null;
    let capturedUrl: string | null = null;
    let revokedUrl: string | null = null;

    const createObjectURL = vi.fn().mockImplementation((b: Blob) => {
      capturedBlob = b;
      capturedUrl = "blob:http://localhost/mock-uuid";
      return capturedUrl;
    });
    const revokeObjectURL = vi.fn().mockImplementation((url: string) => {
      revokedUrl = url;
    });

    const origCreate = window.URL.createObjectURL;
    const origRevoke = window.URL.revokeObjectURL;
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    try {
      downloadFile(validPngDataUrl, "arch-nemesis-test-123-v1.png", "image/png");

      expect(capturedBlob).not.toBeNull();
      expect(capturedBlob!.type).toBe("image/png");
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith(capturedUrl);
      expect(revokedUrl).toBe(capturedUrl);
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    } finally {
      window.URL.createObjectURL = origCreate;
      window.URL.revokeObjectURL = origRevoke;
    }
  });

  it("downloadFile handles markdown text as text/markdown without 'data:' prefix", async () => {
    let capturedBlob: Blob | null = null;
    const createObjectURL = vi.fn().mockImplementation((b: Blob) => {
      capturedBlob = b;
      return "blob:http://localhost/mock-md";
    });
    const revokeObjectURL = vi.fn();

    const origCreate = window.URL.createObjectURL;
    const origRevoke = window.URL.revokeObjectURL;
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    try {
      const sampleMd = "# Design 123 (Version 1)\n\n> Structurally checked...";
      downloadFile(sampleMd, "arch-nemesis-123-v1.md", "text/markdown;charset=utf-8");

      expect(capturedBlob).not.toBeNull();
      expect(capturedBlob!.type).toBe("text/markdown;charset=utf-8");
      const text = await readBlobAsText(capturedBlob!);
      expect(text.startsWith("data:")).toBe(false);
      expect(text).toContain("# Design 123 (Version 1)");
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/mock-md");
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    } finally {
      window.URL.createObjectURL = origCreate;
      window.URL.revokeObjectURL = origRevoke;
    }
  });
});

describe("Export Module: exportDiagramToPng background color resolution", () => {
  const validPngDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  let origCreateObjectURL: typeof window.URL.createObjectURL;
  let origRevokeObjectURL: typeof window.URL.revokeObjectURL;

  beforeEach(() => {
    vi.mocked(toPng).mockReset();
    vi.mocked(toPng).mockResolvedValue(validPngDataUrl);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    origCreateObjectURL = window.URL.createObjectURL;
    origRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/mock-png");
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    window.URL.createObjectURL = origCreateObjectURL;
    window.URL.revokeObjectURL = origRevokeObjectURL;
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty("--page-bg");
    document.documentElement.style.removeProperty("--background");
  });

  it("resolves backgroundColor from document --page-bg CSS variable", async () => {
    document.documentElement.style.setProperty("--page-bg", "#111111");

    const container = document.createElement("div");
    const viewport = document.createElement("div");
    viewport.className = "react-flow__viewport";
    container.appendChild(viewport);

    await exportDiagramToPng(container, "test-design", 1);

    expect(toPng).toHaveBeenCalledWith(
      viewport,
      expect.objectContaining({
        backgroundColor: "#111111",
      }),
    );
  });

  it("resolves backgroundColor from --background when --page-bg is empty", async () => {
    document.documentElement.style.setProperty("--background", "#222222");

    const container = document.createElement("div");
    const viewport = document.createElement("div");
    viewport.className = "react-flow__viewport";
    container.appendChild(viewport);

    await exportDiagramToPng(container, "test-design", 1);

    expect(toPng).toHaveBeenCalledWith(
      viewport,
      expect.objectContaining({
        backgroundColor: "#222222",
      }),
    );
  });

  it("falls back to DEFAULT_EXPORT_BG_COLOR (#111111) when neither CSS variable is set", async () => {
    const container = document.createElement("div");
    const viewport = document.createElement("div");
    viewport.className = "react-flow__viewport";
    container.appendChild(viewport);

    await exportDiagramToPng(container, "test-design", 1);

    expect(toPng).toHaveBeenCalledWith(
      viewport,
      expect.objectContaining({
        backgroundColor: DEFAULT_EXPORT_BG_COLOR,
      }),
    );
  });
});

