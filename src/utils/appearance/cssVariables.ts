import type { AppearanceProfile } from "@shared/state/types";
import { inverseFor, mix, rgba, rgbList } from "./color";
import { DEFAULT_APPEARANCE, toThemeMode } from "./constants";
import { normalizeProfile } from "./normalize";

/** CSS custom property name → value, applied to `document.documentElement`. */
export type AppearanceCssVariables = Readonly<Record<`--${string}`, string>>;

// Keyed on profile identity (normalized profiles are cached by
// normalizeAppearance), one entry per resolved theme.
const variablesCache = new WeakMap<object, { dark?: AppearanceCssVariables; light?: AppearanceCssVariables }>();

/** Every theme token derived from a palette/typography profile. Pure and cached. */
export function buildAppearanceCssVariables(profile: unknown, resolvedTheme: unknown = "dark"): AppearanceCssVariables {
  const mode = toThemeMode(resolvedTheme);
  const cacheable = profile !== null && typeof profile === "object";
  const entry = cacheable ? variablesCache.get(profile) : undefined;
  const cached = entry?.[mode];
  if (cached) return cached;

  const variables = computeVariables(normalizeProfile(profile, DEFAULT_APPEARANCE.profiles[mode]), mode === "light");
  if (cacheable) variablesCache.set(profile, { ...entry, [mode]: variables });
  return variables;
}

function computeVariables(normalized: AppearanceProfile, isLight: boolean): AppearanceCssVariables {
  const p = normalized.palette;
  const t = normalized.typography;
  const textInverse = inverseFor(p.text);
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
