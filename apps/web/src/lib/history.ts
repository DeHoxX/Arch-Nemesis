import { useCallback, useSyncExternalStore } from "react";
import { historyListSchema } from "./api";
import { getPins } from "./pins";
import type { HistoryEntry } from "./types";

export const HISTORY_STORAGE_KEY = "archnemesis.history.v1";
export const HISTORY_MAX_ITEMS = 200;
export const HISTORY_TITLE_MAX_CHARS = 60;

const emptyHistory: HistoryEntry[] = [];
let cachedRaw: string | null = null;
let cachedEntries: HistoryEntry[] = [];

function notifyHistoryChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("storage"));
  }
}

/**
 * Retrieve saved past designs from localStorage.
 *
 * Rules (BUILD_PLAN.md:506, Stage 6C1 & D-273):
 * - Key: archnemesis.history.v1
 * - Validated with Zod schema (historyListSchema)
 * - Corrupt data or storage errors return an empty array without crashing
 * - Safe for server-side execution (returns [] when window is undefined)
 */
export function getHistory(): HistoryEntry[] {
  if (typeof window === "undefined") {
    return emptyHistory;
  }

  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      return emptyHistory;
    }

    const parsed: unknown = JSON.parse(raw);
    const result = historyListSchema.safeParse(parsed);
    if (!result.success) {
      return emptyHistory;
    }

    return result.data;
  } catch {
    return emptyHistory;
  }
}

export interface SaveHistoryInput {
  design_id: string;
  summary?: string;
  title?: string;
  created_at?: string;
}

/**
 * Save a newly created design to localStorage history.
 *
 * Rules (BUILD_PLAN.md:506, Stage 6C1 & D-273):
 * - Title is the given title or first 60 characters of the brief summary
 * - Newest first (prepended to the list)
 * - Maximum 200 entries (D-273)
 * - Deduplicates by design_id (replaces existing entry and moves to head)
 * - Guarded with try/catch against QuotaExceededError and SecurityError
 */
export function saveHistoryEntry(input: SaveHistoryInput): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const current = getHistory();
    const rawTitle = input.title || input.summary || "";
    const cleanTitle = rawTitle.trim().slice(0, HISTORY_TITLE_MAX_CHARS);
    const entry: HistoryEntry = {
      design_id: input.design_id,
      title: cleanTitle || "Untitled Architecture Design",
      created_at: input.created_at || new Date().toISOString(),
    };

    // Deduplicate by design_id and prepend newest
    const filtered = current.filter((item) => item.design_id !== input.design_id);
    const combined = [entry, ...filtered];

    // Evict oldest unpinned entries first if over limit (D-340)
    let updated = combined;
    if (combined.length > HISTORY_MAX_ITEMS) {
      const pinnedIds = new Set(getPins());
      const excess = combined.length - HISTORY_MAX_ITEMS;
      const unpinnedEntries = combined.filter((item) => !pinnedIds.has(item.design_id));
      const toEvictCount = Math.min(excess, unpinnedEntries.length);
      const evictedSet = new Set(
        unpinnedEntries
          .slice(unpinnedEntries.length - toEvictCount)
          .map((item) => item.design_id)
      );
      updated = combined.filter((item) => !evictedSet.has(item.design_id));
      if (updated.length > HISTORY_MAX_ITEMS) {
        updated = updated.slice(0, HISTORY_MAX_ITEMS);
      }
    }

    const serialized = JSON.stringify(updated);
    window.localStorage.setItem(HISTORY_STORAGE_KEY, serialized);
    cachedRaw = serialized;
    cachedEntries = updated;
    notifyHistoryChange();
  } catch {
    // Gracefully ignore storage quota or access errors in restricted modes
  }
}

/**
 * Remove an entry from history by design_id.
 */
export function removeHistoryEntry(designId: string): void {
  if (typeof window === "undefined" || !designId) {
    return;
  }

  try {
    const current = getHistory();
    const updated = current.filter((item) => item.design_id !== designId);
    const serialized = JSON.stringify(updated);
    window.localStorage.setItem(HISTORY_STORAGE_KEY, serialized);
    cachedRaw = serialized;
    cachedEntries = updated;
    notifyHistoryChange();
  } catch {
    // Gracefully ignore
  }
}

/**
 * Update the title of an existing history entry.
 */
export function updateHistoryEntryTitle(designId: string, newTitle: string): void {
  if (typeof window === "undefined" || !designId || !newTitle) {
    return;
  }

  try {
    const current = getHistory();
    const clean = newTitle.trim().slice(0, HISTORY_TITLE_MAX_CHARS);
    let changed = false;
    const updated = current.map((item) => {
      if (item.design_id === designId && item.title !== clean) {
        changed = true;
        return { ...item, title: clean };
      }
      return item;
    });

    if (changed) {
      const serialized = JSON.stringify(updated);
      window.localStorage.setItem(HISTORY_STORAGE_KEY, serialized);
      cachedRaw = serialized;
      cachedEntries = updated;
      notifyHistoryChange();
    }
  } catch {
    // Gracefully ignore
  }
}

/**
 * Update multiple history entry titles from a batch mapping.
 *
 * Rules (D-274):
 * - Never adds missing entries
 * - Never removes entries missing from the titles map
 * - Only updates when the returned title is non-empty and differs
 */
export function batchUpdateHistoryTitles(titles: Record<string, string>): void {
  if (typeof window === "undefined" || !titles || Object.keys(titles).length === 0) {
    return;
  }

  try {
    const current = getHistory();
    let changed = false;
    const updated = current.map((item) => {
      const serverTitle = titles[item.design_id];
      if (serverTitle && serverTitle.trim() && serverTitle.trim() !== item.title) {
        changed = true;
        return {
          ...item,
          title: serverTitle.trim().slice(0, HISTORY_TITLE_MAX_CHARS),
        };
      }
      return item;
    });

    if (changed) {
      const serialized = JSON.stringify(updated);
      window.localStorage.setItem(HISTORY_STORAGE_KEY, serialized);
      cachedRaw = serialized;
      cachedEntries = updated;
      notifyHistoryChange();
    }
  } catch {
    // Gracefully ignore
  }
}

/**
 * Clear stored history (useful for test isolation and user control).
 */
export function clearHistory(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    cachedRaw = null;
    cachedEntries = emptyHistory;
    notifyHistoryChange();
  } catch {
    // Gracefully ignore
  }
}

function getHistorySnapshot(): HistoryEntry[] {
  if (typeof window === "undefined") {
    return emptyHistory;
  }
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedEntries = getHistory();
    }
    return cachedEntries;
  } catch {
    return emptyHistory;
  }
}

function getServerHistorySnapshot(): HistoryEntry[] {
  return emptyHistory;
}

/**
 * Hydration-safe React hook subscribing to localStorage history via useSyncExternalStore.
 */
export function useHistory(): HistoryEntry[] {
  const subscribe = useCallback((onStoreChange: () => void) => {
    if (typeof window === "undefined") {
      return () => {};
    }
    window.addEventListener("storage", onStoreChange);
    return () => {
      window.removeEventListener("storage", onStoreChange);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    getHistorySnapshot,
    getServerHistorySnapshot
  );
}
