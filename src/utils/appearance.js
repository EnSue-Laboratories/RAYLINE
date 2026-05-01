export const APPEARANCE_VERSION = 3;
export const LOGO_RED = "#FF4422";

const FONT_UI = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FONT_CONTENT = "'Newsreader', 'Iowan Old Style', Georgia, serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const FONT_OPTIONS = {
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

export const DEFAULT_APPEARANCE = Object.freeze({
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

const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const PROFILE_KEYS = ["dark", "light"];
const PALETTE_KEYS = [
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
const TYPOGRAPHY_KEYS = ["uiFont", "contentFont", "monoFont"];
const LEGACY_DEFAULT_ACCENTS = {
  dark: ["#339CFF", "#FF4422"],
  light: ["#2563EB", "#FF4422"],
};

function expandHex(value) {
  const trimmed = String(value || "").trim();
  if (!COLOR_RE.test(trimmed)) return null;
  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toUpperCase();
  }
  return trimmed.toUpperCase();
}

export function isValidHexColor(value) {
  return Boolean(expandHex(value));
}

function normalizeColor(value, fallback) {
  return expandHex(value) || fallback;
}

function normalizeFont(value, fallback) {
  const next = typeof value === "string" ? value.trim() : "";
  if (!next || next.length > 180 || /[;{}\n\r]/.test(next)) return fallback;
  return next;
}

function normalizeProfile(profile, fallback, options = {}) {
  const source = profile && typeof profile === "object" ? profile : {};
  const paletteSource = source.palette && typeof source.palette === "object" ? source.palette : {};
  const typographySource = source.typography && typeof source.typography === "object" ? source.typography : {};
  const palette = {};
  const typography = {};

  for (const key of PALETTE_KEYS) {
    const normalizedColor = normalizeColor(paletteSource[key], fallback.palette[key]);
    const legacyAccents = LEGACY_DEFAULT_ACCENTS[options.theme] || [];
    palette[key] = key === "accent" &&
      options.migrateLegacyAccent &&
      legacyAccents.includes(normalizedColor)
      ? fallback.palette[key]
      : normalizedColor;
  }
  for (const key of TYPOGRAPHY_KEYS) {
    typography[key] = normalizeFont(typographySource[key], fallback.typography[key]);
  }

  return { palette, typography };
}

export function normalizeAppearance(value) {
  const source = value && typeof value === "object" ? value : {};
  const sourceVersion = Number.isFinite(Number(source.version)) ? Number(source.version) : 0;
  const migrateLegacyAccent = sourceVersion > 0 && sourceVersion < APPEARANCE_VERSION;
  return {
    version: APPEARANCE_VERSION,
    profiles: {
      dark: normalizeProfile(source.profiles?.dark, DEFAULT_APPEARANCE.profiles.dark, { theme: "dark", migrateLegacyAccent }),
      light: normalizeProfile(source.profiles?.light, DEFAULT_APPEARANCE.profiles.light, { theme: "light", migrateLegacyAccent }),
    },
  };
}

export function getAppearanceProfile(appearance, resolvedTheme) {
  const normalized = normalizeAppearance(appearance);
  return normalized.profiles[resolvedTheme === "light" ? "light" : "dark"];
}

function hexToRgb(hex) {
  const normalized = expandHex(hex) || "#000000";
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbList(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}

function rgba(hex, alpha) {
  return `rgba(${rgbList(hex)}, ${alpha})`;
}

function mix(hexA, hexB, weightB = 0.5) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const weightA = 1 - weightB;
  const toHex = (channel) => Math.round(channel).toString(16).padStart(2, "0");
  return `#${toHex(a.r * weightA + b.r * weightB)}${toHex(a.g * weightA + b.g * weightB)}${toHex(a.b * weightA + b.b * weightB)}`.toUpperCase();
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const convert = (value) => {
    const next = value / 255;
    return next <= 0.03928 ? next / 12.92 : ((next + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
}

function inverseFor(text) {
  return luminance(text) > 0.5 ? "#111111" : "#FFFFFF";
}

export function buildAppearanceCssVariables(profile, resolvedTheme = "dark") {
  const mode = resolvedTheme === "light" ? "light" : "dark";
  const fallback = DEFAULT_APPEARANCE.profiles[mode];
  const normalized = normalizeProfile(profile, fallback);
  const p = normalized.palette;
  const t = normalized.typography;
  const textInverse = inverseFor(p.text);
  const isLight = mode === "light";
  const subtleAlpha = isLight ? 0.54 : 0.46;
  const borderAlpha = isLight ? 0.14 : 0.08;
  const strongBorderAlpha = isLight ? 0.22 : 0.16;
  const hoverAlpha = isLight ? 0.08 : 0.08;
  const controlAlpha = isLight ? 0.065 : 0.055;
  const controlStrongAlpha = isLight ? 0.12 : 0.11;
  const overlayAlpha = isLight ? 0.88 : 0.82;

  return {
    "--font-ui": t.uiFont,
    "--font-content": t.contentFont,
    "--font-mono": t.monoFont,

    "--bg-primary": p.background,
    "--bg-secondary": rgba(p.pane, isLight ? 0.72 : 0.5),
    "--bg-tertiary": rgba(p.text, controlAlpha),
    "--app-background": p.background,
    "--pane-background": p.pane,
    "--pane-background-rgb": rgbList(p.pane),
    "--pane-overlay-alpha": String(overlayAlpha),
    "--pane-background-overlay": `rgba(${rgbList(p.pane)}, ${overlayAlpha})`,
    "--pane-hover-overlay": rgba(mix(p.pane, p.text, isLight ? 0.08 : 0.035), overlayAlpha),
    "--pane-active-overlay": rgba(mix(p.pane, p.text, isLight ? 0.12 : 0.055), overlayAlpha),
    "--pane-elevated-rgb": rgbList(p.surface),
    "--pane-elevated": rgba(p.surface, isLight ? 0.76 : 0.56),
    "--pane-hover": rgba(p.text, hoverAlpha),
    "--pane-active": rgba(p.text, isLight ? 0.12 : 0.1),
    "--pane-border": rgba(p.border, borderAlpha),

    "--surface-glass": rgba(p.surface, isLight ? 0.94 : 0.92),
    "--overlay-bg": rgba(p.background, isLight ? 0.45 : 0.58),
    "--overlay-surface": rgba(p.surface, isLight ? 0.98 : 0.96),
    "--hover-overlay": rgba(p.text, hoverAlpha),
    "--border": rgba(p.border, borderAlpha),
    "--border-strong": rgba(p.border, strongBorderAlpha),
    "--shadow-sm": `0 4px 12px ${rgba("#000000", isLight ? 0.14 : 0.38)}`,
    "--shadow-md": `0 18px 48px ${rgba("#000000", isLight ? 0.18 : 0.42)}`,

    "--text-primary": rgba(p.text, isLight ? 0.92 : 0.9),
    "--text-secondary": rgba(p.text, isLight ? 0.68 : 0.62),
    "--text-tertiary": rgba(p.text, isLight ? 0.6 : 0.52),
    "--text-subtle": rgba(p.text, subtleAlpha),
    "--text-muted": rgba(p.text, isLight ? 0.45 : 0.3),
    "--text-disabled": rgba(p.text, isLight ? 0.32 : 0.18),
    "--text-faint": rgba(p.text, isLight ? 0.24 : 0.14),
    "--text-inverse": textInverse,

    "--control-bg": rgba(p.text, controlAlpha),
    "--control-bg-soft": rgba(p.text, isLight ? 0.045 : 0.035),
    "--control-bg-subtle": rgba(p.text, isLight ? 0.035 : 0.025),
    "--control-bg-strong": rgba(p.text, controlStrongAlpha),
    "--control-bg-active": rgba(p.text, isLight ? 0.15 : 0.1),
    "--control-bg-contrast": rgba(p.surfaceStrong, isLight ? 0.72 : 0.5),
    "--control-bg-selected": rgba(p.accent, isLight ? 0.12 : 0.18),
    "--control-border": rgba(p.border, borderAlpha),
    "--control-border-soft": rgba(p.border, isLight ? 0.1 : 0.055),
    "--control-border-strong": rgba(p.border, strongBorderAlpha),
    "--control-border-active": rgba(p.accent, isLight ? 0.42 : 0.36),
    "--control-border-hover": rgba(p.accent, isLight ? 0.32 : 0.28),
    "--control-highlight": rgba(p.accent, isLight ? 0.16 : 0.18),
    "--control-thumb-bg": rgba(p.text, isLight ? 0.74 : 0.78),

    "--accent": p.accent,
    "--accent-bg": rgba(p.accent, isLight ? 0.12 : 0.18),
    "--accent-bg-strong": rgba(p.accent, isLight ? 0.18 : 0.28),
    "--accent-border": rgba(p.accent, isLight ? 0.28 : 0.38),
    "--accent-muted": rgba(p.accent, isLight ? 0.68 : 0.72),
    "--accent-text": p.accent,
    "--success-bg": rgba(p.success, isLight ? 0.12 : 0.16),
    "--success-border": rgba(p.success, isLight ? 0.28 : 0.32),
    "--success-ring": rgba(p.success, isLight ? 0.18 : 0.12),
    "--success-text": p.success,
    "--success-text-strong": mix(p.success, isLight ? "#000000" : "#FFFFFF", 0.18),
    "--danger-bg": rgba(p.danger, isLight ? 0.11 : 0.15),
    "--danger-bg-soft": rgba(p.danger, isLight ? 0.08 : 0.1),
    "--danger-border": rgba(p.danger, isLight ? 0.28 : 0.34),
    "--danger-border-strong": rgba(p.danger, isLight ? 0.42 : 0.48),
    "--danger-text": p.danger,
    "--danger-text-strong": mix(p.danger, isLight ? "#000000" : "#FFFFFF", 0.18),
    "--danger-soft-bg": rgba(p.danger, isLight ? 0.08 : 0.12),
    "--danger-soft-border": rgba(p.danger, isLight ? 0.18 : 0.22),
    "--danger-soft-text": p.danger,
    "--warning-bg": rgba(p.warning, isLight ? 0.12 : 0.14),
    "--warning-bg-strong": rgba(p.warning, isLight ? 0.18 : 0.22),
    "--warning-border": rgba(p.warning, isLight ? 0.3 : 0.32),
    "--warning-text": p.warning,
    "--state-warning-text": p.warning,
    "--state-warning-soft-bg": rgba(p.warning, isLight ? 0.1 : 0.14),
    "--state-warning-soft-border": rgba(p.warning, isLight ? 0.2 : 0.22),
    "--state-warning-soft-text": p.warning,
    "--state-info-soft-bg": rgba(p.accent, isLight ? 0.1 : 0.1),
    "--state-info-soft-border": rgba(p.accent, isLight ? 0.18 : 0.18),
    "--state-info-soft-text": p.accent,
    "--badge-open-bg": rgba(p.success, isLight ? 0.12 : 0.16),
    "--badge-open-border": rgba(p.success, isLight ? 0.24 : 0.3),
    "--badge-open-text": p.success,
    "--link-text": p.accent,
    "--link-text-hover": mix(p.accent, isLight ? "#000000" : "#FFFFFF", 0.2),
    "--loading-dot-bg": rgba(p.text, isLight ? 0.42 : 0.34),
    "--mono-dimmed": rgba(p.text, isLight ? 0.62 : 0.43),
    "--mono-faint": rgba(p.text, isLight ? 0.52 : 0.38),

    "--code-bg": rgba(p.text, isLight ? 0.045 : 0.035),
    "--code-border": rgba(p.border, isLight ? 0.1 : 0.06),
    "--code-text": rgba(p.text, isLight ? 0.9 : 0.92),
    "--mermaid-bg": rgba(p.surface, isLight ? 0.72 : 0.42),
    "--mermaid-node-border": rgba(p.border, isLight ? 0.18 : 0.1),
    "--mermaid-text": rgba(p.text, isLight ? 0.72 : 0.56),
    "--mermaid-primary": p.surface,
    "--mermaid-primary-text": rgba(p.text, isLight ? 0.9 : 0.9),
    "--mermaid-line": rgba(p.text, isLight ? 0.32 : 0.35),
    "--mermaid-secondary": p.surfaceStrong,
    "--aurora-bg": p.background,
    "--aurora-glow": rgba(p.text, isLight ? 0.035 : 0.018),

    "--term-background": p.background,
    "--term-foreground": rgba(p.text, isLight ? 0.88 : 0.88),
    "--term-cursor": rgba(p.text, isLight ? 0.96 : 0.98),
    "--term-selection-background": rgba(p.accent, isLight ? 0.18 : 0.18),
    "--term-selection-inactive-background": rgba(p.accent, isLight ? 0.1 : 0.1),
    "--term-black": isLight ? "#EEE8D5" : "#1D1F21",
    "--term-red": isLight ? "#DC322F" : "#CC6666",
    "--term-green": isLight ? "#859900" : "#B5BD68",
    "--term-yellow": isLight ? "#B58900" : "#F0C674",
    "--term-blue": isLight ? "#268BD2" : "#81A2BE",
    "--term-magenta": isLight ? "#D33682" : "#B294BB",
    "--term-cyan": isLight ? "#2AA198" : "#8ABEB7",
    "--term-white": isLight ? "#073642" : "#C5C8C6",
    "--term-bright-black": isLight ? "#002B36" : "#666666",
    "--term-bright-red": isLight ? "#CB4B16" : "#D54E53",
    "--term-bright-green": isLight ? "#586E75" : "#B9CA4A",
    "--term-bright-yellow": isLight ? "#657B83" : "#E7C547",
    "--term-bright-blue": isLight ? "#839496" : "#7AA6DA",
    "--term-bright-magenta": isLight ? "#6C71C4" : "#C397D8",
    "--term-bright-cyan": isLight ? "#93A1A1" : "#70C0B1",
    "--term-bright-white": isLight ? "#FDF6E3" : "#EAEAEA",

    "--term-bg": "var(--term-background)",
    "--term-fg": "var(--term-foreground)",
    "--term-selection": "var(--term-selection-background)",
    "--term-brightBlack": "var(--term-bright-black)",
    "--term-brightRed": "var(--term-bright-red)",
    "--term-brightGreen": "var(--term-bright-green)",
    "--term-brightYellow": "var(--term-bright-yellow)",
    "--term-brightBlue": "var(--term-bright-blue)",
    "--term-brightMagenta": "var(--term-bright-magenta)",
    "--term-brightCyan": "var(--term-bright-cyan)",
    "--term-brightWhite": "var(--term-bright-white)",
  };
}

export function applyAppearanceToDocument(appearance, resolvedTheme = "dark", target) {
  const root = target || (typeof document !== "undefined" ? document.documentElement : null);
  if (!root?.style) return normalizeAppearance(appearance);
  const normalized = normalizeAppearance(appearance);
  const profile = getAppearanceProfile(normalized, resolvedTheme);
  const vars = buildAppearanceCssVariables(profile, resolvedTheme);
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("rayline:appearance-change", {
      detail: { resolved: resolvedTheme === "light" ? "light" : "dark", appearance: normalized },
    }));
  }
  return normalized;
}

export function getAppearanceWindowBackground(appearance, resolvedTheme = "dark") {
  const normalized = normalizeAppearance(appearance);
  return getAppearanceProfile(normalized, resolvedTheme).palette.pane;
}

export function applyAppearanceWindowBackground(appearance, resolvedTheme = "dark", bridge) {
  const windowBackground = getAppearanceWindowBackground(appearance, resolvedTheme);

  if (typeof document !== "undefined") {
    document.documentElement.style.backgroundColor = windowBackground;
    document.body?.style.setProperty("background-color", windowBackground);
    document.getElementById("root")?.style.setProperty("background-color", windowBackground);
  }

  const windowBridge = bridge || (typeof window !== "undefined" ? (window.api || window.ghApi) : null);
  windowBridge?.setWindowBackgroundColor?.(windowBackground);
  return windowBackground;
}
