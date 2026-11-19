import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  getSnapshot,
  getThemeFromStorage,
  initTheme,
  setTheme,
  useTheme,
} from "./useTheme";

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    vi.restoreAllMocks();
  });

  it("defaults to dark when storage is empty and no theme classes are set", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    expect(getSnapshot()).toBe("dark");
  });

  it("reads light theme when documentElement has light class and no dark class", () => {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
    expect(getSnapshot()).toBe("light");
  });

  it("persists theme change to classList and localStorage via setTheme", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      setTheme("light");
    });

    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(result.current.theme).toBe("light");

    act(() => {
      result.current.setTheme("dark");
    });

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(result.current.theme).toBe("dark");
  });

  it("handles throwing localStorage safely without interrupting classList updates", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError: storage access denied");
    });

    const { result } = renderHook(() => useTheme());

    expect(() => {
      act(() => {
        result.current.setTheme("light");
      });
    }).not.toThrow();

    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("resolves corrupt or unknown storage values to dark theme", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "corrupt_theme_value_xyz");

    const theme = initTheme();

    expect(theme).toBe("dark");
    expect(getThemeFromStorage()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(getSnapshot()).toBe("dark");
  });
});
