import { useCallback, useEffect, useRef, useState } from "react";
import TerminalDrawer from "./components/TerminalDrawer";
import WindowControls from "./components/WindowControls";
import useTerminal from "./hooks/useTerminal";
import { getWallpaperImageFilter, normalizeWallpaper } from "./utils/wallpaper";

export default function TerminalWindow() {
  const terminal = useTerminal();
  const {
    sessions,
    activeSession,
    windowOpen,
    focusActiveSession,
    refitActiveSession,
    hasLoadedSessions,
  } = terminal;
  const announcedReadyRef = useRef(false);
  const [wallpaper, setWallpaper] = useState(null);
  const [hasLoadedWallpaper, setHasLoadedWallpaper] = useState(false);
  const [platform, setPlatform] = useState(null);
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
      const nextWallpaper = normalizeWallpaper(state?.wallpaper);
      if (!nextWallpaper) {
        setWallpaper(null);
        return;
      }

      if (nextWallpaper.path && window.api?.readImage) {
        const dataUrl = await window.api.readImage(nextWallpaper.path);
        setWallpaper(normalizeWallpaper({ ...nextWallpaper, dataUrl: dataUrl || null }));
      } else {
        setWallpaper(nextWallpaper);
      }
    } catch (error) {
      console.error("[TerminalWindow] failed to load visual state:", error);
      setWallpaper(null);
    } finally {
      setHasLoadedWallpaper(true);
    }
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      nudgeActiveTerminalLayout();
      loadVisualState();
    };

    window.api?.getSystemInfo?.().then((info) => {
      if (info?.platform) setPlatform(info.platform);
    }).catch(() => {});

    const kickoff = window.setTimeout(() => {
      loadVisualState();
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
    const timers = [];
    const run = () => {
      if (cancelled) return;
      nudgeActiveTerminalLayout();
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });
    timers.push(window.setTimeout(run, 60));
    timers.push(window.setTimeout(run, 180));

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

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        position: "relative",
        backgroundColor: "var(--pane-background)",
        backgroundImage: wallpaper?.dataUrl ? `url(${wallpaper.dataUrl})` : "none",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        filter: "none",
        display: "flex",
      }}
    >
      {wallpaper?.dataUrl && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            backgroundImage: `url(${wallpaper.dataUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            filter: getWallpaperImageFilter(wallpaper),
            opacity: ((wallpaper.imgOpacity ?? 100) / 100).toFixed(3),
            transform: wallpaper.imgBlur ? "scale(1.04)" : "none",
          }}
        />
      )}

      <WindowControls visible={showWindowControls} />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          display: "flex",
          minWidth: 0,
          isolation: "isolate",
        }}
      >
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
          onRequestClose={() => window.api?.closeCurrentWindow?.()}
        />
      </div>
    </div>
  );
}
