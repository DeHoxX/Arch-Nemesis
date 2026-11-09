import { useCallback, useSyncExternalStore } from "react";
import { z } from "zod";

export const PINS_STORAGE_KEY = "archnemesis.pins.v1";

const pinsSchema = z.array(z.string());

const emptyPins: string[] = [];
let cachedRaw: string | null = null;
let cachedPins: string[] = [];

/**
 * Retrieve pinned design IDs from localStorage.
 *
 * Rules (D-271):
 * - Key: archnemesis.pins.v1
 * - Zod validated array of design IDs
 * - Corrupt data or storage errors return empty array
 * - Safe for SSR (returns [] if window is undefined)
 */
export function getPins(): string[] {
  if (typeof window === "undefined") {
    return emptyPins;
  }

  try {
    const raw = window.localStorage.getItem(PINS_STORAGE_KEY);
    if (!raw) {
      return emptyPins;
    }
    const parsed: unknown = JSON.parse(raw);
    const result = pinsSchema.safeParse(parsed);
    if (!result.success) {
      return emptyPins;
    }
    return result.data;
  } catch {
    return emptyPins;
  }
}

function notifyStorageChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("storage"));
  }
}

/**
 * Toggle pin status of a design ID.
 *
 * Rules (D-271):
 * - If already pinned, removes it
 * - If unpinned, prepends it (most recently pinned first)
 */
export function togglePin(designId: string): void {
  if (typeof window === "undefined" || !designId) {
    return;
  }

  try {
    const current = getPins();
    let updated: string[];
    if (current.includes(designId)) {
      updated = current.filter((id) => id !== designId);
    } else {
      updated = [designId, ...current.filter((id) => id !== designId)];
    }

    const serialized = JSON.stringify(updated);
    window.localStorage.setItem(PINS_STORAGE_KEY, serialized);
    cachedRaw = serialized;
    cachedPins = updated;
    notifyStorageChange();
  } catch {
    // Gracefully ignore storage quota or access errors
  }
}

/**
 * Remove a design ID from pins (e.g. when entry is deleted).
 */
export function removePin(designId: string): void {
  if (typeof window === "undefined" || !designId) {
    return;
  }

  try {
    const current = getPins();
    if (!current.includes(designId)) {
      return;
    }
    const updated = current.filter((id) => id !== designId);
    const serialized = JSON.stringify(updated);
    window.localStorage.setItem(PINS_STORAGE_KEY, serialized);
    cachedRaw = serialized;
    cachedPins = updated;
    notifyStorageChange();
  } catch {
    // Gracefully ignore storage quota or access errors
  }
}

function getPinsSnapshot(): string[] {
  if (typeof window === "undefined") {
    return emptyPins;
  }
  try {
    const raw = window.localStorage.getItem(PINS_STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedPins = getPins();
    }
    return cachedPins;
  } catch {
    return emptyPins;
  }
}

function getServerPinsSnapshot(): string[] {
  return emptyPins;
}

/**
 * Hydration-safe React hook subscribing to localStorage pins via useSyncExternalStore.
 */
export function usePins(): string[] {
  const subscribe = useCallback((onStoreChange: () => void) => {
    if (typeof window === "undefined") {
      return () => {};
    }
    window.addEventListener("storage", onStoreChange);
    return () => {
      window.removeEventListener("storage", onStoreChange);
    };
  }, []);

  return useSyncExternalStore(subscribe, getPinsSnapshot, getServerPinsSnapshot);
}

