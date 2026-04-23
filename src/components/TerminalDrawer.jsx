import { useState, useEffect, useRef, useCallback } from "react";
import { X, Plus, Terminal as TerminalIcon } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import { getPaneSurfaceStyle } from "../utils/paneSurface";
import { WINDOW_DRAG_HEIGHT } from "../windowChrome";

// ── Shared style helpers ──────────────────────────────────────────────────────

const FONT_FAMILY = "'JetBrains Mono','Fira Code',monospace";
const XTERM_TRANSPARENT = "rgba(0,0,0,0)";

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

function TerminalViewport({
  activeSession,
  onSendInput,
  onResizeSession,
  registerTerminal,
  unregisterTerminal,
}) {
  const containerRef = useRef(null);
  const xtermElRef   = useRef(null);  // DOM div that xterm mounts into
  const termRef      = useRef(null);  // current xterm.Terminal instance
  const fitAddonRef  = useRef(null);
  const roRef        = useRef(null);  // ResizeObserver

  // Stable refs so the async IIFE captures up-to-date callbacks without
  // restarting the effect every time parent re-renders.
  const sendRef     = useRef(onSendInput);
  const resizeRef   = useRef(onResizeSession);
  const registerRef = useRef(registerTerminal);
  const unregRef    = useRef(unregisterTerminal);
  useEffect(() => { sendRef.current     = onSendInput;       }, [onSendInput]);
  useEffect(() => { resizeRef.current   = onResizeSession;   }, [onResizeSession]);
  useEffect(() => { registerRef.current = registerTerminal;  }, [registerTerminal]);
  useEffect(() => { unregRef.current    = unregisterTerminal;}, [unregisterTerminal]);

  const teardown = useCallback(() => {
    // Disconnect observer
    roRef.current?.disconnect();
    roRef.current = null;

    // Unregister + dispose previous term
    if (termRef.current) {
      const prevName = termRef.current.__sessionName;
      if (prevName) unregRef.current(prevName);
      try { termRef.current.dispose(); } catch { /* ignore terminal dispose errors */ }
      termRef.current = null;
    }

    // Remove the xterm mount div
    if (xtermElRef.current && containerRef.current) {
      try { containerRef.current.removeChild(xtermElRef.current); } catch { /* React may already remove the mount node */ }
    }
    xtermElRef.current = null;
    fitAddonRef.current = null;
  }, []);

  useEffect(() => {
    if (!activeSession || !containerRef.current) return;

    let cancelled = false;

    (async () => {
      // Pull in xterm dynamically so it only loads when the drawer is first used
      try {
        await import("@xterm/xterm/css/xterm.css");
      } catch {
        // If Vite can't dynamic-import the CSS, a static import in main.jsx is
        // the fallback — not a fatal error here.
      }

      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);

      if (cancelled) return;

      // Tear down any previous instance before mounting a new one
      teardown();

      if (!containerRef.current) return;

      // Create a fresh mount point
      const el = document.createElement("div");
      el.style.cssText = "width:100%;height:100%;background:transparent;";
      xtermElRef.current = el;
      containerRef.current.appendChild(el);

      const term = new Terminal({
        theme: {
          background:          XTERM_TRANSPARENT,
          foreground:          "rgba(255,255,255,0.82)",
          cursor:              "rgba(255,255,255,0.5)",
          cursorAccent:        XTERM_TRANSPARENT,
          selectionBackground: "rgba(255,255,255,0.12)",
          // ANSI colors — muted palette matching RayLine's dark theme
          black:               "#1a1a1a",
          red:                 "#e06c75",
          green:               "#98c379",
          yellow:              "#e5c07b",
          blue:                "#7eaee0",
          magenta:             "#c678dd",
          cyan:                "#56b6c2",
          white:               "rgba(255,255,255,0.75)",
          brightBlack:         "#5c6370",
          brightRed:           "#f2777a",
          brightGreen:         "#addb67",
          brightYellow:        "#ffd580",
          brightBlue:          "#82aaff",
          brightMagenta:       "#d19aff",
          brightCyan:          "#7fdbca",
          brightWhite:         "rgba(255,255,255,0.92)",
        },
        fontFamily:   FONT_FAMILY,
        fontSize:     13,
        lineHeight:   1.4,
        cursorBlink:  true,
        cursorStyle:  "bar",
        allowTransparency: true,
        allowProposedApi: true,
        scrollbarWidth: "none",
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.__sessionName = activeSession;

      term.open(el);

      // Small delay lets the element settle in the DOM before we measure
      await new Promise((r) => setTimeout(r, 30));
      if (cancelled) { term.dispose(); return; }

      try { fitAddon.fit(); } catch { /* ignore early layout measurement failures */ }

      fitAddonRef.current = fitAddon;
      termRef.current     = term;

      // Wire up user input
      term.onData((data) => sendRef.current(activeSession, data));

      // Propagate size changes to the pty
      term.onResize(({ cols, rows }) => resizeRef.current(activeSession, cols, rows));

      // Register so the IPC listener in useTerminal can write output
      registerRef.current(activeSession, term);

      // Load existing scrollback
      if (window.api?.terminalRead) {
        try {
          const result = await window.api.terminalRead({ name: activeSession, lines: 500 });
          if (!cancelled && result?.ok && result.lines?.length) {
            term.write(result.lines.join("\n"));
          }
        } catch { /* ignore scrollback preload failures */ }
      }

      term.focus();

      // Observe container size changes and re-fit
      const ro = new ResizeObserver(() => {
        if (fitAddonRef.current) {
          try { fitAddonRef.current.fit(); } catch { /* ignore transient resize fit failures */ }
        }
      });
      ro.observe(containerRef.current);
      roRef.current = ro;
    })();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [activeSession]); // eslint-disable-line react-hooks/exhaustive-deps
  // teardown is stable (useCallback with no deps), intentionally excluded.

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: "hidden",
        padding: "8px 4px",
        boxSizing: "border-box",
        minHeight: 0,
      }}
    />
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ onCreate }) {
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
  registerTerminal,
  unregisterTerminal,
  cwd,
  wallpaper,
  windowControlsVisible = false,
}) {
  const s = useFontScale();
  const [width, setWidth] = useState(480);
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

  if (!drawerOpen) return null;

  const handleCreate = () => {
    onCreateSession({ name: `shell-${Date.now()}`, cwd: cwd || undefined });
  };

  return (
    <div
      style={{
        width,
        minWidth: 280,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        ...getPaneSurfaceStyle(Boolean(wallpaper?.dataUrl)),
        backdropFilter: wallpaper?.dataUrl ? "saturate(1.1)" : "blur(56px) saturate(1.1)",
        borderLeft: "1px solid rgba(255,255,255,0.025)",
        position: "relative",
        zIndex: 10,
        overflow: "hidden",
      }}
    >
      {/* Resize handle */}
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
      {/* Spacer that clears the window controls area on Windows */}
      {windowControlsVisible && (
        <div style={{ height: WINDOW_DRAG_HEIGHT, flexShrink: 0 }} />
      )}

      {/* Header */}
      <div
        style={{
          height: 52,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          WebkitAppRegion: "drag",
        }}
      >
        {/* Left: icon + label */}
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
          <IconButton onClick={onToggleDrawer} title="Close drawer">
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
        <EmptyState onCreate={handleCreate} />
      ) : (
        <TerminalViewport
          key={activeSession}
          activeSession={activeSession}
          onSendInput={onSendInput}
          onResizeSession={onResizeSession}
          registerTerminal={registerTerminal}
          unregisterTerminal={unregisterTerminal}
        />
      )}
    </div>
  );
}
