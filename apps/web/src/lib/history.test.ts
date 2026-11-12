import { beforeEach, describe, expect, it } from "vitest";
import {
  HISTORY_MAX_ITEMS,
  HISTORY_STORAGE_KEY,
  batchUpdateHistoryTitles,
  clearHistory,
  getHistory,
  saveHistoryEntry,
} from "./history";
import { MAX_PINS, getPins, togglePin } from "./pins";

describe("History Helper Module", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty array when nothing is stored", () => {
    expect(getHistory()).toEqual([]);
  });

  it("saves a valid design entry and retrieves it", () => {
    saveHistoryEntry({
      design_id: "design-001",
      summary: "A robust payment processing service with stripe webhooks",
      created_at: "2026-10-31T00:00:00.000Z",
    });

    const items = getHistory();
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      design_id: "design-001",
      title: "A robust payment processing service with stripe webhooks",
      created_at: "2026-10-31T00:00:00.000Z",
    });
  });

  it("truncates title to first 60 characters of the brief summary", () => {
    const longSummary =
      "This is a very long business summary that definitely exceeds the sixty characters limit mandated by Phase 6 specification";
    expect(longSummary.length).toBeGreaterThan(60);

    saveHistoryEntry({
      design_id: "design-002",
      summary: longSummary,
    });

    const items = getHistory();
    expect(items[0]).toBeDefined();
    expect(items[0]!.title).toBe(longSummary.slice(0, 60));
    expect(items[0]!.title.length).toBe(60);
  });

  it("orders entries newest first", () => {
    saveHistoryEntry({
      design_id: "design-1",
      summary: "First system",
    });
    saveHistoryEntry({
      design_id: "design-2",
      summary: "Second system",
    });

    const items = getHistory();
    expect(items).toHaveLength(2);
    expect(items[0]!.design_id).toBe("design-2");
    expect(items[1]!.design_id).toBe("design-1");
  });

  it("deduplicates by design_id and moves latest save to head", () => {
    saveHistoryEntry({
      design_id: "design-1",
      summary: "Original summary",
    });
    saveHistoryEntry({
      design_id: "design-2",
      summary: "Another system",
    });
    saveHistoryEntry({
      design_id: "design-1",
      summary: "Updated summary",
    });

    const items = getHistory();
    expect(items).toHaveLength(2);
    expect(items[0]!.design_id).toBe("design-1");
    expect(items[0]!.title).toBe("Updated summary");
    expect(items[1]!.design_id).toBe("design-2");
  });

  it("caps history at maximum 200 entries", () => {
    for (let i = 1; i <= 210; i++) {
      saveHistoryEntry({
        design_id: `design-${i}`,
        summary: `System number ${i}`,
      });
    }

    const items = getHistory();
    expect(items).toHaveLength(HISTORY_MAX_ITEMS);
    expect(items[0]!.design_id).toBe("design-210");
    expect(items[199]!.design_id).toBe("design-11");
  });

  it("batchUpdateHistoryTitles updates changed titles only and never adds or removes entries", () => {
    saveHistoryEntry({ design_id: "d1", summary: "Old Title One" });
    saveHistoryEntry({ design_id: "d2", summary: "Old Title Two" });

    // d1 has new title, d3 is unknown to local history, d2 is missing from response
    batchUpdateHistoryTitles({
      d1: "New AI Title",
      d3: "Unknown Server Title",
    });

    const items = getHistory();
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.design_id === "d1")?.title).toBe("New AI Title");
    expect(items.find((i) => i.design_id === "d2")?.title).toBe("Old Title Two");
    expect(items.find((i) => i.design_id === "d3")).toBeUndefined();
  });

  it("safely ignores corrupt JSON in localStorage and returns empty array", () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, "this-is-not-valid-json{{{");
    expect(getHistory()).toEqual([]);
  });

  it("safely ignores schema-mismatched data structure in localStorage", () => {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify([{ invalid_key: 12345 }])
    );
    expect(getHistory()).toEqual([]);
  });

  it("clearHistory removes the storage key", () => {
    saveHistoryEntry({ design_id: "d1", summary: "Test" });
    expect(getHistory()).toHaveLength(1);
    clearHistory();
    expect(getHistory()).toHaveLength(0);
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBeNull();
  });

  it("preserves pinned entries when history exceeds 200 items (D-340)", () => {
    // Save design-1 first, then pin it
    saveHistoryEntry({ design_id: "pinned-1", summary: "Critical Architecture" });
    togglePin("pinned-1");
    expect(getPins()).toContain("pinned-1");

    // Save 205 other designs to push history over 200 items
    for (let i = 1; i <= 205; i++) {
      saveHistoryEntry({
        design_id: `unpinned-${i}`,
        summary: `Unpinned system ${i}`,
      });
    }

    const items = getHistory();
    expect(items).toHaveLength(HISTORY_MAX_ITEMS);
    // Pinned entry was preserved despite being older than 205 subsequent items
    const hasPinned = items.some((item) => item.design_id === "pinned-1");
    expect(hasPinned).toBe(true);

    // Oldest unpinned items (unpinned-1 through unpinned-6) were evicted instead
    const hasOldestUnpinned = items.some((item) => item.design_id === "unpinned-1");
    expect(hasOldestUnpinned).toBe(false);
  });

  it("enforces MAX_PINS cap of 25 in pins helper (D-340)", () => {
    for (let i = 1; i <= MAX_PINS; i++) {
      const res = togglePin(`pin-${i}`);
      expect(res).toBe(true);
    }
    expect(getPins()).toHaveLength(MAX_PINS);

    // 26th pin attempt is blocked
    const overflowRes = togglePin("pin-26");
    expect(overflowRes).toBe(false);
    expect(getPins()).toHaveLength(MAX_PINS);
    expect(getPins()).not.toContain("pin-26");

    // Unpinning an existing pin succeeds and reduces count
    const unpinRes = togglePin("pin-1");
    expect(unpinRes).toBe(true);
    expect(getPins()).toHaveLength(MAX_PINS - 1);
  });
});
