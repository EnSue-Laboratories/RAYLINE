import { useEffect, useState } from "react";
import type { Appearance } from "@shared/state/types";
import type { HostPlatform } from "@shared/system/types";
import { useTheme } from "../../contexts/ThemeContext";
import { detectDefaultLocale, normalizeLocale, type Locale } from "../../i18n";
import { applyAppearanceToDocument, applyAppearanceWindowBackground, normalizeAppearance } from "../../utils/appearance";
import { normalizeWallpaper, type NormalizedWallpaper } from "../../utils/wallpaper";

export interface PmWindowState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  wallpaper: NormalizedWallpaper | null;
  platform: HostPlatform | null;
  repos: string[];
  setRepos: (update: (repos: string[]) => string[]) => void;
}

/**
 * Window-level state for the Project Manager: platform, locale + appearance
 * (shared with the main window and re-read on focus), wallpaper, and the
 * persisted repo list (saved whenever it changes after the initial load).
 */
export function usePmWindowState(): PmWindowState {
  const { resolved: resolvedTheme } = useTheme();
  const [locale, setLocale] = useState<Locale>(() => detectDefaultLocale());
  const [appearance, setAppearance] = useState<Appearance>(() => normalizeAppearance());
  const [wallpaper, setWallpaper] = useState<NormalizedWallpaper | null>(null);
  const [platform, setPlatform] = useState<HostPlatform | null>(null);
  const [repos, setRepos] = useState<string[]>([]);
  const [stateLoaded, setStateLoaded] = useState(false);

  useEffect(() => {
    window.ghApi.getSystemInfo?.().then((info) => {
      if (info?.platform) setPlatform(info.platform);
    }).catch(() => {});

    void Promise.all([
      window.ghApi.loadPmState(),
      window.ghApi.loadAppState ? window.ghApi.loadAppState().catch(() => null) : Promise.resolve(null),
    ]).then(([pmState, appState]) => {
      setRepos(Array.isArray(pmState?.repos) ? pmState.repos : []);
      if (appState?.locale) setLocale(normalizeLocale(appState.locale));
      if (appState?.appearance) setAppearance(normalizeAppearance(appState.appearance));
      const persisted = pmState?.wallpaper;
      if (persisted?.path) {
        setWallpaper(normalizeWallpaper({ ...persisted }));
        void window.ghApi.readImage(persisted.path).then((dataUrl) => {
          if (dataUrl) setWallpaper((prev) => (prev ? normalizeWallpaper({ ...prev, dataUrl }) : prev));
        });
      }
      setStateLoaded(true);
    });
  }, []);

  useEffect(() => {
    applyAppearanceToDocument(appearance, resolvedTheme);
    applyAppearanceWindowBackground(appearance, resolvedTheme, window.ghApi);
  }, [appearance, resolvedTheme]);

  // Locale / appearance can change in the main window while this one is open.
  useEffect(() => {
    const reloadAppearance = () => {
      if (!window.ghApi?.loadAppState) return;
      window.ghApi.loadAppState().then((appState) => {
        if (appState?.locale) setLocale(normalizeLocale(appState.locale));
        if (appState?.appearance) setAppearance(normalizeAppearance(appState.appearance));
      }).catch(() => {});
    };
    window.addEventListener("focus", reloadAppearance);
    return () => window.removeEventListener("focus", reloadAppearance);
  }, []);

  useEffect(() => {
    if (stateLoaded) void window.ghApi.savePmState({ repos });
  }, [repos, stateLoaded]);

  return { locale, setLocale, wallpaper, platform, repos, setRepos };
}
