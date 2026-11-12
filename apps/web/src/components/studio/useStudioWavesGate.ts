"use client";

import { useEffect, useState } from "react";

export interface UseStudioWavesGateOptions {
  enabled?: boolean;
}

/**
 * useStudioWavesGate: Controls post-mount Waves background visibility.
 *
 * Rules (D-351, D-352, D-355):
 * - Activates only on desktop (>= 768px) and when prefers-reduced-motion is false.
 * - Uses MediaQueryList "change" listeners only; NEVER attaches a window "resize" listener (D-352).
 * - Defensive against SSR and environments where window.matchMedia is undefined.
 * - If enabled is false, returns false immediately and registers no listeners.
 */
export function useStudioWavesGate(enabled: boolean = true): boolean {
  const [isDesktopAndActive, setIsDesktopAndActive] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const motionQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const desktopQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(min-width: 768px)")
        : null;

    const update = () => {
      const reduced = motionQuery ? motionQuery.matches : false;
      const isDesktop = desktopQuery
        ? desktopQuery.matches
        : window.innerWidth >= 768;
      setIsDesktopAndActive(!reduced && isDesktop);
    };

    update();
    motionQuery?.addEventListener?.("change", update);
    desktopQuery?.addEventListener?.("change", update);

    return () => {
      motionQuery?.removeEventListener?.("change", update);
      desktopQuery?.removeEventListener?.("change", update);
    };
  }, [enabled]);

  return enabled && isDesktopAndActive;
}
