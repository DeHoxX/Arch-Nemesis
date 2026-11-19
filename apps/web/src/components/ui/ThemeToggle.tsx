"use client";

import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps): React.ReactElement {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg border border-line bg-surface text-foreground transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer select-none",
        className
      )}
    >
      {isLight ? (
        <Moon className="size-4 shrink-0 transition-transform duration-150" />
      ) : (
        <Sun className="size-4 shrink-0 transition-transform duration-150" />
      )}
    </button>
  );
}
