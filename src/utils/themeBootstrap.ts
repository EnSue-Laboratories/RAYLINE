const THEME_STORAGE_KEY = "rayline.themeMode";
const DARK_QUERY = "(prefers-color-scheme: dark)";

type ThemeModeSetting = "auto" | "light" | "dark";

function normalizeMode(value: unknown): ThemeModeSetting {
  return value === "light" || value === "dark" || value === "auto" ? value : "auto";
}

function getStoredMode(): ThemeModeSetting {
  try {
    return normalizeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

function getSystemResolved(): "light" | "dark" {
  if (window.matchMedia?.(DARK_QUERY)?.matches) {
    return "dark";
  }
  return "light";
}

/** Sets `data-theme` before React mounts so the first paint uses the right palette. */
export default function applyBootstrapTheme(): void {
  const mode = getStoredMode();
  const resolved = mode === "auto" ? getSystemResolved() : mode;
  document.documentElement.dataset.theme = resolved;
}
