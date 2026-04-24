/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

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

function resolveTheme(mode, systemResolved) {
  return mode === "auto" ? systemResolved : mode;
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(getStoredMode);
  const [systemResolved, setSystemResolved] = useState(getSystemResolved);
  const resolved = resolveTheme(mode, systemResolved);

  useEffect(() => {
    const media = window.matchMedia?.(DARK_QUERY);
    if (!media) return undefined;

    const handleChange = (event) => {
      setSystemResolved(event.matches ? "dark" : "light");
    };

    if (media.addEventListener) {
      media.addEventListener("change", handleChange);
    } else {
      media.addListener?.(handleChange);
    }
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener("change", handleChange);
      } else {
        media.removeListener?.(handleChange);
      }
    };
  }, []);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === THEME_STORAGE_KEY) {
        setModeState(normalizeMode(event.newValue));
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    window.dispatchEvent(new CustomEvent("rayline:theme-change", { detail: { resolved } }));
  }, [resolved]);

  const setMode = useCallback((nextMode) => {
    const normalized = normalizeMode(nextMode);
    setModeState(normalized);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage failures; the in-memory mode still applies for this window.
    }
  }, []);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return value;
}
