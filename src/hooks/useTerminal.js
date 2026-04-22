import { useState, useCallback, useEffect, useRef } from "react";

export default function useTerminal() {
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [windowOpen, setWindowOpen] = useState(false);

  // Maps session name -> xterm.Terminal instance
  const terminalRefs = useRef(new Map());
  // Track known session names so we can detect new ones from MCP/external creation
  const knownSessionNames = useRef(new Set());

  // ── Internal helpers ────────────────────────────────────────────────────────

  const refreshSessions = useCallback(async () => {
    if (!window.api?.terminalList) return;
    try {
      const result = await window.api.terminalList();
      // listSessions returns a plain array
      const incoming = Array.isArray(result) ? result : (result?.sessions ?? []);
      const incomingNames = new Set(incoming.map((s) => s.name));

      // Detect sessions created externally (e.g. by Claude via MCP)
      let hasNew = false;
      for (const name of incomingNames) {
        if (!knownSessionNames.current.has(name)) {
          hasNew = true;
          break;
        }
      }
      knownSessionNames.current = incomingNames;

      setSessions(incoming);

      // If new sessions appeared, auto-open the detached terminal window and
      // focus the newest session.
      if (hasNew && incoming.length > 0) {
        window.api?.openTerminalWindow?.();
        // Focus the newest session (last in list, or one not previously known)
        const newest = incoming[incoming.length - 1];
        setActiveSession((prev) => {
          if (prev && incomingNames.has(prev)) return prev;
          return newest?.name ?? null;
        });
      } else {
        setActiveSession((prev) => {
          const still = incoming.some((s) => s.name === prev);
          if (still) return prev;
          return incoming[0]?.name ?? null;
        });
      }
    } catch (e) {
      console.error("[useTerminal] refreshSessions failed:", e);
    }
  }, []);

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
    refreshSessions,
    registerTerminal,
    unregisterTerminal,
    setActiveSession,
    setDrawerOpen,
  };
}
