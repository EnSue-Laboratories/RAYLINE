import { useState, useEffect, useRef, useCallback } from "react";
import { X, Plus, Terminal as TerminalIcon } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import { getPaneSurfaceStyle } from "../utils/paneSurface";
import { MAC_TRAFFIC_LIGHT_SAFE_WIDTH, WINDOW_DRAG_HEIGHT } from "../windowChrome";

// ── Shared style helpers ──────────────────────────────────────────────────────

const FONT_FAMILY = "'JetBrains Mono','Fira Code',monospace";
const XTERM_TRANSPARENT = "rgba(0,0,0,0)";
const TERMINAL_OPAQUE_BG = "#0D0D10";

function getTerminalTheme(opaqueBackground) {
  return {
    background: opaqueBackground ? TERMINAL_OPAQUE_BG : XTERM_TRANSPARENT,
    foreground: "rgba(244,247,250,0.88)",
    cursor: "#8fd6c2",
    cursorAccent: opaqueBackground ? TERMINAL_OPAQUE_BG : XTERM_TRANSPARENT,
    selectionBackground: "rgba(120,182,255,0.18)",
    selectionInactiveBackground: "rgba(120,182,255,0.1)",
    black: "#0f1116",
    red: "#f38ba8",
    green: "#7ed7b9",
    yellow: "#f5c97a",
    blue: "#89b4fa",
    magenta: "#cba6f7",
    cyan: "#74c7ec",
    white: "#bac2de",
    brightBlack: "#585b70",
    brightRed: "#f7a6bc",
    brightGreen: "#9ce8cf",
    brightYellow: "#f8d99c",
    brightBlue: "#a6c9ff",
    brightMagenta: "#d9b8fb",
    brightCyan: "#98dbf3",
    brightWhite: "#f5f7fb",
  };
}

function emitTerminalDebug(event, details = {}) {
  try {
    window.api?.terminalDebugLog?.({
      source: "renderer",
      page: typeof window !== "undefined" ? window.location.pathname : null,
      event,
      details: {
        perfNow: typeof performance !== "undefined"
          ? Number(performance.now().toFixed(2))
          : null,
        ...details,
      },
    });
  } catch {
    // Debug logging is best-effort only.
  }
}

function measureElementBox(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    offsetWidth: element.offsetWidth,
    offsetHeight: element.offsetHeight,
    rectWidth: Number(rect.width.toFixed(2)),
    rectHeight: Number(rect.height.toFixed(2)),
  };
}

const iconBtnStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  borderRadius: 6,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.45)",
  cursor: "pointer",
  flexShrink: 0,
  WebkitAppRegion: "no-drag",
  transition: "background .15s, color .15s",
};

let xtermLoaderPromise = null;

function loadXtermModules() {
  if (!xtermLoaderPromise) {
    xtermLoaderPromise = (async () => {
      try {
        await import("@xterm/xterm/css/xterm.css");
      } catch {
        // If Vite can't dynamic-import the CSS, a static import in the app entry
        // is the fallback and this isn't fatal.
      }

      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);

      return { Terminal, FitAddon };
    })();
  }

  return xtermLoaderPromise;
}

function useHover(baseStyle, hoverStyle) {
  return {
    style: baseStyle,
    onMouseEnter(e) {
      Object.assign(e.currentTarget.style, hoverStyle);
    },
    onMouseLeave(e) {
      // Restore each hovered key to its base value
      for (const key of Object.keys(hoverStyle)) {
        e.currentTarget.style[key] = baseStyle[key] ?? "";
      }
    },
  };
}

// ── IconButton ────────────────────────────────────────────────────────────────

function IconButton({ onClick, title, children }) {
  const hover = useHover(iconBtnStyle, {
    background: "rgba(255,255,255,0.09)",
    color: "rgba(255,255,255,0.8)",
  });

  return (
    <button onClick={onClick} title={title} {...hover}>
      {children}
    </button>
  );
}

// ── TerminalViewport ──────────────────────────────────────────────────────────

function SessionTerminal({
  sessionName,
  isActive,
  opaqueBackground = false,
  onSendInput,
  onResizeSession,
  registerTerminal,
  unregisterTerminal,
}) {
  const containerRef = useRef(null);
  const xtermElRef = useRef(null); // DOM div that xterm mounts into
  const termRef = useRef(null); // current xterm.Terminal instance
  const fitAddonRef = useRef(null);
  const roRef = useRef(null); // ResizeObserver
  const lastObservedBoxRef = useRef(null);

  // Stable refs so the async IIFE captures up-to-date callbacks without
  // restarting the effect every time parent re-renders.
  const sendRef = useRef(onSendInput);
  const resizeRef = useRef(onResizeSession);
  const registerRef = useRef(registerTerminal);
  const unregRef = useRef(unregisterTerminal);
  const activeRef = useRef(isActive);
  useEffect(() => { sendRef.current = onSendInput; }, [onSendInput]);
  useEffect(() => { resizeRef.current = onResizeSession; }, [onResizeSession]);
  useEffect(() => { registerRef.current = registerTerminal; }, [registerTerminal]);
  useEffect(() => { unregRef.current = unregisterTerminal; }, [unregisterTerminal]);
  useEffect(() => { activeRef.current = isActive; }, [isActive]);

  const teardown = useCallback(() => {
    roRef.current?.disconnect();
    roRef.current = null;

    if (termRef.current) {
      const prevName = termRef.current.__sessionName;
      if (prevName) unregRef.current(prevName);
      try { termRef.current.dispose(); } catch { /* ignore terminal dispose errors */ }
      termRef.current = null;
    }

    if (xtermElRef.current?.parentNode) {
      try { xtermElRef.current.parentNode.removeChild(xtermElRef.current); } catch { /* ignore mount cleanup failures */ }
    }
    xtermElRef.current = null;
    fitAddonRef.current = null;
  }, []);

  useEffect(() => {
    if (!sessionName || !containerRef.current) return;

    let cancelled = false;
    emitTerminalDebug("session:init", { sessionName });

    (async () => {
      const { Terminal, FitAddon } = await loadXtermModules();

      if (cancelled) return;
      if (!containerRef.current) return;

      const el = document.createElement("div");
      el.className = `rayline-terminal-host${opaqueBackground ? " rayline-terminal-host--opaque" : ""}`;
      el.style.cssText = `width:100%;height:100%;background:${opaqueBackground ? TERMINAL_OPAQUE_BG : "transparent"};`;
      xtermElRef.current = el;
      containerRef.current.appendChild(el);

      const term = new Terminal({
        theme: getTerminalTheme(opaqueBackground),
        fontFamily: FONT_FAMILY,
        fontSize: 13,
        fontWeight: "400",
        fontWeightBold: "600",
        lineHeight: 1.28,
        letterSpacing: 0,
        cursorBlink: true,
        cursorStyle: "bar",
        cursorWidth: 2,
        customGlyphs: true,
        drawBoldTextInBrightColors: false,
        fastScrollSensitivity: 3,
        minimumContrastRatio: 1.2,
        rescaleOverlappingGlyphs: true,
        scrollback: 5000,
        smoothScrollDuration: 90,
        allowTransparency: !opaqueBackground,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.__sessionName = sessionName;

      term.open(el);
      emitTerminalDebug("session:open", {
        sessionName,
        container: measureElementBox(containerRef.current),
        host: measureElementBox(el),
      });

      await new Promise((r) => setTimeout(r, 30));
      if (cancelled) { term.dispose(); return; }

      try { fitAddon.fit(); } catch { /* ignore early layout measurement failures */ }
      emitTerminalDebug("session:initial-fit", {
        sessionName,
        cols: term.cols,
        rows: term.rows,
        container: measureElementBox(containerRef.current),
        host: measureElementBox(el),
      });

      fitAddonRef.current = fitAddon;
      termRef.current = term;

      term.onData((data) => sendRef.current(sessionName, data));

      term.onResize(({ cols, rows }) => {
        emitTerminalDebug("session:term-resize", {
          sessionName,
          cols,
          rows,
          active: activeRef.current,
          container: measureElementBox(containerRef.current),
        });
        resizeRef.current(sessionName, cols, rows);
      });

      registerRef.current(sessionName, term);

      if (window.api?.terminalRead) {
        try {
          const result = await window.api.terminalRead({ name: sessionName, lines: 500 });
          if (!cancelled && result?.ok && result.lines?.length) {
            term.write(result.lines.join("\n"));
          }
        } catch { /* ignore scrollback preload failures */ }
      }

      if (activeRef.current) {
        term.focus();
      }

      const ro = new ResizeObserver(() => {
        const nextBox = measureElementBox(containerRef.current);
        const prevBox = lastObservedBoxRef.current;
        const changed = !prevBox
          || prevBox.clientWidth !== nextBox?.clientWidth
          || prevBox.clientHeight !== nextBox?.clientHeight;
        lastObservedBoxRef.current = nextBox;

        if (changed) {
          emitTerminalDebug("session:container-resize", {
            sessionName,
            active: activeRef.current,
            container: nextBox,
            colsBeforeFit: termRef.current?.cols ?? null,
            rowsBeforeFit: termRef.current?.rows ?? null,
          });
        }

        if (fitAddonRef.current) {
          try { fitAddonRef.current.fit(); } catch { /* ignore transient resize fit failures */ }
        }
      });
      ro.observe(containerRef.current);
      roRef.current = ro;
    })();

    return () => {
      cancelled = true;
      emitTerminalDebug("session:teardown", { sessionName });
      teardown();
    };
  }, [opaqueBackground, sessionName, teardown]);

  useEffect(() => {
    const logActiveState = (phase) => {
      emitTerminalDebug("session:active-state", {
        phase,
        sessionName,
        isActive,
        cols: termRef.current?.cols ?? null,
        rows: termRef.current?.rows ?? null,
        container: measureElementBox(containerRef.current),
        host: measureElementBox(xtermElRef.current),
      });
    };

    logActiveState("effect");
    if (!isActive || !termRef.current) return;

    const timeoutId = window.setTimeout(() => {
      logActiveState("timeout-80ms");
    }, 80);

    window.requestAnimationFrame(() => {
      logActiveState("raf-1");
      try { termRef.current?.focus(); } catch { /* ignore transient focus failures */ }
      window.requestAnimationFrame(() => {
        logActiveState("raf-2");
      });
    });

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isActive, sessionName]);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: isActive ? 0 : "-200vw",
        width: "100%",
        height: "100%",
        pointerEvents: isActive ? "auto" : "none",
        zIndex: isActive ? 1 : 0,
        contain: "layout paint size",
        overflow: "hidden",
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: opaqueBackground ? TERMINAL_OPAQUE_BG : "transparent",
          padding: "10px 6px 8px",
          boxSizing: "border-box",
          minHeight: 0,
        }}
      />
    </div>
  );
}

function TerminalViewport({
  sessions,
  activeSession,
  opaqueBackground = false,
  onSendInput,
  onResizeSession,
  registerTerminal,
  unregisterTerminal,
}) {
  const visibleSession = activeSession || sessions[0]?.name || null;

  useEffect(() => {
    emitTerminalDebug("viewport:visible-session", {
      visibleSession,
      sessionNames: sessions.map((session) => session.name),
    });
  }, [sessions, visibleSession]);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        position: "relative",
      }}
    >
      {sessions.map((session) => (
        <SessionTerminal
          key={session.name}
          sessionName={session.name}
          isActive={session.name === visibleSession}
          opaqueBackground={opaqueBackground}
          onSendInput={onSendInput}
          onResizeSession={onResizeSession}
          registerTerminal={registerTerminal}
          unregisterTerminal={unregisterTerminal}
        />
      ))}
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ onCreate, blank = false }) {
  const s = useFontScale();
  const btnHover = useHover(
    {
      marginTop: 12,
      padding: "6px 14px",
      borderRadius: 7,
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.1)",
      color: "rgba(255,255,255,0.45)",
      cursor: "pointer",
      fontSize: s(11),
      fontFamily: FONT_FAMILY,
      letterSpacing: ".06em",
      transition: "background .15s, color .15s",
    },
    {
      background: "rgba(255,255,255,0.11)",
      color: "rgba(255,255,255,0.75)",
    }
  );
  if (blank) {
    return <div style={{ flex: 1, minHeight: 0 }} />;
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        userSelect: "none",
      }}
    >
      <TerminalIcon size={32} strokeWidth={1} color="rgba(255,255,255,0.08)" />
      <div
        style={{
          marginTop: 8,
          fontSize: s(11),
          fontFamily: FONT_FAMILY,
          color: "rgba(255,255,255,0.2)",
          letterSpacing: ".06em",
        }}
      >
        No active sessions
      </div>
      <button onClick={onCreate} {...btnHover}>
        NEW TERMINAL
      </button>
    </div>
  );
}

// ── TabBar ────────────────────────────────────────────────────────────────────

function TabBar({ sessions, activeSession, onSelectSession, onKillSession }) {
  const s = useFontScale();
  return (
    <div
      style={{
        display: "flex",
        overflowX: "auto",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        flexShrink: 0,
        scrollbarWidth: "none",
      }}
    >
      {sessions.map((session) => {
        const isActive = session.name === activeSession;
        return (
          <div
            key={session.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              cursor: "pointer",
              flexShrink: 0,
              background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
              borderRight: "1px solid rgba(255,255,255,0.04)",
              transition: "background .15s",
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.background = "transparent";
            }}
            onClick={() => onSelectSession(session.name)}
          >
            <span
              style={{
                fontSize: s(11),
                fontFamily: FONT_FAMILY,
                color: isActive ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)",
                maxWidth: 120,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                letterSpacing: ".04em",
              }}
            >
              {session.name}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onKillSession(session.name);
              }}
              title="Kill session"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 14,
                height: 14,
                borderRadius: 3,
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.2)",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
                transition: "color .15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(220,80,80,0.7)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
            >
              <X size={10} strokeWidth={2} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── TerminalDrawer ────────────────────────────────────────────────────────────

export default function TerminalDrawer({
  sessions,
  activeSession,
  onSelectSession,
  onCreateSession,
  onKillSession,
  onSendInput,
  onResizeSession,
  drawerOpen,
  onToggleDrawer,
  onRequestClose,
  registerTerminal,
  unregisterTerminal,
  cwd,
  wallpaper,
  windowMode = false,
}) {
  const s = useFontScale();
  const [width, setWidth] = useState(480);
  const hasWallpaper = Boolean(wallpaper?.dataUrl);
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || "");
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(480);

  const handleRef = useRef(null);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    handleRef.current?.setPointerCapture(e.pointerId);
  }, [width]);

  const handlePointerMove = useCallback((e) => {
    if (!dragging.current) return;
    const delta = startX.current - e.clientX;
    const newWidth = Math.min(Math.max(startWidth.current + delta, 280), window.innerWidth - 400);
    setWidth(newWidth);
  }, []);

  const handlePointerUp = useCallback((e) => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    handleRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  if (!windowMode && !drawerOpen) return null;

  const handleCreate = () => {
    onCreateSession({ name: `shell-${Date.now()}`, cwd: cwd || undefined });
  };

  return (
    <div
      style={{
        width: windowMode ? "100%" : width,
        minWidth: windowMode ? 0 : 280,
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        ...(windowMode ? { background: TERMINAL_OPAQUE_BG } : getPaneSurfaceStyle(hasWallpaper)),
        backdropFilter: windowMode ? "none" : (hasWallpaper ? "saturate(1.1)" : "blur(56px) saturate(1.1)"),
        borderLeft: windowMode ? "none" : "1px solid rgba(255,255,255,0.025)",
        position: "relative",
        zIndex: 10,
        overflow: "hidden",
        isolation: "isolate",
      }}
    >
      {/* Resize handle */}
      {!windowMode && (
        <div
          ref={handleRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            position: "absolute",
            left: -3,
            top: 0,
            bottom: 0,
            width: 8,
            cursor: "col-resize",
            zIndex: 30,
            touchAction: "none",
          }}
        />
      )}
      {/* Header */}
      <div
        style={{
          height: WINDOW_DRAG_HEIGHT,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: windowMode ? "flex-end" : "space-between",
          padding: windowMode && isMac
            ? `0 14px 0 ${MAC_TRAFFIC_LIGHT_SAFE_WIDTH + 8}px`
            : "0 14px",
          WebkitAppRegion: "drag",
        }}
      >
        {!windowMode && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              WebkitAppRegion: "drag",
            }}
          >
            <TerminalIcon
              size={13}
              strokeWidth={1.5}
              color="rgba(255,255,255,0.35)"
            />
            <span
              style={{
                fontSize: s(10),
                fontFamily: FONT_FAMILY,
                color: "rgba(255,255,255,0.35)",
                letterSpacing: ".08em",
                userSelect: "none",
              }}
            >
              TERMINALS
            </span>
          </div>
        )}

        {/* Right: action buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            WebkitAppRegion: "no-drag",
          }}
        >
          <IconButton onClick={handleCreate} title="New terminal">
            <Plus size={13} strokeWidth={1.5} />
          </IconButton>
          <IconButton onClick={windowMode ? onRequestClose : onToggleDrawer} title={windowMode ? "Close window" : "Close drawer"}>
            <X size={13} strokeWidth={1.5} />
          </IconButton>
        </div>
      </div>

      {/* Tab bar — only when there are multiple sessions */}
      {sessions.length > 1 && (
        <TabBar
          sessions={sessions}
          activeSession={activeSession}
          onSelectSession={onSelectSession}
          onKillSession={onKillSession}
        />
      )}

      {/* Content */}
      {sessions.length === 0 ? (
        <EmptyState onCreate={handleCreate} blank={windowMode} />
      ) : (
        <TerminalViewport
          sessions={sessions}
          activeSession={activeSession}
          opaqueBackground={windowMode}
          onSendInput={onSendInput}
          onResizeSession={onResizeSession}
          registerTerminal={registerTerminal}
          unregisterTerminal={unregisterTerminal}
        />
      )}
    </div>
  );
}
