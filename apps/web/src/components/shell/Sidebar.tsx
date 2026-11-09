"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PanelLeftClose, Pin, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removeHistoryEntry, useHistory } from "@/lib/history";
import { removePin, togglePin, usePins } from "@/lib/pins";
import type { HistoryEntry } from "@/lib/types";

export const SIDEBAR_WIDTH_STORAGE_KEY = "archnemesis.sidebar.width";
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 420;
export const SIDEBAR_DEFAULT_WIDTH = 256;

export const SIDEBAR_TITLE_MAX_CHARS = 30;
export const SIDEBAR_TITLE_MAX_WORDS = 5;

/**
 * Pure helper for displaying concise past-design titles in the sidebar.
 *
 * Rules (D-259):
 * - Takes up to 4 to 5 words, at most about 30 characters
 * - Never cuts a word in the middle
 * - Appends "..." only if shortened
 * - Collapses extra whitespace
 * - Safe for hostile strings and unicode text
 */
export function shortTitle(
  title: string,
  maxChars = SIDEBAR_TITLE_MAX_CHARS,
  maxWords = SIDEBAR_TITLE_MAX_WORDS,
): string {
  const trimmed = title.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "";
  }

  const words = trimmed.split(" ");
  if (trimmed.length <= maxChars && words.length <= maxWords) {
    return trimmed;
  }

  const selected: string[] = [];
  let currentLength = 0;

  for (let i = 0; i < Math.min(words.length, maxWords); i++) {
    const word = words[i]!;
    const needed = selected.length === 0 ? word.length : word.length + 1;
    if (currentLength + needed <= maxChars) {
      selected.push(word);
      currentLength += needed;
    } else {
      break;
    }
  }

  if (selected.length === 0 && words.length > 0) {
    selected.push(words[0]!);
  }

  const result = selected.join(" ");
  const isShortened = result !== trimmed;
  return isShortened ? `${result}...` : result;
}

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
  const pins = usePins();

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Group into Pinned and Recents (D-270, D-271)
  // Pinned order = most recently pinned first (order in pins array)
  const historyMap = new Map(history.map((item) => [item.design_id, item]));
  const pinnedEntries = pins
    .map((id) => historyMap.get(id))
    .filter((item): item is HistoryEntry => Boolean(item));
  const pinnedIdsSet = new Set(pins);
  const recentEntries = history.filter((item) => !pinnedIdsSet.has(item.design_id));

  // Combined ordered entries for infinite scroll
  const allOrderedEntries = [...pinnedEntries, ...recentEntries];

  // Infinite scroll: 20 rows first, +20 on sentinel (D-272)
  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, allOrderedEntries.length));
        }
      },
      { rootMargin: "100px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [allOrderedEntries.length]);

  const isIntersectionSupported = typeof IntersectionObserver !== "undefined";
  const visibleEntriesSet = isIntersectionSupported
    ? new Set(allOrderedEntries.slice(0, visibleCount))
    : new Set(allOrderedEntries);
  const displayedPinned = pinnedEntries.filter((item) => visibleEntriesSet.has(item));
  const displayedRecent = recentEntries.filter((item) => visibleEntriesSet.has(item));

  // Desktop width state: start with SIDEBAR_DEFAULT_WIDTH on first render to match SSR (D-275)
  const [width, setWidth] = useState<number>(SIDEBAR_DEFAULT_WIDTH);

  // Sync saved preference after mount (D-275) to prevent hydration mismatch
  useEffect(() => {
    if (!isMobileDrawer) {
      const saved = loadSidebarWidthPreference();
      if (saved !== SIDEBAR_DEFAULT_WIDTH) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setWidth(saved);
      }
    }
  }, [isMobileDrawer]);

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

  const renderRow = (entry: HistoryEntry, isPinned: boolean) => {
    const isConfirming = confirmDeleteId === entry.design_id;

    if (isConfirming) {
      return (
        <li key={entry.design_id} className="relative">
          <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs bg-muted/60">
            <span className="text-muted-foreground text-xs">Remove?</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removePin(entry.design_id);
                  removeHistoryEntry(entry.design_id);
                  setConfirmDeleteId(null);
                }}
                className="px-2 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/10 rounded transition-colors"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setConfirmDeleteId(null);
                }}
                className="px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted rounded transition-colors"
              >
                No
              </button>
            </div>
          </div>
        </li>
      );
    }

    return (
      <li key={entry.design_id} className="relative group/row">
        <div className="flex items-center rounded-lg text-xs hover:bg-muted/50 focus-within:bg-muted/50 transition-colors">
          <Link
            href={`/design/${encodeURIComponent(entry.design_id)}`}
            onClick={handleNavigate}
            title={entry.title}
            className="flex-1 min-w-0 py-1.5 pl-2.5 pr-14 text-foreground/85 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-lg"
          >
            <span className="truncate block font-normal">
              {shortTitle(entry.title)}
            </span>
          </Link>
          <div className="absolute right-1 flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                togglePin(entry.design_id);
              }}
              aria-label={isPinned ? "Unpin design" : "Pin design"}
              title={isPinned ? "Unpin design" : "Pin design"}
              className={`p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors ${
                isPinned ? "text-foreground" : ""
              }`}
            >
              <Pin className={`size-3.5 ${isPinned ? "fill-current" : ""}`} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setConfirmDeleteId(entry.design_id);
              }}
              aria-label="Remove from list"
              title="Remove from list"
              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      </li>
    );
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

      {/* Past Designs List */}
      <div className="flex-1 overflow-y-auto pr-1 sidebar-scrollbar">
        {allOrderedEntries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
            No past designs yet
          </div>
        ) : (
          <div className="space-y-4">
            {displayedPinned.length > 0 && (
              <div>
                <div className="mb-1.5 px-2 text-[11px] font-medium text-muted-foreground/80 tracking-wide">
                  Pinned
                </div>
                <ul className="space-y-0.5" role="list" aria-label="Pinned designs">
                  {displayedPinned.map((entry) => renderRow(entry, true))}
                </ul>
              </div>
            )}

            {displayedRecent.length > 0 && (
              <div>
                <div className="mb-1.5 px-2 text-[11px] font-medium text-muted-foreground/80 tracking-wide">
                  Recents
                </div>
                <ul className="space-y-0.5" role="list" aria-label="Recent designs">
                  {displayedRecent.map((entry) => renderRow(entry, false))}
                </ul>
              </div>
            )}

            {visibleCount < allOrderedEntries.length && (
              <div ref={sentinelRef} className="h-4 w-full" aria-hidden="true" />
            )}
          </div>
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
      className="sticky top-0 h-screen shrink-0 border-r border-border/40 relative"
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
