import { useEffect, useState, useCallback } from "react";
import AuroraCanvas from "./components/AuroraCanvas";
import Grain from "./components/Grain";
import TerminalDrawer from "./components/TerminalDrawer";
import useTerminal from "./hooks/useTerminal";
import { getWallpaperImageFilter, normalizeWallpaper } from "./utils/wallpaper";

export default function TerminalWindow() {
  const terminal = useTerminal();
  const { focusActiveSession } = terminal;
  const [wallpaper, setWallpaper] = useState(null);

  const loadVisualState = useCallback(async () => {
    if (!window.api?.loadState) return;

    try {
      const state = await window.api.loadState();
      const nextWallpaper = normalizeWallpaper(state?.wallpaper);
      if (!nextWallpaper) {
        setWallpaper(null);
        return;
      }

      setWallpaper(nextWallpaper);

      if (nextWallpaper.path && window.api?.readImage) {
        const dataUrl = await window.api.readImage(nextWallpaper.path);
        if (dataUrl) {
          setWallpaper((prev) => (prev ? normalizeWallpaper({ ...prev, dataUrl }) : prev));
        }
      }
    } catch (error) {
      console.error("[TerminalWindow] failed to load visual state:", error);
    }
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      focusActiveSession();
      loadVisualState();
    };

    const kickoff = window.setTimeout(() => {
      loadVisualState();
    }, 0);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearTimeout(kickoff);
      window.removeEventListener("focus", handleFocus);
    };
  }, [focusActiveSession, loadVisualState]);

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        position: "relative",
        background: "var(--pane-background)",
        display: "flex",
      }}
    >
      {wallpaper?.dataUrl ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${wallpaper.dataUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              filter: getWallpaperImageFilter(wallpaper),
              opacity: ((wallpaper.imgOpacity ?? 100) / 100).toFixed(3),
              transform: wallpaper.imgBlur ? "scale(1.05)" : "none",
            }}
          />
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
          }}
        >
          <AuroraCanvas />
          <Grain />
        </div>
      )}

      <div
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          display: "flex",
          minWidth: 0,
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
          windowMode
          onRequestClose={() => window.api?.closeCurrentWindow?.()}
        />
      </div>
    </div>
  );
}
