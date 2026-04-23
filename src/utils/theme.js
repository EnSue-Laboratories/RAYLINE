const DEFAULT_THEME_MODE = "auto";
const FALLBACK_THEME = "dark";
export const THEME_PREFERENCE_VERSION = 2;

export function normalizeTheme(theme) {
  return theme === "light" ? "light" : FALLBACK_THEME;
}

export function normalizeThemeMode(themeMode) {
  return themeMode === "light" || themeMode === "dark" || themeMode === "auto"
    ? themeMode
    : DEFAULT_THEME_MODE;
}

export function getSystemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return FALLBACK_THEME;
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : FALLBACK_THEME;
}

export function detectDefaultTheme() {
  return DEFAULT_THEME_MODE;
}

export function getStoredThemeMode(state) {
  const version = Number(state?.themePreferenceVersion || 0);
  if (version >= THEME_PREFERENCE_VERSION) {
    return normalizeThemeMode(state?.themeMode ?? state?.theme);
  }

  // Migrate pre-auto builds to system-following mode once.
  return DEFAULT_THEME_MODE;
}

export function buildStoredThemeState(themeMode) {
  const normalizedMode = normalizeThemeMode(themeMode);
  return {
    theme: normalizedMode,
    themeMode: normalizedMode,
    themePreferenceVersion: THEME_PREFERENCE_VERSION,
  };
}

export function resolveTheme(themeMode, systemTheme = getSystemTheme()) {
  const normalizedMode = normalizeThemeMode(themeMode);
  if (normalizedMode === "auto") {
    return normalizeTheme(systemTheme);
  }
  return normalizeTheme(normalizedMode);
}

export function applyDocumentTheme(theme) {
  if (typeof document === "undefined") return;

  const normalized = normalizeTheme(theme);
  document.documentElement.dataset.theme = normalized;
  document.documentElement.style.colorScheme = normalized;
}
