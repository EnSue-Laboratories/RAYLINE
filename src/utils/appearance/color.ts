/** Pure hex-color math used to derive the theme's CSS variables. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` / `#AABBCC` → `#AABBCC`; null for anything else. */
export function expandHex(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!COLOR_RE.test(trimmed)) return null;
  if (trimmed.length === 4) {
    const [, r = "", g = "", b = ""] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return trimmed.toUpperCase();
}

export function isValidHexColor(value: unknown): boolean {
  return Boolean(expandHex(value));
}

/** Invalid input is treated as black. */
export function hexToRgb(hex: string): Rgb {
  const normalized = expandHex(hex) || "#000000";
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

/** `"r, g, b"` for use inside `rgba(...)`. */
export function rgbList(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}

export function rgba(hex: string, alpha: number): string {
  return `rgba(${rgbList(hex)}, ${alpha})`;
}

/** Linear sRGB mix; `weightB` = share of `hexB` (0–1). */
export function mix(hexA: string, hexB: string, weightB = 0.5): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const weightA = 1 - weightB;
  const toHex = (channel: number) => Math.round(channel).toString(16).padStart(2, "0");
  return `#${toHex(a.r * weightA + b.r * weightB)}${toHex(a.g * weightA + b.g * weightB)}${toHex(a.b * weightA + b.b * weightB)}`.toUpperCase();
}

/** WCAG relative luminance (0–1). */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const convert = (value: number) => {
    const next = value / 255;
    return next <= 0.03928 ? next / 12.92 : ((next + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
}

/** Readable text color on top of `text`-colored fills. */
export function inverseFor(text: string): string {
  return luminance(text) > 0.5 ? "#111111" : "#FFFFFF";
}
