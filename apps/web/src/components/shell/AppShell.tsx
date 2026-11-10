"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { postDesignTitles } from "@/lib/api";
import { batchUpdateHistoryTitles, getHistory } from "@/lib/history";
import { Sidebar } from "./Sidebar";

export const SIDEBAR_COLLAPSE_STORAGE_KEY = "archnemesis.sidebar.collapsed";

/**
 * Legacy storage helper retained for backwards compatibility with tests and callers.
 * Note: Under D-311, the sidebar is default-closed on desktop and state is not persisted.
 */
export function loadSidebarCollapsedPreference(): boolean | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Legacy storage helper retained for backwards compatibility with tests and callers.
 */
export function saveSidebarCollapsedPreference(collapsed: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSE_STORAGE_KEY,
      collapsed ? "true" : "false",
    );
  } catch {
    // Gracefully ignore storage quota or access errors
  }
}

interface AppShellInnerProps {
  children: React.ReactNode;
}

function AppShellInner({ children }: AppShellInnerProps): React.ReactElement {
  const pathname = usePathname() || "/";

  // Visibility rules (D-253, D-311):
  // 1. /admin and /admin/*: completely hidden
  // 2. All other routes: present and closed by default on desktop
  const isAdmin = pathname.startsWith("/admin");

  // Collapse state management: sidebar is always closed by default on desktop (D-311).
  // The state is in-memory for the current session and not persisted across page reloads.
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);

  // Mobile drawer state (< 768px)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Reset drawer and keep collapsed on route transition without cascading renders
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsDrawerOpen(false);
    setIsCollapsed(true);
  }

  // Handle keyboard Escape to close mobile drawer
  useEffect(() => {
    if (!isDrawerOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawerOpen]);

  // Batch sync past design titles from backend once per page load (D-274)
  const hasSyncedTitlesRef = useRef(false);
  useEffect(() => {
    if (hasSyncedTitlesRef.current) return;
    hasSyncedTitlesRef.current = true;

    const entries = getHistory();
    if (entries.length === 0) return;

    const ids = entries.map((e) => e.design_id).slice(0, 200);
    postDesignTitles(ids)
      .then((titles) => {
        batchUpdateHistoryTitles(titles);
      })
      .catch(() => {
        // Silent on failure (no error UI, no retry loop)
      });
  }, []);

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

  // Notify diagram canvases (React Flow) to refit on sidebar toggle
  const triggerCanvasResize = useCallback(() => {
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
    }, 220);
  }, []);

  const handleToggleDesktop = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      triggerCanvasResize();
      return next;
    });
  };

  const handleOpenMobileDrawer = () => {
    setIsDrawerOpen(true);
  };

  const handleCloseMobileDrawer = () => {
    setIsDrawerOpen(false);
  };

  // If on admin routes, render content unadorned
  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <div className="relative flex min-h-screen w-full bg-page-bg">
      {/* Desktop Sidebar (visible on >= 768px when not collapsed) */}
      <div className="hidden md:block">
        {!isCollapsed && (
          <Sidebar
            onCollapseDesktop={handleToggleDesktop}
            isMobileDrawer={false}
          />
        )}
      </div>

      {/* Mobile Drawer (visible on < 768px when opened) */}
      {isDrawerOpen && (
        <Sidebar
          onCloseDrawer={handleCloseMobileDrawer}
          isMobileDrawer={true}
        />
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Toggle Button: rendered on desktop when collapsed, and on mobile when drawer is closed */}
        {(isCollapsed || !isDrawerOpen) && (
          <div
            className={`fixed top-3 left-3 z-40 ${
              isCollapsed ? "block" : "block md:hidden"
            }`}
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                // Check if running on mobile or desktop viewport
                if (window.innerWidth < 768) {
                  handleOpenMobileDrawer();
                } else {
                  handleToggleDesktop();
                }
              }}
              aria-label="Toggle navigation sidebar"
              aria-expanded={!isCollapsed || isDrawerOpen}
              aria-controls="app-sidebar"
              className="size-8 rounded-lg border-border/60 bg-sidebar-bg text-muted-foreground shadow-md hover:bg-card hover:text-foreground"
            >
              <PanelLeft className="size-4" />
            </Button>
          </div>
        )}

        {/* Page Content */}
        {children}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Suspense fallback={<>{children}</>}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}
