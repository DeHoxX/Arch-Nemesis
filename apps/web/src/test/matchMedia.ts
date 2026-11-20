import { vi } from "vitest";

export interface SetupMatchMediaOptions {
  /**
   * Whether (min-width: 768px) matches.
   * Default is true (desktop).
   */
  isDesktop?: boolean;
  /**
   * Optional custom predicate for query matching.
   */
  matches?: boolean | ((query: string) => boolean);
}

/**
 * Shared mock helper for window.matchMedia in JSDOM tests.
 * Configures window.matchMedia and returns a handle allowing dynamic updates.
 */
export function setupMatchMediaMock(options: SetupMatchMediaOptions = {}): {
  setDesktop: (isDesktop: boolean) => void;
  mock: ReturnType<typeof vi.fn>;
} {
  let desktop = options.isDesktop ?? true;

  const matchMediaMock = vi.fn().mockImplementation((query: string) => {
    let doesMatch = false;

    if (typeof options.matches === "function") {
      doesMatch = options.matches(query);
    } else if (typeof options.matches === "boolean") {
      doesMatch = options.matches;
    } else if (query.includes("min-width: 768px")) {
      doesMatch = desktop;
    } else if (query.includes("prefers-reduced-motion")) {
      doesMatch = false;
    }

    return {
      matches: doesMatch,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  });

  window.matchMedia = matchMediaMock as unknown as typeof window.matchMedia;

  return {
    setDesktop: (val: boolean) => {
      desktop = val;
    },
    mock: matchMediaMock,
  };
}
