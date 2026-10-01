import type {
  Appearance,
  AppearancePaletteKey,
  AppearanceProfile,
  AppearanceTypographyKey,
  ThemeMode,
} from "@shared/state/types";
import { expandHex } from "./color";
import {
  APPEARANCE_VERSION,
  DEFAULT_APPEARANCE,
  LEGACY_DEFAULT_ACCENTS,
  PALETTE_KEYS,
  TYPOGRAPHY_KEYS,
  toThemeMode,
} from "./constants";

type UnknownRecord = Readonly<Record<string, unknown>>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function normalizeColor(value: unknown, fallback: string): string {
  return expandHex(value) || fallback;
}

/** Rejects empty, overlong, or CSS-injecting (`;{}` / newline) font stacks. */
export function normalizeFont(value: unknown, fallback: string): string {
  const next = typeof value === "string" ? value.trim() : "";
  if (!next || next.length > 180 || /[;{}\n\r]/.test(next)) return fallback;
  return next;
}

export interface NormalizeProfileOptions {
  theme?: ThemeMode;
  /** Reset a pre-v3 default accent to the current default. */
  migrateLegacyAccent?: boolean;
}

export function normalizeProfile(
  profile: unknown,
  fallback: AppearanceProfile,
  options: NormalizeProfileOptions = {},
): AppearanceProfile {
  const source = asRecord(profile);
  const paletteSource = asRecord(source.palette);
  const typographySource = asRecord(source.typography);
  const legacyAccents = options.theme ? LEGACY_DEFAULT_ACCENTS[options.theme] : [];

  const palette = {} as Record<AppearancePaletteKey, string>;
  for (const key of PALETTE_KEYS) {
    const normalizedColor = normalizeColor(paletteSource[key], fallback.palette[key]);
    palette[key] = key === "accent" && options.migrateLegacyAccent && legacyAccents.includes(normalizedColor)
      ? fallback.palette[key]
      : normalizedColor;
  }
  const typography = {} as Record<AppearanceTypographyKey, string>;
  for (const key of TYPOGRAPHY_KEYS) {
    typography[key] = normalizeFont(typographySource[key], fallback.typography[key]);
  }

  return { palette, typography };
}

// Normalization runs on every appearance effect and several times per call
// chain (apply → profile → window background). Cache by input identity and
// map each result to itself so re-normalizing is O(1). Results must be
// treated as immutable (all callers already build new objects to edit).
const normalizedCache = new WeakMap<object, Appearance>();

function buildNormalizedAppearance(source: UnknownRecord): Appearance {
  const sourceVersion = Number.isFinite(Number(source.version)) ? Number(source.version) : 0;
  const migrateLegacyAccent = sourceVersion > 0 && sourceVersion < APPEARANCE_VERSION;
  const profiles = asRecord(source.profiles);
  return {
    version: APPEARANCE_VERSION,
    profiles: {
      dark: normalizeProfile(profiles.dark, DEFAULT_APPEARANCE.profiles.dark, { theme: "dark", migrateLegacyAccent }),
      light: normalizeProfile(profiles.light, DEFAULT_APPEARANCE.profiles.light, { theme: "light", migrateLegacyAccent }),
    },
  };
}

/** Fill defaults, validate colors/fonts and migrate older versions. Accepts anything. */
export function normalizeAppearance(value?: unknown): Appearance {
  if (!value || typeof value !== "object") return buildNormalizedAppearance({});
  const cached = normalizedCache.get(value);
  if (cached) return cached;
  const normalized = buildNormalizedAppearance(value as UnknownRecord);
  normalizedCache.set(value, normalized);
  normalizedCache.set(normalized, normalized);
  return normalized;
}

export function getAppearanceProfile(appearance: unknown, resolvedTheme: unknown): AppearanceProfile {
  return normalizeAppearance(appearance).profiles[toThemeMode(resolvedTheme)];
}

/** Native window background (the pane color) for the resolved theme. */
export function getAppearanceWindowBackground(appearance: unknown, resolvedTheme: unknown = "dark"): string {
  return getAppearanceProfile(appearance, resolvedTheme).palette.pane;
}
