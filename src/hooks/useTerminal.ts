import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type {
  TerminalCreateOptions,
  TerminalCreateResult,
  TerminalSessionInfo,
} from "@shared/terminal/types";
import { useStableCallback } from "./useStableCallback";
import { reconcileSessionList, resolveActiveSession } from "../components/terminal/sessionSnapshot";
import type { TerminalHandle } from "../components/terminal/types";

type DrawerOpenUpdate = boolean | ((open: boolean) => boolean);

export interface TerminalApi {
  sessions: TerminalSessionInfo[];
  activeSession: string | null;
  /** Alias of `windowOpen` kept for older call sites. */
  drawerOpen: boolean;
  windowOpen: boolean;
  hasLoadedSessions: boolean;
  /** session name → mounted xterm handle */
  terminalRefs: RefObject<Map<string, TerminalHandle>>;
  createSession: (options: TerminalCreateOptions) => Promise<TerminalCreateResult>;
  sendInput: (name: string, text: string) => void;
  killSession: (name: string) => Promise<void>;
  resizeSession: (name: string, cols: number, rows: number) => void;
  openWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  focusSession: (name: string | null) => void;
  focusActiveSession: () => void;
  refitSession: (name: string | null) => void;
  refitActiveSession: () => void;
  refreshSessions: () => Promise<void>;
  registerTerminal: (name: string, handle: TerminalHandle) => void;
  unregisterTerminal: (name: string, handle?: TerminalHandle) => void;
  setActiveSession: (name: string | null) => void;
  setDrawerOpen: (next: DrawerOpenUpdate) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Terminal sessions for the main and terminal windows.
 *
 * Session state is push-driven (`terminal-sessions-state`); there is one
 * initial `terminal-list` fetch and no polling. Snapshots equal to the
 * current list keep the previous array, and the returned object plus all its
 * callbacks are referentially stable between session changes, so consumers
 * (App passes these down) don't re-render on idle.
 */
export default function useTerminal(): TerminalApi {
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const [activeSession, setActiveSessionState] = useState<string | null>(null);
  const [windowOpen, setWindowOpen] = useState(false);
  const [hasLoadedSessions, setHasLoadedSessions] = useState(false);

  const terminalRefs = useRef(new Map<string, TerminalHandle>());
  const pendingPreferredSessionRef = useRef<string | null>(null);

  // ── Internal helpers ────────────────────────────────────────────────────────

  const applySessionSnapshot = useCallback((incoming: TerminalSessionInfo[] | undefined, preferredSessionName?: string | null) => {
    const nextSessions = Array.isArray(incoming) ? incoming : [];
    const preferred = preferredSessionName ?? pendingPreferredSessionRef.current ?? null;
    if (preferred && nextSessions.some((session) => session.name === preferred)) {
      pendingPreferredSessionRef.current = null;
    }
    setSessions((prev) => reconcileSessionList(prev, nextSessions));
    setHasLoadedSessions(true);
    setActiveSessionState((prev) => resolveActiveSession(prev, nextSessions, preferred).active);
  }, []);

  const refreshSessions = useCallback(async () => {
    if (!window.api?.terminalList) return;
    try {
      applySessionSnapshot(await window.api.terminalList());
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

  const setDrawerOpen = useStableCallback(async (next: DrawerOpenUpdate) => {
    const resolved = typeof next === "function" ? next(windowOpen) : next;
    if (resolved) {
      await openWindow();
    } else {
      await closeWindow();
    }
  });

  // ── Lifecycle effects ───────────────────────────────────────────────────────

  // Pipe PTY output into the mounted xterm handles (each buffers while hidden).
  useEffect(() => {
    if (!window.api?.onTerminalOutput) return;
    return window.api.onTerminalOutput(({ name, data }) => {
      terminalRefs.current.get(name)?.write(data);
    });
  }, []);

  useEffect(() => {
    if (!window.api?.isTerminalWindowOpen) return;

    let cancelled = false;
    window.api.isTerminalWindowOpen().then((open) => {
      if (!cancelled) setWindowOpen(Boolean(open));
    }).catch((e: unknown) => {
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
    return window.api.onTerminalSessionsState((payload) => {
      const createdName = payload.reason === "created" && payload.name ? payload.name : null;
      if (createdName) pendingPreferredSessionRef.current = createdName;
      applySessionSnapshot(payload.sessions, createdName);
    });
  }, [applySessionSnapshot]);

  // Clear any stale saved metadata on mount (we start with zero terminals).
  useEffect(() => {
    window.api?.terminalSavedMetadata?.().catch(() => {});
  }, []);

  // One-time initial fetch; afterwards `terminal-sessions-state` pushes every
  // change (created / exited / killed), so there is no polling.
  useEffect(() => {
    const kickoff = window.setTimeout(() => {
      void (async () => {
        try {
          const preferredSessionName = await window.api?.terminalConsumePreferredSession?.();
          if (preferredSessionName) pendingPreferredSessionRef.current = preferredSessionName;
        } catch (e) {
          console.error("[useTerminal] terminalConsumePreferredSession failed:", e);
        }
        await refreshSessions();
      })();
    }, 0);
    return () => window.clearTimeout(kickoff);
  }, [refreshSessions]);

  // ── Exposed functions ───────────────────────────────────────────────────────

  const createSession = useCallback(async ({ name, command, cwd, reveal = true }: TerminalCreateOptions): Promise<TerminalCreateResult> => {
    if (!window.api?.terminalCreate) return { error: "Terminal API unavailable" };
    try {
      pendingPreferredSessionRef.current = name;
      const result = await window.api.terminalCreate({ name, command, cwd, reveal });
      if ("error" in result) {
        pendingPreferredSessionRef.current = null;
        console.error("[useTerminal] createSession failed:", result.error);
        return result;
      }
      await refreshSessions();
      setActiveSessionState(name);
      if (reveal) await openWindow();
      return result;
    } catch (e) {
      console.error("[useTerminal] createSession failed:", e);
      pendingPreferredSessionRef.current = null;
      return { error: errorMessage(e) };
    }
  }, [openWindow, refreshSessions]);

  const sendInput = useCallback((name: string, text: string) => {
    if (!window.api?.terminalSend) return;
    void window.api.terminalSend({ name, text });
  }, []);

  const killSession = useCallback(async (name: string) => {
    if (!window.api?.terminalKill) return;
    try {
      await window.api.terminalKill({ name });
    } catch (e) {
      console.error("[useTerminal] killSession failed:", e);
    }
    terminalRefs.current.delete(name);
    await refreshSessions();
  }, [refreshSessions]);

  const resizeSession = useCallback((name: string, cols: number, rows: number) => {
    if (!window.api?.terminalResize) return;
    void window.api.terminalResize({ name, cols, rows });
  }, []);

  const focusSession = useCallback((name: string | null) => {
    if (!name) return;
    const handle = terminalRefs.current.get(name);
    if (!handle) return;
    window.requestAnimationFrame(() => {
      try {
        handle.focus();
      } catch (e) {
        console.error("[useTerminal] focusSession failed:", e);
      }
    });
  }, []);

  const refitSession = useCallback((name: string | null) => {
    if (!name) return;
    const handle = terminalRefs.current.get(name);
    if (!handle) return;
    window.requestAnimationFrame(() => {
      try {
        handle.fit();
      } catch (e) {
        console.error("[useTerminal] refitSession failed:", e);
      }
    });
  }, []);

  const focusActiveSession = useStableCallback(() => focusSession(activeSession));
  const refitActiveSession = useStableCallback(() => refitSession(activeSession));

  const registerTerminal = useCallback((name: string, handle: TerminalHandle) => {
    terminalRefs.current.set(name, handle);
  }, []);

  const unregisterTerminal = useCallback((name: string, handle?: TerminalHandle) => {
    // Ignore a stale teardown when a newer handle already took the name.
    if (handle && terminalRefs.current.get(name) !== handle) return;
    terminalRefs.current.delete(name);
  }, []);

  const setActiveSession = useCallback((name: string | null) => {
    pendingPreferredSessionRef.current = null;
    setActiveSessionState(name);
  }, []);

  return useMemo<TerminalApi>(() => ({
    sessions,
    activeSession,
    drawerOpen: windowOpen,
    windowOpen,
    hasLoadedSessions,
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
  }), [
    sessions,
    activeSession,
    windowOpen,
    hasLoadedSessions,
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
  ]);
}
