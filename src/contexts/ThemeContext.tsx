/* eslint-disable react-refresh/only-export-components -- context module: the provider ships with its hooks/context objects; Fast Refresh falls back to a full reload here by design */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ThemeMode } from "@shared/state/types";

/** User preference; "auto" follows `prefers-color-scheme`. */
export type ThemePreference = "auto" | ThemeMode;

export interface ThemeContextValue {
  mode: ThemePreference;
  resolved: ThemeMode;
  setMode: (mode: ThemePreference) => void;
}

export interface ThemeChangeDetail {
  resolved: ThemeMode;
}

const THEME_STORAGE_KEY = "rayline.themeMode";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === "auto" || value === "light" || value === "dark" ? value : "auto";
}

function getStoredMode(): ThemePreference {
  try {
    return normalizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

function getSystemResolved(): ThemeMode {
  return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(mode: ThemePreference, systemResolved: ThemeMode): ThemeMode {
  return mode === "auto" ? systemResolved : mode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children?: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemePreference>(getStoredMode);
  const [systemResolved, setSystemResolved] = useState<ThemeMode>(getSystemResolved);
  const resolved = resolveTheme(mode, systemResolved);

  useEffect(() => {
    const media = window.matchMedia?.(DARK_QUERY);
    if (!media) return undefined;
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemResolved(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        setModeState(normalizeThemePreference(event.newValue));
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.style.background = "var(--bg-primary)";
    root.style.colorScheme = resolved;
    window.dispatchEvent(new CustomEvent<ThemeChangeDetail>("rayline:theme-change", { detail: { resolved } }));
  }, [resolved]);

  const setMode = useCallback((nextMode: ThemePreference) => {
    const normalized = normalizeThemePreference(nextMode);
    setModeState(normalized);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage failures; the in-memory mode still applies for this window.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return value;
}
