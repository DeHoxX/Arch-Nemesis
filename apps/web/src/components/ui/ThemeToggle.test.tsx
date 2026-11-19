import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./ThemeToggle";
import { THEME_STORAGE_KEY, setTheme } from "@/lib/useTheme";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "dark";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("renders with 'Switch to light theme' aria-label when theme is dark", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Switch to light theme" });
    expect(button).toBeDefined();
    expect(button.getAttribute("type")).toBe("button");
  });

  it("renders with 'Switch to dark theme' aria-label when theme is light", () => {
    act(() => {
      setTheme("light");
    });

    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Switch to dark theme" });
    expect(button).toBeDefined();
  });

  it("toggles html class and localStorage 'arch-theme' on click", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");

    // Initially dark
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);

    // Click to toggle to light
    act(() => {
      fireEvent.click(button);
    });

    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(button.getAttribute("aria-label")).toBe("Switch to dark theme");

    // Click to toggle back to dark
    act(() => {
      fireEvent.click(button);
    });

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(button.getAttribute("aria-label")).toBe("Switch to light theme");
  });

  it("supports keyboard interactions via Enter and Space", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");

    // Press Enter to toggle
    act(() => {
      fireEvent.keyDown(button, { key: "Enter", code: "Enter" });
      fireEvent.click(button);
    });

    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    // Press Space to toggle
    act(() => {
      fireEvent.keyDown(button, { key: " ", code: "Space" });
      fireEvent.click(button);
    });

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});
