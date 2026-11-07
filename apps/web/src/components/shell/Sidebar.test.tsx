import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
  Sidebar,
  shortTitle,
} from "./Sidebar";
import { AppShell, SIDEBAR_COLLAPSE_STORAGE_KEY } from "./AppShell";
import { HISTORY_STORAGE_KEY } from "@/lib/history";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

describe("Sidebar component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPathname = "/";
    window.localStorage.clear();
  });

  it("renders 'New design' button linking to /?new=1", () => {
    render(<Sidebar />);

    const newDesignLink = screen.getByRole("link", { name: /new design/i });
    expect(newDesignLink).toBeDefined();
    expect(newDesignLink.getAttribute("href")).toBe("/?new=1");
  });

  it("displays empty state 'No past designs yet' when localStorage history is empty", () => {
    render(<Sidebar />);

    expect(screen.getByText("No past designs yet")).toBeDefined();
  });

  it("renders past designs list from localStorage sorted newest first with shortened plain text titles and full title tooltip", () => {
    const historyData = [
      {
        design_id: "des-001",
        title: "Customer Support Assistant Architecture",
        created_at: "2026-10-25T10:00:00Z",
      },
      {
        design_id: "des-002",
        title: "Inventory Sync Pipeline",
        created_at: "2026-10-24T08:00:00Z",
      },
    ];
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyData));

    render(<Sidebar />);

    // Displayed text is shortened with word-boundary ellipsis
    expect(screen.getByText("Customer Support Assistant...")).toBeDefined();
    // Short title fits without ellipsis
    expect(screen.getByText("Inventory Sync Pipeline")).toBeDefined();

    const links = screen.getAllByRole("link");
    const designLinks = links.filter((link) =>
      link.getAttribute("href")?.startsWith("/design/"),
    );
    expect(designLinks).toHaveLength(2);
    expect(designLinks[0]?.getAttribute("href")).toBe("/design/des-001");
    // Tooltip title attribute holds the full stored title
    expect(designLinks[0]?.getAttribute("title")).toBe("Customer Support Assistant Architecture");
    expect(designLinks[1]?.getAttribute("href")).toBe("/design/des-002");
    expect(designLinks[1]?.getAttribute("title")).toBe("Inventory Sync Pipeline");
  });

  it("renders desktop collapse button and fires callback", async () => {
    const user = userEvent.setup();
    const handleCollapse = vi.fn();

    render(<Sidebar onCollapseDesktop={handleCollapse} isMobileDrawer={false} />);

    const collapseBtn = screen.getByRole("button", { name: "Collapse sidebar" });
    await user.click(collapseBtn);

    expect(handleCollapse).toHaveBeenCalledTimes(1);
  });

  it("renders mobile drawer with dialog role, aria-modal, and triggers close on close button and backdrop click", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    const { container } = render(
      <Sidebar isMobileDrawer={true} onCloseDrawer={handleClose} />,
    );

    const dialog = screen.getByRole("dialog", { name: "Navigation and past designs" });
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    const closeBtn = screen.getByRole("button", { name: "Close sidebar" });
    await user.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Backdrop click
    const backdrop = container.querySelector(".bg-black\\/60");
    expect(backdrop).toBeDefined();
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(handleClose).toHaveBeenCalledTimes(2);
    }
  });

  it("renders resizable drag handle with separator role and ARIA attributes on desktop", () => {
    render(<Sidebar isMobileDrawer={false} />);

    const handle = screen.getByRole("separator", { name: "Resize sidebar" });
    expect(handle).toBeDefined();
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-valuenow")).toBe(String(SIDEBAR_DEFAULT_WIDTH));
    expect(handle.getAttribute("aria-valuemin")).toBe(String(SIDEBAR_MIN_WIDTH));
    expect(handle.getAttribute("aria-valuemax")).toBe(String(SIDEBAR_MAX_WIDTH));
  });

  it("ignores corrupt non-numeric width in localStorage and falls back to default 256 px", () => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "invalid_nan");

    render(<Sidebar isMobileDrawer={false} />);

    const handle = screen.getByRole("separator", { name: "Resize sidebar" });
    expect(handle.getAttribute("aria-valuenow")).toBe(String(SIDEBAR_DEFAULT_WIDTH));
  });

  it("clamps width from localStorage within 200 and 420 px", () => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "500");

    render(<Sidebar isMobileDrawer={false} />);

    const handle = screen.getByRole("separator", { name: "Resize sidebar" });
    expect(handle.getAttribute("aria-valuenow")).toBe(String(SIDEBAR_MAX_WIDTH));
  });

  it("resizes sidebar via keyboard ArrowLeft and ArrowRight, persisting clamped value", () => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "256");

    render(<Sidebar isMobileDrawer={false} />);

    const handle = screen.getByRole("separator", { name: "Resize sidebar" });

    // ArrowLeft decreases by 16px
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(handle.getAttribute("aria-valuenow")).toBe("240");
    expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe("240");

    // ArrowRight increases by 16px
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle.getAttribute("aria-valuenow")).toBe("256");
    expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe("256");
  });

  it("cancels trailing resize timeout on unmount and does not fire after unmount", () => {
    vi.useFakeTimers();
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    const { unmount } = render(<Sidebar isMobileDrawer={false} />);
    const handle = screen.getByRole("separator", { name: "Resize sidebar" });

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    unmount();

    vi.advanceTimersByTime(300);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    dispatchSpy.mockRestore();
    vi.useRealTimers();
  });
});

describe("AppShell component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPathname = "/";
    window.innerWidth = 1024;
    window.localStorage.clear();
  });

  it("hides sidebar and toggle button completely on /admin routes", () => {
    mockPathname = "/admin";

    render(
      <AppShell>
        <div>Admin Content</div>
      </AppShell>,
    );

    expect(screen.getByText("Admin Content")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Toggle navigation sidebar" })).toBeNull();
    expect(screen.queryByText("Past designs")).toBeNull();
  });

  it("hides sidebar and toggle button completely on /admin/designs/* routes", () => {
    mockPathname = "/admin/designs/des-123/1";

    render(
      <AppShell>
        <div>Admin Design Inspection</div>
      </AppShell>,
    );

    expect(screen.getByText("Admin Design Inspection")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Toggle navigation sidebar" })).toBeNull();
    expect(screen.queryByText("Past designs")).toBeNull();
  });

  it("defaults to collapsed on /design/[id] routes with top-left toggle button available", () => {
    mockPathname = "/design/test-design-id";

    render(
      <AppShell>
        <div>Design Canvas</div>
      </AppShell>,
    );

    expect(screen.getByText("Design Canvas")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Collapse sidebar" })).toBeNull();

    const toggleBtn = screen.getByRole("button", { name: "Toggle navigation sidebar" });
    expect(toggleBtn).toBeDefined();
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");
  });

  it("expands sidebar when toggle button is clicked and persists preference to localStorage", async () => {
    const user = userEvent.setup();
    mockPathname = "/";
    window.localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, "true");

    render(
      <AppShell>
        <div>Home Content</div>
      </AppShell>,
    );

    const toggleBtn = screen.getByRole("button", { name: "Toggle navigation sidebar" });
    await user.click(toggleBtn);

    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeDefined();
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY)).toBe("false");
  });

  it("closes mobile drawer when Escape key is pressed", () => {
    mockPathname = "/";
    window.innerWidth = 500;

    render(
      <AppShell>
        <div>Mobile Content</div>
      </AppShell>,
    );

    const toggleBtn = screen.getByRole("button", { name: "Toggle navigation sidebar" });
    fireEvent.click(toggleBtn);

    expect(screen.getByRole("dialog", { name: "Navigation and past designs" })).toBeDefined();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Navigation and past designs" })).toBeNull();
    window.innerWidth = 1024;
  });

  it("cancels trailing toggle resize timeout on unmount and does not fire after unmount", () => {
    vi.useFakeTimers();
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    window.innerWidth = 1024;

    window.localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, "true");
    const { unmount } = render(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );

    const toggleBtn = screen.getByRole("button", { name: "Toggle navigation sidebar" });
    fireEvent.click(toggleBtn);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    unmount();

    vi.advanceTimersByTime(300);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    dispatchSpy.mockRestore();
    vi.useRealTimers();
  });
});

describe("shortTitle helper", () => {
  it("returns empty string for empty or whitespace-only titles", () => {
    expect(shortTitle("")).toBe("");
    expect(shortTitle("   ")).toBe("");
  });

  it("leaves short titles unchanged when within character and word limits", () => {
    expect(shortTitle("Simple App")).toBe("Simple App");
    expect(shortTitle("Telemetry Pipeline")).toBe("Telemetry Pipeline");
  });

  it("truncates long titles cleanly at word boundaries and appends ellipsis", () => {
    expect(shortTitle("Customer Support Assistant Architecture Pipeline")).toBe(
      "Customer Support Assistant...",
    );
  });

  it("preserves a single very long word without cutting in the middle", () => {
    const longWord = "Supercalifragilisticexpialidocious";
    expect(shortTitle(longWord)).toBe(longWord);
  });

  it("collapses extra whitespace between words and trims ends", () => {
    expect(shortTitle("   Telemetry    Data    Stream   ")).toBe(
      "Telemetry Data Stream",
    );
  });

  it("preserves hostile HTML/script strings as literal plain text", () => {
    const hostile = "<script>alert('xss')</script> System";
    const res = shortTitle(hostile);
    expect(res).toBe("<script>alert('xss')</script>...");
    expect(res).not.toContain("<script src");
  });

  it("handles Unicode and non-Latin text (Hindi) cleanly at word boundaries", () => {
    const hindiTitle = "ग्राहक सहायता प्रणाली वास्तुकला";
    expect(shortTitle(hindiTitle)).toBe("ग्राहक सहायता प्रणाली...");
  });
});
