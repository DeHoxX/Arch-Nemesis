import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "arch-theme";

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getThemeFromStorage(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") {
    return;
  }
  if (theme === "light") {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
  } else {
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
  }
}

export function initTheme(): Theme {
  const theme = getThemeFromStorage();
  applyTheme(theme);
  return theme;
}

export function setTheme(theme: Theme): void {
  const resolved: Theme = theme === "light" ? "light" : "dark";
  applyTheme(resolved);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, resolved);
    } catch {
      // Safe fallback if localStorage is disabled, restricted, or throws
    }
  }
  notify();
}

export function toggleTheme(): void {
  const current = getSnapshot();
  setTheme(current === "light" ? "dark" : "light");
}

export function getSnapshot(): Theme {
  if (typeof document === "undefined") {
    return "dark";
  }
  const hasLight = document.documentElement.classList.contains("light");
  const hasDark = document.documentElement.classList.contains("dark");
  return hasLight && !hasDark ? "light" : "dark";
}

export function getServerSnapshot(): Theme {
  return "dark";
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      const newTheme: Theme = event.newValue === "light" ? "light" : "dark";
      applyTheme(newTheme);
      listener();
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

export function useTheme(): {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
} {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    theme,
    setTheme,
    toggleTheme,
  };
}
