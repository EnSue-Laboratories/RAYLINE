import { useState, useCallback, useEffect, useRef } from "react";

export default function useTerminal() {
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

      // If new sessions appeared, auto-open the drawer and focus the newest
      if (hasNew && incoming.length > 0) {
        setDrawerOpen(true);
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

  // Clear any stale saved metadata on mount (we start with zero terminals)
  useEffect(() => {
    window.api?.terminalSavedMetadata?.();
  }, []);

  // ── Exposed functions ───────────────────────────────────────────────────────

  const createSession = useCallback(async ({ name, command, cwd }) => {
    if (!window.api?.terminalCreate) return;
    try {
      await window.api.terminalCreate({ name, command, cwd });
      await refreshSessions();
      setActiveSession(name);
      setDrawerOpen(true);
    } catch (e) {
      console.error("[useTerminal] createSession failed:", e);
    }
  }, [refreshSessions]);

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
    drawerOpen,
    terminalRefs,
    createSession,
    sendInput,
    killSession,
    resizeSession,
    focusSession,
    focusActiveSession,
    refreshSessions,
    registerTerminal,
    unregisterTerminal,
    setActiveSession,
    setDrawerOpen,
  };
}
