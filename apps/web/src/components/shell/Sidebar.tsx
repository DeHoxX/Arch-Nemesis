"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clock, PanelLeftClose, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHistory } from "@/lib/history";

export const SIDEBAR_WIDTH_STORAGE_KEY = "archnemesis.sidebar.width";
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 420;
export const SIDEBAR_DEFAULT_WIDTH = 256;

export function loadSidebarWidthPreference(): number {
  if (typeof window === "undefined") {
    return SIDEBAR_DEFAULT_WIDTH;
  }
  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) return SIDEBAR_DEFAULT_WIDTH;
    const parsed = Number(raw);
    if (isNaN(parsed) || !isFinite(parsed)) return SIDEBAR_DEFAULT_WIDTH;
    return Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, Math.round(parsed)),
    );
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

export function saveSidebarWidthPreference(width: number): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const clamped = Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)),
    );
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
  } catch {
    // Gracefully ignore storage quota or access errors
  }
}

export interface SidebarProps {
  onCloseDrawer?: () => void;
  onCollapseDesktop?: () => void;
  isMobileDrawer?: boolean;
}

export function Sidebar({
  onCloseDrawer,
  onCollapseDesktop,
  isMobileDrawer = false,
}: SidebarProps): React.ReactElement {
  const history = useHistory();

  // Desktop width state
  const [width, setWidth] = useState<number>(() => {
    return isMobileDrawer ? SIDEBAR_DEFAULT_WIDTH : loadSidebarWidthPreference();
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(width);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up any pending trailing resize timeout on unmount
  useEffect(() => {
    return () => {
      if (resizeTimeoutRef.current !== null) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
    };
  }, []);

  const triggerResizeEvent = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("resize"));
    if (resizeTimeoutRef.current !== null) {
      clearTimeout(resizeTimeoutRef.current);
    }
    resizeTimeoutRef.current = setTimeout(() => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("resize"));
      }
      resizeTimeoutRef.current = null;
    }, 200);
  }, []);

  // Update width and persist
  const updateWidth = useCallback(
    (newWidth: number) => {
      const clamped = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, Math.round(newWidth)),
      );
      setWidth(clamped);
      saveSidebarWidthPreference(clamped);
      triggerResizeEvent();
    },
    [triggerResizeEvent],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = width;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const delta = e.clientX - dragStartXRef.current;
    const targetWidth = dragStartWidthRef.current + delta;
    const clamped = Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, Math.round(targetWidth)),
    );
    setWidth(clamped);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsDragging(false);
    setWidth((current) => {
      saveSidebarWidthPreference(current);
      triggerResizeEvent();
      return current;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      updateWidth(width - 16);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      updateWidth(width + 16);
    }
  };

  const handleNavigate = () => {
    if (isMobileDrawer && onCloseDrawer) {
      onCloseDrawer();
    }
  };

  const content = (
    <div className="flex h-full w-full flex-col bg-[var(--sidebar-bg)] p-3 text-foreground select-none">
      {/* Top Header Row */}
      <div className="mb-3 flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-muted-foreground/60" aria-hidden="true" />
          <span className="text-xs font-semibold tracking-tight text-foreground">
            Arch-Nemesis
          </span>
        </div>
        {isMobileDrawer ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCloseDrawer}
            aria-label="Close sidebar"
            className="size-7 rounded-md text-muted-foreground hover:bg-card/60 hover:text-foreground"
          >
            <X className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCollapseDesktop}
            aria-label="Collapse sidebar"
            className="size-7 rounded-md text-muted-foreground hover:bg-card/60 hover:text-foreground"
          >
            <PanelLeftClose className="size-4" />
          </Button>
        )}
      </div>

      {/* New Design Action (BUILD_PLAN N1 / ?new=1) */}
      <div className="mb-4">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 border-border/60 bg-card/40 text-xs font-medium text-foreground hover:bg-card/80"
        >
          <Link href="/?new=1" onClick={handleNavigate}>
            <Plus className="size-3.5 shrink-0" />
            <span>New design</span>
          </Link>
        </Button>
      </div>

      {/* Past Designs Section Header */}
      <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        <Clock className="size-3" aria-hidden="true" />
        <span>Past designs</span>
      </div>

      {/* Past Designs List */}
      <div className="flex-1 overflow-y-auto pr-1">
        {history.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
            No past designs yet
          </div>
        ) : (
          <ul className="space-y-1" role="list" aria-label="Past designs">
            {history.map((entry) => (
              <li key={entry.design_id}>
                <Link
                  href={`/design/${encodeURIComponent(entry.design_id)}`}
                  onClick={handleNavigate}
                  title={entry.title}
                  className="group flex flex-col rounded-lg px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground"
                >
                  <span className="truncate font-medium text-foreground/90 group-hover:text-foreground">
                    {entry.title}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/60">
                    {entry.created_at
                      ? new Date(entry.created_at).toLocaleDateString(undefined, {
                          dateStyle: "short",
                        })
                      : "Recent"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  if (isMobileDrawer) {
    return (
      <div
        className="fixed inset-0 z-50 flex md:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation and past designs"
      >
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/60 transition-opacity"
          onClick={onCloseDrawer}
          aria-hidden="true"
        />

        {/* Drawer Panel */}
        <aside
          id="app-sidebar"
          className="relative z-50 flex h-full w-64 flex-col border-r border-border/60 shadow-2xl"
        >
          {content}
        </aside>
      </div>
    );
  }

  return (
    <aside
      id="app-sidebar"
      className="sticky top-0 h-screen shrink-0 border-r border-border/40 relative group"
      style={{ width: `${width}px` }}
    >
      {content}

      {/* Desktop Drag Handle */}
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-label="Resize sidebar"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
        className={`absolute top-0 right-0 bottom-0 w-2 cursor-col-resize z-20 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
          isDragging
            ? "bg-muted-foreground/60"
            : "hover:bg-muted-foreground/30 active:bg-muted-foreground/50"
        }`}
      />
    </aside>
  );
}
