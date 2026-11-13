"use client";

import { useCallback, useEffect, useState } from "react";

export interface UseFullscreenResult {
  isFullscreen: boolean;
  isFullscreenSupported: boolean;
  toggleFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
}

/**
 * useFullscreen: Safe browser Fullscreen API synchronization hook (Stage 1C+, D-333).
 *
 * Rules:
 * - Syncs state strictly from the "fullscreenchange" event (user can exit with Esc).
 * - Never relies solely on internal click state.
 * - Hides fullscreen control if document.fullscreenEnabled is false or requestFullscreen is missing.
 * - Catches promise rejection of requestFullscreen without throwing (e.g. user gesture denied).
 * - SSR safe: guards all document and window access.
 */
export function useFullscreen(
  targetRef: React.RefObject<HTMLDivElement | null>,
): UseFullscreenResult {
  const [isFullscreenSupported, setIsFullscreenSupported] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const target = targetRef.current;
    const hasRequestFullscreen = Boolean(
      (target && typeof target.requestFullscreen === "function") ||
      (typeof HTMLElement !== "undefined" &&
        typeof HTMLElement.prototype.requestFullscreen === "function") ||
      (typeof document !== "undefined" &&
        document.documentElement &&
        typeof document.documentElement.requestFullscreen === "function"),
    );
    const isSupported = Boolean(
      document.fullscreenEnabled && hasRequestFullscreen,
    );
    setIsFullscreenSupported(isSupported);

    const handleFullscreenChange = () => {
      const activeElement = document.fullscreenElement;
      setIsFullscreen(Boolean(activeElement && activeElement === targetRef.current));

      if (typeof window !== "undefined") {
        // Dispatch resize events immediately, on next rAF, and after transition settles
        // to prompt layout consumers (e.g. React Flow useResizeHandler) to re-measure.
        window.dispatchEvent(new Event("resize"));
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event("resize"));
        });
        setTimeout(() => {
          window.dispatchEvent(new Event("resize"));
        }, 200);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    // Initialize current state in case already fullscreen
    handleFullscreenChange();

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [targetRef]);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    const target = targetRef.current;
    if (!target) return;

    try {
      if (document.fullscreenElement) {
        if (typeof document.exitFullscreen === "function") {
          await document.exitFullscreen();
        }
      } else {
        if (typeof target.requestFullscreen === "function") {
          await target.requestFullscreen();
        }
      }
    } catch (err: unknown) {
      // Catch promise rejections (e.g. denied user gesture, browser permissions) without throwing
      console.warn("Fullscreen request rejected:", err);
    }
  }, [targetRef]);

  const exitFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    try {
      if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
        await document.exitFullscreen();
      }
    } catch (err: unknown) {
      console.warn("Exit fullscreen rejected:", err);
    }
  }, []);

  return {
    isFullscreen,
    isFullscreenSupported,
    toggleFullscreen,
    exitFullscreen,
  };
}

