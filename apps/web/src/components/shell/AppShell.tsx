"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./Sidebar";

export const SIDEBAR_COLLAPSE_STORAGE_KEY = "archnemesis.sidebar.collapsed";

/**
 * Retrieve saved sidebar collapse state from localStorage.
 *
 * Rules:
 * - Scoped to browser localStorage (archnemesis.sidebar.collapsed)
 * - Safe for SSR (returns false if window is undefined)
 * - Strict checking ("true" -> true, "false" -> false, otherwise null)
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
 * Save sidebar collapse preference to localStorage.
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

  // Visibility rules (D-253):
  // 1. /admin and /admin/*: completely hidden
  // 2. /design/*: present but default-collapsed with top-left toggle
  // 3. / and /history: present and open by default on desktop
  const isAdmin = pathname.startsWith("/admin");
  const isDesign = pathname.startsWith("/design/");

  // Collapse state management
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (isDesign) {
      return true;
    }
    const saved = loadSidebarCollapsedPreference();
    return saved !== null ? saved : false;
  });

  // Mobile drawer state (< 768px)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Sync state on route transition without useEffect cascading renders
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsDrawerOpen(false);
    if (isDesign) {
      setIsCollapsed(true);
    } else if (!isAdmin) {
      const saved = loadSidebarCollapsedPreference();
      setIsCollapsed(saved !== null ? saved : false);
    }
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
      saveSidebarCollapsedPreference(next);
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
    <div className="relative flex min-h-screen w-full bg-[var(--page-bg)]">
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
              className="size-8 rounded-lg border-border/60 bg-[var(--sidebar-bg)] text-muted-foreground shadow-md hover:bg-card hover:text-foreground"
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
