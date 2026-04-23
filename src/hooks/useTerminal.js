import { useState, useCallback, useEffect, useRef } from "react";

export default function useTerminal() {
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [windowOpen, setWindowOpen] = useState(false);
  const [hasLoadedSessions, setHasLoadedSessions] = useState(false);

  // Maps session name -> xterm.Terminal instance
  const terminalRefs = useRef(new Map());
  // Track known session names so we can detect new ones from MCP/external creation
  const knownSessionNames = useRef(new Set());

  // ── Internal helpers ────────────────────────────────────────────────────────

  const applySessionSnapshot = useCallback((incoming, options = {}) => {
    const nextSessions = Array.isArray(incoming) ? incoming : [];
    const incomingNames = new Set(nextSessions.map((s) => s.name));
    knownSessionNames.current = incomingNames;
    setSessions(nextSessions);
    setHasLoadedSessions(true);

    setActiveSession((prev) => {
      if (options.preferredSessionName && incomingNames.has(options.preferredSessionName)) {
        return options.preferredSessionName;
      }
      if (prev && incomingNames.has(prev)) return prev;
      return nextSessions[0]?.name ?? null;
    });
  }, []);

  const refreshSessions = useCallback(async () => {
    if (!window.api?.terminalList) return;
    try {
      const result = await window.api.terminalList();
      // listSessions returns a plain array
      const incoming = Array.isArray(result) ? result : (result?.sessions ?? []);
      applySessionSnapshot(incoming);
    } catch (e) {
      console.error("[useTerminal] refreshSessions failed:", e);
      setHasLoadedSessions(true);
    }
  }, [applySessionSnapshot]);

  const openWindow = useCallback(async () => {
    setWindowOpen(true);
    try {
      await window.api?.openTerminalWindow?.();
    } catch (e) {
      console.error("[useTerminal] openWindow failed:", e);
    }
  }, []);

  const closeWindow = useCallback(async () => {
    setWindowOpen(false);
    try {
      await window.api?.closeTerminalWindow?.();
    } catch (e) {
      console.error("[useTerminal] closeWindow failed:", e);
    }
  }, []);

  const setDrawerOpen = useCallback(async (next) => {
    const resolved = typeof next === "function" ? next(windowOpen) : next;
    if (resolved) {
      await openWindow();
    } else {
      await closeWindow();
    }
  }, [closeWindow, openWindow, windowOpen]);

  // ── Lifecycle effects ───────────────────────────────────────────────────────

  // Effect 1: subscribe to terminal output and pipe it to xterm instances
  useEffect(() => {
    if (!window.api?.onTerminalOutput) return;

    const cleanup = window.api.onTerminalOutput(({ name, data }) => {
      const term = terminalRefs.current.get(name);
      if (term) {
        term.write(data);
      }
    });

    return () => {
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    if (!window.api?.isTerminalWindowOpen) return;

    let cancelled = false;

    window.api.isTerminalWindowOpen().then((open) => {
      if (!cancelled) setWindowOpen(Boolean(open));
    }).catch((e) => {
      console.error("[useTerminal] isTerminalWindowOpen failed:", e);
    });

    const cleanup = window.api.onTerminalWindowState?.(({ open }) => {
      setWindowOpen(Boolean(open));
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    if (!window.api?.onTerminalSessionsState) return;

    const cleanup = window.api.onTerminalSessionsState((payload = {}) => {
      applySessionSnapshot(payload.sessions, {
        preferredSessionName: payload.reason === "created" ? payload.name : null,
      });
    });

    return () => {
      cleanup?.();
    };
  }, [applySessionSnapshot]);

  // Clear any stale saved metadata on mount (we start with zero terminals)
  useEffect(() => {
    window.api?.terminalSavedMetadata?.();
  }, []);

  useEffect(() => {
    const kickoff = window.setTimeout(() => {
      refreshSessions();
    }, 0);
    const interval = window.setInterval(() => {
      refreshSessions();
    }, 3000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
    };
  }, [refreshSessions]);

  // ── Exposed functions ───────────────────────────────────────────────────────

  const createSession = useCallback(async ({ name, command, cwd }) => {
    if (!window.api?.terminalCreate) return;
    try {
      await window.api.terminalCreate({ name, command, cwd });
      await refreshSessions();
      setActiveSession(name);
      await openWindow();
    } catch (e) {
      console.error("[useTerminal] createSession failed:", e);
    }
  }, [openWindow, refreshSessions]);

  const sendInput = useCallback((name, text) => {
    if (!window.api?.terminalSend) return;
    window.api.terminalSend({ name, text });
  }, []);

  const killSession = useCallback(async (name) => {
    if (!window.api?.terminalKill) return;
    try {
      await window.api.terminalKill({ name });
    } catch (e) {
      console.error("[useTerminal] killSession failed:", e);
    }
    terminalRefs.current.delete(name);
    await refreshSessions();
  }, [refreshSessions]);

  const resizeSession = useCallback((name, cols, rows) => {
    if (!window.api?.terminalResize) return;
    window.api.terminalResize({ name, cols, rows });
  }, []);

  const focusSession = useCallback((name) => {
    if (!name) return;
    const term = terminalRefs.current.get(name);
    if (!term || typeof term.focus !== "function") return;
    window.requestAnimationFrame(() => {
      try {
        term.focus();
      } catch (e) {
        console.error("[useTerminal] focusSession failed:", e);
      }
    });
  }, []);

  const focusActiveSession = useCallback(() => {
    if (!activeSession) return;
    focusSession(activeSession);
  }, [activeSession, focusSession]);

  const refitSession = useCallback((name) => {
    if (!name) return;
    const term = terminalRefs.current.get(name);
    if (!term || typeof term.__raylineFit !== "function") return;
    window.requestAnimationFrame(() => {
      try {
        term.__raylineFit();
      } catch (e) {
        console.error("[useTerminal] refitSession failed:", e);
      }
    });
  }, []);

  const refitActiveSession = useCallback(() => {
    if (!activeSession) return;
    refitSession(activeSession);
  }, [activeSession, refitSession]);

  const registerTerminal = useCallback((name, terminal) => {
    terminalRefs.current.set(name, terminal);
  }, []);

  const unregisterTerminal = useCallback((name) => {
    terminalRefs.current.delete(name);
  }, []);

  return {
    sessions,
    activeSession,
    drawerOpen: windowOpen,
    windowOpen,
    terminalRefs,
    createSession,
    sendInput,
    killSession,
    resizeSession,
    openWindow,
    closeWindow,
    focusSession,
    focusActiveSession,
    refitSession,
    refitActiveSession,
    refreshSessions,
    registerTerminal,
    unregisterTerminal,
    setActiveSession,
    setDrawerOpen,
    hasLoadedSessions,
  };
}
