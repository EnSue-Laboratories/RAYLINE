import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export const ThemeContext = createContext({ theme: "dark", setTheme: () => {} });

/**
 * Returns { theme, setTheme } where theme is "light" | "dark" | "auto".
 * Calling setTheme applies data-theme to <html> and dispatches rayline:theme-change.
 */
export function useTheme() {
  return useContext(ThemeContext);
}

function resolveTheme(theme) {
  if (theme === "auto") {
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return theme;
}

function applyThemeToDOM(theme) {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  if (resolved === "light") {
    root.classList.add("light");
    root.classList.remove("dark");
  } else {
    root.classList.add("dark");
    root.classList.remove("light");
  }
  window.dispatchEvent(
    new CustomEvent("rayline:theme-change", { detail: { theme: resolved } })
  );
}

/**
 * ThemeProvider manages the theme state.
 * Pass `externalTheme` if you want to initialize from a persisted value.
 * Pass `onThemeChange` to keep an external state in sync.
 */
export function ThemeProvider({ children, externalTheme, onThemeChange }) {
  const [theme, setThemeState] = useState(externalTheme || "dark");
  const prevExternalRef = useRef(externalTheme);

  // Sync when externalTheme changes from outside (e.g. loaded from persisted state)
  useEffect(() => {
    if (externalTheme && externalTheme !== prevExternalRef.current) {
      prevExternalRef.current = externalTheme;
      setThemeState(externalTheme);
      applyThemeToDOM(externalTheme);
    }
  }, [externalTheme]);

  const setTheme = useCallback((t) => {
    setThemeState(t);
    applyThemeToDOM(t);
    onThemeChange?.(t);
  }, [onThemeChange]);

  // Apply once on mount
  useEffect(() => {
    applyThemeToDOM(theme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-apply when "auto" and system preference changes
  useEffect(() => {
    if (theme !== "auto") return;
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq) return;
    const handler = () => applyThemeToDOM("auto");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
