/**
 * Shared test helpers for apps/web test suites.
 */

/**
 * Normalises a CSS or SVG colour representation to a standard 6-digit lowercase hex string (#rrggbb).
 * Supports lowercase or uppercase 3- and 6-digit hex strings (e.g. #f43f5e, #FFF) and rgb/rgba strings
 * (e.g. "rgb(244, 63, 94)", "rgba(244, 63, 94, 0.6)").
 * Returns trimmed lowercase fallback if format is unrecognised.
 */
export function normalizeColorToHex(color: string | null | undefined): string {
  if (!color) return "";
  const trimmed = color.trim().toLowerCase();

  // 6-digit hex (#rrggbb)
  if (/^#[0-9a-f]{6}$/.test(trimmed)) {
    return trimmed;
  }

  // 3-digit hex (#rgb -> #rrggbb)
  const hex3Match = trimmed.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (hex3Match) {
    const r = hex3Match[1] ?? "0";
    const g = hex3Match[2] ?? "0";
    const b = hex3Match[3] ?? "0";
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  // rgb(r, g, b) or rgba(r, g, b, ...)
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = Math.min(255, Math.max(0, parseInt(rgbMatch[1] ?? "0", 10)));
    const g = Math.min(255, Math.max(0, parseInt(rgbMatch[2] ?? "0", 10)));
    const b = Math.min(255, Math.max(0, parseInt(rgbMatch[3] ?? "0", 10)));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  return trimmed;
}

