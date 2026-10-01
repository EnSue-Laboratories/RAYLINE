import type {
  Appearance,
  AppearancePaletteKey,
  AppearanceTypographyKey,
  ThemeMode,
} from "@shared/state/types";

export const APPEARANCE_VERSION = 3;
export const LOGO_RED = "#FF4422";

export const FONT_UI = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const FONT_CONTENT = "'Newsreader', 'Iowan Old Style', Georgia, serif";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export interface FontOption {
  readonly value: string;
  readonly label: string;
}

export const FONT_OPTIONS: Readonly<Record<"ui" | "content" | "mono", readonly FontOption[]>> = {
  ui: [
    { value: FONT_UI, label: "System" },
    { value: "'Inter Tight', system-ui, sans-serif", label: "Inter Tight" },
    { value: "'Lato', system-ui, sans-serif", label: "Lato" },
  ],
  content: [
    { value: FONT_CONTENT, label: "Newsreader" },
    { value: "Georgia, 'Times New Roman', serif", label: "Georgia" },
    { value: FONT_UI, label: "System" },
  ],
  mono: [
    { value: FONT_MONO, label: "JetBrains Mono" },
    { value: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", label: "System Mono" },
    { value: "Menlo, Monaco, Consolas, monospace", label: "Menlo" },
  ],
};

export const DEFAULT_APPEARANCE: Readonly<Appearance> = Object.freeze({
  version: APPEARANCE_VERSION,
  profiles: {
    dark: {
      palette: {
        background: "#0D0D10",
        pane: "#0D0D10",
        surface: "#161618",
        surfaceStrong: "#202025",
        border: "#FFFFFF",
        accent: "#FFFFFF",
        success: "#6EE7A8",
        danger: "#F87171",
        warning: "#F0B450",
        text: "#FFFFFF",
      },
      typography: {
        uiFont: FONT_UI,
        contentFont: FONT_CONTENT,
        monoFont: FONT_MONO,
      },
    },
    light: {
      palette: {
        background: "#F7F4EE",
        pane: "#F7F4EE",
        surface: "#FFFFFF",
        surfaceStrong: "#E8DED3",
        border: "#1F2937",
        accent: "#1A1C1F",
        success: "#15803D",
        danger: "#DC2626",
        warning: "#B45309",
        text: "#1A1C1F",
      },
      typography: {
        uiFont: FONT_UI,
        contentFont: FONT_CONTENT,
        monoFont: FONT_MONO,
      },
    },
  },
});

export const PALETTE_KEYS: readonly AppearancePaletteKey[] = [
  "background",
  "pane",
  "surface",
  "surfaceStrong",
  "border",
  "accent",
  "success",
  "danger",
  "warning",
  "text",
];

export const TYPOGRAPHY_KEYS: readonly AppearanceTypographyKey[] = ["uiFont", "contentFont", "monoFont"];

/** Pre-v3 default accents, reset to the current default on migration. */
export const LEGACY_DEFAULT_ACCENTS: Readonly<Record<ThemeMode, readonly string[]>> = {
  dark: ["#339CFF", "#FF4422"],
  light: ["#2563EB", "#FF4422"],
};

/** Anything other than "light" renders the dark profile. */
export function toThemeMode(resolvedTheme: unknown): ThemeMode {
  return resolvedTheme === "light" ? "light" : "dark";
}
