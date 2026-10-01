import { useCallback, useEffect, useRef, useState } from "react";
import type { Appearance } from "@shared/state/types";
import type { HostPlatform } from "@shared/system/types";
import TerminalDrawer from "./components/TerminalDrawer";
import WindowControls from "./components/WindowControls";
import type { TerminalWallpaper } from "./components/terminal/theme";
import { LocaleProvider } from "./contexts/LocaleContext";
import { useTheme } from "./contexts/ThemeContext";
import { detectDefaultLocale, normalizeLocale, type Locale } from "./i18n";
import { applyAppearanceToDocument, applyAppearanceWindowBackground, normalizeAppearance } from "./utils/appearance";
import { getWallpaperImageFilter, normalizeWallpaper } from "./utils/wallpaper";
import useTerminal from "./hooks/useTerminal";

function isSameJsonValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function keepIfSame<T>(next: T): (current: T) => T {
  return (current) => (isSameJsonValue(current, next) ? current : next);
}

const closeCurrentWindow = () => {
  void window.api?.closeCurrentWindow?.();
};

export default function TerminalWindow() {
  const terminal = useTerminal();
  const { resolved: resolvedTheme } = useTheme();
  const { sessions, activeSession, windowOpen, focusActiveSession, refitActiveSession, hasLoadedSessions } = terminal;
  const announcedReadyRef = useRef(false);
  const [wallpaper, setWallpaper] = useState<TerminalWallpaper | null>(null);
  const [appearance, setAppearance] = useState<Appearance>(() => normalizeAppearance());
  const [hasLoadedWallpaper, setHasLoadedWallpaper] = useState(false);
  const [platform, setPlatform] = useState<HostPlatform | null>(null);
  const [locale, setLocale] = useState<Locale>(() => detectDefaultLocale());
  const showWindowControls = platform === "win32";

  const nudgeActiveTerminalLayout = useCallback(() => {
    focusActiveSession();
    refitActiveSession();
  }, [focusActiveSession, refitActiveSession]);

  const loadVisualState = useCallback(async () => {
    if (!window.api?.loadState) {
      setHasLoadedWallpaper(true);
      return;
    }

    try {
      const state = await window.api.loadState();
      setAppearance(keepIfSame(normalizeAppearance(state?.appearance)));
      if (state?.locale) setLocale(normalizeLocale(state.locale));
      const nextWallpaper = normalizeWallpaper(state?.wallpaper ? { ...state.wallpaper } : null);
      if (!nextWallpaper) {
        setWallpaper(null);
        return;
      }

      if (nextWallpaper.path && window.api?.readImage) {
        const dataUrl = await window.api.readImage(nextWallpaper.path);
        setWallpaper(keepIfSame<TerminalWallpaper | null>(normalizeWallpaper({ ...nextWallpaper, dataUrl: dataUrl || null })));
      } else {
        setWallpaper(keepIfSame<TerminalWallpaper | null>(nextWallpaper));
      }
    } catch (error) {
      console.error("[TerminalWindow] failed to load visual state:", error);
      setWallpaper(null);
    } finally {
      setHasLoadedWallpaper(true);
    }
  }, []);

  useEffect(() => {
    const normalizedAppearance = normalizeAppearance(appearance);
    applyAppearanceToDocument(normalizedAppearance, resolvedTheme);
    applyAppearanceWindowBackground(normalizedAppearance, resolvedTheme, window.api);
  }, [appearance, resolvedTheme]);

  useEffect(() => {
    const handleFocus = () => {
      nudgeActiveTerminalLayout();
      void loadVisualState();
    };

    window.api?.getSystemInfo?.().then((info) => {
      if (info?.platform) setPlatform(info.platform);
    }).catch(() => {});

    const kickoff = window.setTimeout(() => {
      void loadVisualState();
    }, 0);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearTimeout(kickoff);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadVisualState, nudgeActiveTerminalLayout]);

  useEffect(() => {
    if (!windowOpen || !activeSession || sessions.length === 0) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) nudgeActiveTerminalLayout();
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });
    const timers = [window.setTimeout(run, 60), window.setTimeout(run, 180)];

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [activeSession, sessions.length, windowOpen, nudgeActiveTerminalLayout]);

  useEffect(() => {
    if (!hasLoadedSessions || !hasLoadedWallpaper || announcedReadyRef.current) return;

    let cancelled = false;
    const announceReady = () => {
      if (cancelled || announcedReadyRef.current) return;
      announcedReadyRef.current = true;
      window.api?.terminalWindowReady?.();
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(announceReady);
    });

    return () => {
      cancelled = true;
    };
  }, [hasLoadedSessions, hasLoadedWallpaper]);

  const wallpaperUrl = wallpaper?.dataUrl;

  return (
    <LocaleProvider locale={locale} onLocaleChange={setLocale}>
      <div
        style={{
          height: "100vh",
          width: "100vw",
          overflow: "hidden",
          position: "relative",
          backgroundColor: "var(--pane-background)",
          backgroundImage: wallpaperUrl ? `url(${wallpaperUrl})` : "none",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          filter: "none",
          display: "flex",
        }}
      >
        {wallpaperUrl && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              backgroundImage: `url(${wallpaperUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              filter: getWallpaperImageFilter(wallpaper),
              opacity: ((wallpaper?.imgOpacity ?? 100) / 100).toFixed(3),
              transform: wallpaper?.imgBlur ? "scale(1.04)" : "none",
            }}
          />
        )}

        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", minWidth: 0, isolation: "isolate" }}>
          <TerminalDrawer
            sessions={terminal.sessions}
            activeSession={terminal.activeSession}
            onSelectSession={terminal.setActiveSession}
            onCreateSession={terminal.createSession}
            onKillSession={terminal.killSession}
            onSendInput={terminal.sendInput}
            onResizeSession={terminal.resizeSession}
            drawerOpen
            registerTerminal={terminal.registerTerminal}
            unregisterTerminal={terminal.unregisterTerminal}
            wallpaper={wallpaper}
            windowControlsVisible={showWindowControls}
            windowMode
            onRequestClose={closeCurrentWindow}
          />
        </div>

        {/* Rendered last so its no-drag region overrides the TerminalDrawer header's
            drag region in Electron's paint-order drag resolution. */}
        <WindowControls visible={showWindowControls} />
      </div>
    </LocaleProvider>
  );
}
