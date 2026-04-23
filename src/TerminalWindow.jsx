import { useEffect, useRef } from "react";
import TerminalDrawer from "./components/TerminalDrawer";
import useTerminal from "./hooks/useTerminal";

export default function TerminalWindow() {
  const terminal = useTerminal();
  const { focusActiveSession, hasLoadedSessions } = terminal;
  const announcedReadyRef = useRef(false);

  useEffect(() => {
    const handleFocus = () => {
      focusActiveSession();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [focusActiveSession]);

  useEffect(() => {
    if (!hasLoadedSessions || announcedReadyRef.current) return;

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
  }, [hasLoadedSessions]);

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
          wallpaper={null}
          windowMode
          onRequestClose={() => window.api?.closeCurrentWindow?.()}
        />
      </div>
    </div>
  );
}
