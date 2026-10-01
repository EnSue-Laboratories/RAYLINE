import { useEffect, useRef, type RefObject } from "react";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { useStableCallback } from "../../hooks/useStableCallback";
import { emitTerminalDebug, measureElementBox, type ElementBox } from "./debug";
import { TerminalOutputBuffer } from "./outputBuffer";
import { attachMouseHandlers, createKeyEventHandler, type TerminalInputOptions } from "./terminalInput";
import {
  DEFAULT_FONT_FAMILY,
  applyTerminalVisualState,
  getResolvedThemeMode,
  getTerminalHostBackground,
  getTerminalTheme,
  readRootCssVar,
  type ThemeChangeDetail,
} from "./theme";
import type { TerminalHandle } from "./types";
import { loadXtermModules } from "./xtermLoader";

export interface XtermSessionOptions extends TerminalInputOptions {
  isActive: boolean;
  opaqueBackground: boolean;
  onSendInput: (name: string, data: string) => void;
  onResizeSession: (name: string, cols: number, rows: number) => void;
  registerTerminal: (name: string, handle: TerminalHandle) => void;
  unregisterTerminal: (name: string, handle?: TerminalHandle) => void;
}

interface MountedSession {
  term: Terminal;
  fitAddon: FitAddon;
  hostEl: HTMLDivElement;
  output: TerminalOutputBuffer;
  handle: TerminalHandle;
}

const SCROLLBACK_PRELOAD_LINES = 500;

/** Output is written live only for the active session of a visible document. */
function isOutputVisible(active: boolean): boolean {
  return active && (typeof document === "undefined" || document.visibilityState !== "hidden");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Owns one xterm instance inside `containerRef`: lazy-loads xterm, mounts and
 * fits it, wires input / resize, preloads scrollback, and registers a
 * `TerminalHandle` with `useTerminal`. Output is buffered while the session
 * is inactive or the document is hidden and flushed when it is shown.
 */
export function useXtermSession(containerRef: RefObject<HTMLDivElement | null>, options: XtermSessionOptions): void {
  const {
    sessionName,
    isActive,
    opaqueBackground,
    plainClickMovesCursor,
    promptUndoShortcut,
    promptSelectionEditing,
  } = options;

  const sessionRef = useRef<MountedSession | null>(null);
  const activeRef = useRef(isActive);
  const opaqueBackgroundRef = useRef(opaqueBackground);
  const themeModeRef = useRef(getResolvedThemeMode());

  // Stable wrappers so the mount effect captures up-to-date callbacks without
  // restarting every time the parent re-renders.
  const sendInput = useStableCallback(options.onSendInput);
  const resizeSession = useStableCallback(options.onResizeSession);
  const registerTerminal = useStableCallback(options.registerTerminal);
  const unregisterTerminal = useStableCallback(options.unregisterTerminal);

  // ── Theme ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    opaqueBackgroundRef.current = opaqueBackground;
    const mounted = sessionRef.current;
    applyTerminalVisualState(mounted?.term ?? null, mounted?.hostEl ?? null, containerRef.current, opaqueBackground, themeModeRef.current);

    const handleThemeChange = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as ThemeChangeDetail | null) : null;
      themeModeRef.current = getResolvedThemeMode(detail);
      const current = sessionRef.current;
      applyTerminalVisualState(current?.term ?? null, current?.hostEl ?? null, containerRef.current, opaqueBackground, themeModeRef.current);
      window.requestAnimationFrame(() => {
        try { sessionRef.current?.handle.fit(); } catch { /* ignore theme-fit races */ }
      });
    };

    window.addEventListener("rayline:theme-change", handleThemeChange);
    window.addEventListener("rayline:appearance-change", handleThemeChange);
    return () => {
      window.removeEventListener("rayline:theme-change", handleThemeChange);
      window.removeEventListener("rayline:appearance-change", handleThemeChange);
    };
  }, [containerRef, opaqueBackground]);

  // ── Mount / teardown ───────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!sessionName || !container) return;

    let cancelled = false;
    let lastSyncedPtySize = "";
    let lastObservedBox: ElementBox | null = null;
    let fitTimers: number[] = [];
    let resizeObserver: ResizeObserver | null = null;
    let detachMouse: (() => void) | null = null;
    let mounted: MountedSession | null = null;
    const inputOptions: TerminalInputOptions = { sessionName, plainClickMovesCursor, promptUndoShortcut, promptSelectionEditing };

    emitTerminalDebug("session:init", { sessionName });

    const clearFitTimers = () => {
      fitTimers.forEach((timer) => window.clearTimeout(timer));
      fitTimers = [];
    };

    void (async () => {
      const { Terminal: XTerminal, FitAddon: XFitAddon } = await loadXtermModules();
      if (cancelled || !containerRef.current) return;

      const initialOpaque = opaqueBackgroundRef.current;
      const hostEl = document.createElement("div");
      hostEl.className = `rayline-terminal-host${initialOpaque ? " rayline-terminal-host--opaque" : ""}`;
      hostEl.style.cssText = `width:100%;height:100%;background:${getTerminalHostBackground(initialOpaque)};`;
      container.appendChild(hostEl);

      const term = new XTerminal({
        theme: getTerminalTheme(initialOpaque, themeModeRef.current),
        fontFamily: readRootCssVar("--font-mono", DEFAULT_FONT_FAMILY),
        fontSize: 13,
        fontWeight: "400",
        fontWeightBold: "600",
        lineHeight: 1.28,
        letterSpacing: 0,
        cursorBlink: true,
        cursorStyle: "underline",
        drawBoldTextInBrightColors: false,
        fastScrollSensitivity: 3,
        minimumContrastRatio: 1.2,
        rescaleOverlappingGlyphs: true,
        scrollback: 5000,
        smoothScrollDuration: 90,
        allowTransparency: true,
        allowProposedApi: true,
        rightClickSelectsWord: true,
      });
      const fitAddon = new XFitAddon();
      term.loadAddon(fitAddon);
      term.attachCustomKeyEventHandler(createKeyEventHandler(term, inputOptions));

      const syncSessionSize = (reason: string, cols = term.cols, rows = term.rows) => {
        if (!cols || !rows) return;
        const sizeKey = `${cols}x${rows}`;
        if (lastSyncedPtySize === sizeKey) return;
        lastSyncedPtySize = sizeKey;
        resizeSession(sessionName, cols, rows);
        emitTerminalDebug("session:pty-resize-sync", {
          sessionName, reason, cols, rows, active: activeRef.current, container: measureElementBox(container),
        });
      };

      term.onResize(({ cols, rows }) => {
        emitTerminalDebug("session:term-resize", {
          sessionName, cols, rows, active: activeRef.current, container: measureElementBox(container),
        });
        syncSessionSize("term-resize", cols, rows);
      });

      term.open(hostEl);
      emitTerminalDebug("session:open", { sessionName, container: measureElementBox(container), host: measureElementBox(hostEl) });

      await wait(30);
      if (cancelled) {
        term.dispose();
        hostEl.remove();
        return;
      }

      try { fitAddon.fit(); } catch { /* ignore early layout measurement failures */ }
      emitTerminalDebug("session:initial-fit", {
        sessionName, cols: term.cols, rows: term.rows, container: measureElementBox(container), host: measureElementBox(hostEl),
      });
      syncSessionSize("initial-fit");

      // Until the scrollback preload resolves, hold live output: every chunk
      // that arrives before the reply is already part of it.
      const output = new TerminalOutputBuffer((data) => term.write(data), "holding");
      const handle: TerminalHandle = {
        write: (data) => output.write(data),
        focus: () => term.focus(),
        fit: () => {
          const box = measureElementBox(container);
          if (!box?.clientWidth || !box.clientHeight) return;
          try {
            fitAddon.fit();
            syncSessionSize("manual-fit");
            emitTerminalDebug("session:manual-fit", { sessionName, cols: term.cols, rows: term.rows, container: box });
          } catch {
            // Ignore transient fit failures during reveal/layout transitions.
          }
        },
      };
      mounted = { term, fitAddon, hostEl, output, handle };
      sessionRef.current = mounted;

      const scheduleDeferredFits = (delays: number[], phase: string) => {
        clearFitTimers();
        fitTimers = delays.map((delay) => window.setTimeout(() => {
          if (cancelled) return;
          handle.fit();
          emitTerminalDebug("session:deferred-fit", { sessionName, phase, delay });
        }, delay));
      };

      term.onData((data) => sendInput(sessionName, data));
      detachMouse = attachMouseHandlers(term, inputOptions);
      registerTerminal(sessionName, handle);

      let preloaded = false;
      if (window.api?.terminalRead) {
        try {
          const result = await window.api.terminalRead({ name: sessionName, lines: SCROLLBACK_PRELOAD_LINES });
          if (!cancelled && "ok" in result && result.lines.length) {
            preloaded = true;
            output.clear();
            term.write(result.lines.join("\r\n"), () => {
              try { term.scrollToBottom(); } catch { /* ignore scroll restore races */ }
            });
          }
        } catch { /* ignore scrollback preload failures */ }
      }
      if (cancelled) return;
      if (!preloaded) output.flush();
      output.setMode(isOutputVisible(activeRef.current) ? "live" : "buffering");

      if (activeRef.current) term.focus();

      handle.fit();
      scheduleDeferredFits([0, 60, 180, 420], "startup");
      document.fonts?.ready.then(() => {
        if (!cancelled) scheduleDeferredFits([0, 80], "fonts-ready");
      }).catch(() => {});

      resizeObserver = new ResizeObserver(() => {
        const nextBox = measureElementBox(container);
        const changed = !lastObservedBox
          || lastObservedBox.clientWidth !== nextBox?.clientWidth
          || lastObservedBox.clientHeight !== nextBox?.clientHeight;
        lastObservedBox = nextBox;
        if (changed) {
          emitTerminalDebug("session:container-resize", {
            sessionName, active: activeRef.current, container: nextBox, colsBeforeFit: term.cols, rowsBeforeFit: term.rows,
          });
        }
        try { fitAddon.fit(); } catch { /* ignore transient resize fit failures */ }
      });
      resizeObserver.observe(container);
    })();

    return () => {
      cancelled = true;
      emitTerminalDebug("session:teardown", { sessionName });
      clearFitTimers();
      resizeObserver?.disconnect();
      detachMouse?.();
      if (mounted) {
        unregisterTerminal(sessionName, mounted.handle);
        mounted.output.clear();
        try { mounted.term.dispose(); } catch { /* ignore terminal dispose errors */ }
        mounted.hostEl.remove();
      }
      if (sessionRef.current === mounted) sessionRef.current = null;
    };
  }, [
    containerRef,
    plainClickMovesCursor,
    promptSelectionEditing,
    promptUndoShortcut,
    sessionName,
    sendInput,
    resizeSession,
    registerTerminal,
    unregisterTerminal,
  ]);

  // ── Visibility: buffer while hidden, flush + refit on show ─────────────────
  useEffect(() => {
    activeRef.current = isActive;

    const logActiveState = (phase: string) => {
      const current = sessionRef.current;
      emitTerminalDebug("session:active-state", {
        phase,
        sessionName,
        isActive,
        cols: current?.term.cols ?? null,
        rows: current?.term.rows ?? null,
        container: measureElementBox(containerRef.current),
        host: measureElementBox(current?.hostEl ?? null),
      });
    };

    const syncOutputMode = () => {
      const output = sessionRef.current?.output;
      if (output && output.currentMode !== "holding") output.setMode(isOutputVisible(activeRef.current) ? "live" : "buffering");
    };

    syncOutputMode();
    document.addEventListener("visibilitychange", syncOutputMode);

    logActiveState("effect");
    if (!isActive || !sessionRef.current) {
      return () => document.removeEventListener("visibilitychange", syncOutputMode);
    }

    const timeoutId = window.setTimeout(() => logActiveState("timeout-80ms"), 80);
    window.requestAnimationFrame(() => {
      logActiveState("raf-1");
      try { sessionRef.current?.handle.fit(); } catch { /* ignore transient fit failures */ }
      try { sessionRef.current?.term.focus(); } catch { /* ignore transient focus failures */ }
      window.requestAnimationFrame(() => {
        logActiveState("raf-2");
        try { sessionRef.current?.handle.fit(); } catch { /* ignore transient fit failures */ }
      });
    });

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", syncOutputMode);
    };
  }, [containerRef, isActive, sessionName]);
}
