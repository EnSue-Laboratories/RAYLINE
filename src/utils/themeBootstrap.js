const THEME_STORAGE_KEY = "rayline.themeMode";
const DARK_QUERY = "(prefers-color-scheme: dark)";
const MODES = new Set(["auto", "light", "dark"]);

function normalizeMode(value) {
  return MODES.has(value) ? value : "auto";
}

function getStoredMode() {
  try {
    return normalizeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

function getSystemResolved() {
  if (window.matchMedia?.(DARK_QUERY)?.matches) {
    return "dark";
  }
  return "light";
}

export default function applyBootstrapTheme() {
  const mode = getStoredMode();
  const resolved = mode === "auto" ? getSystemResolved() : mode;
  document.documentElement.dataset.theme = resolved;
}
