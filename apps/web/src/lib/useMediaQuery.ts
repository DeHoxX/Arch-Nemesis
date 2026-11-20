import { useCallback, useSyncExternalStore } from "react";

/**
 * Responsive media query hook backed by useSyncExternalStore.
 * Safe for SSR and environments lacking window.matchMedia.
 */
export function useMediaQuery(query: string, serverFallback = true): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (
        typeof window === "undefined" ||
        !("matchMedia" in window) ||
        typeof window.matchMedia !== "function"
      ) {
        return () => {};
      }
      const media = window.matchMedia(query);
      media.addEventListener("change", callback);
      return () => media.removeEventListener("change", callback);
    },
    [query]
  );

  const getSnapshot = () => {
    if (
      typeof window === "undefined" ||
      !("matchMedia" in window) ||
      typeof window.matchMedia !== "function"
    ) {
      return serverFallback;
    }
    return window.matchMedia(query).matches;
  };

  const getServerSnapshot = () => serverFallback;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
