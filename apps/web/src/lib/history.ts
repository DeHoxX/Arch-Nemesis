import { useCallback, useSyncExternalStore } from "react";
import { historyListSchema } from "./api";
import type { HistoryEntry } from "./types";

export const HISTORY_STORAGE_KEY = "archnemesis.history.v1";
export const HISTORY_MAX_ITEMS = 20;
export const HISTORY_TITLE_MAX_CHARS = 60;

const emptyHistory: HistoryEntry[] = [];
let cachedRaw: string | null = null;
let cachedEntries: HistoryEntry[] = [];

/**
 * Retrieve saved past designs from localStorage.
 *
 * Rules (BUILD_PLAN.md:506 & Stage 6C1):
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
  summary: string;
  created_at?: string;
}

/**
 * Save a newly created design to localStorage history.
 *
 * Rules (BUILD_PLAN.md:506 & Stage 6C1):
 * - Title is the first 60 characters of the brief summary
 * - Newest first (prepended to the list)
 * - Maximum 20 entries
 * - Deduplicates by design_id (replaces existing entry and moves to head)
 * - Guarded with try/catch against QuotaExceededError and SecurityError
 */
export function saveHistoryEntry(input: SaveHistoryInput): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const current = getHistory();
    const cleanTitle = (input.summary || "").trim().slice(0, HISTORY_TITLE_MAX_CHARS);
    const entry: HistoryEntry = {
      design_id: input.design_id,
      title: cleanTitle || "Untitled Architecture Design",
      created_at: input.created_at || new Date().toISOString(),
    };

    // Deduplicate by design_id and prepend newest
    const filtered = current.filter((item) => item.design_id !== input.design_id);
    const updated = [entry, ...filtered].slice(0, HISTORY_MAX_ITEMS);

    const serialized = JSON.stringify(updated);
    window.localStorage.setItem(HISTORY_STORAGE_KEY, serialized);
    cachedRaw = serialized;
    cachedEntries = updated;
  } catch {
    // Gracefully ignore storage quota or access errors in restricted modes
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
