import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";

export function getResolvedThemeMode(detail) {
  const candidate = detail?.resolved || detail?.mode || detail?.theme;
  if (candidate === "light" || candidate === "dark") return candidate;

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (root.dataset.theme === "light" || root.dataset.theme === "dark") {
      return root.dataset.theme;
    }
    if (root.classList.contains("light")) return "light";
  }

  return "dark";
}

export const ThemeContext = createContext({
  mode: "dark",
  resolved: "dark",
  theme: "dark",
});

export function ThemeProvider({ children }) {
  const [resolved, setResolved] = useState(() => getResolvedThemeMode());

  useEffect(() => {
    const handleThemeChange = (event) => {
      setResolved(getResolvedThemeMode(event.detail));
    };

    window.addEventListener("rayline:theme-change", handleThemeChange);
    return () => window.removeEventListener("rayline:theme-change", handleThemeChange);
  }, []);

  const value = useMemo(() => ({
    mode: resolved,
    resolved,
    theme: resolved,
  }), [resolved]);

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useThemeContext() {
  return useContext(ThemeContext);
}

export function useResolvedThemeMode() {
  return useThemeContext().resolved;
}
