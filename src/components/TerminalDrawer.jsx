import { useState, useEffect, useRef, useCallback } from "react";
import { X, Plus, Terminal as TerminalIcon } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import { getPaneSurfaceStyle } from "../utils/paneSurface";
import { getWallpaperImageFilter } from "../utils/wallpaper";
import { MAC_TRAFFIC_LIGHT_SAFE_WIDTH, WINDOW_DRAG_HEIGHT } from "../windowChrome";

// ── Shared style helpers ──────────────────────────────────────────────────────

const FONT_FAMILY = "'JetBrains Mono','Fira Code',monospace";
const XTERM_TRANSPARENT = "rgba(0,0,0,0)";
const TERMINAL_OPAQUE_BG = "#0D0D10";
const ESC = "\x1b";
const CLICK_CURSOR_MOVE_MAX_MS = 500;
const CLICK_CURSOR_MOVE_DRAG_PX = 5;
const DELETE_SEQUENCE = `${ESC}[3~`;

const Direction = Object.freeze({
  UP: "A",
  DOWN: "B",
  RIGHT: "C",
  LEFT: "D",
});

function getWallpaperOpacityValue(wallpaper) {
  if (!Number.isFinite(wallpaper?.imgOpacity)) return 1;
  return Math.min(1, Math.max(0, wallpaper.imgOpacity / 100));
}

function getTerminalWallpaperOverlayAlpha(wallpaper) {
  return 0.52 + getWallpaperOpacityValue(wallpaper) * 0.18;
}

function getTerminalTheme(opaqueBackground) {
  return {
    background: opaqueBackground ? TERMINAL_OPAQUE_BG : XTERM_TRANSPARENT,
    foreground: "rgba(244,247,250,0.88)",
    cursor: "rgba(245,247,251,0.98)",
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

function getCoordsRelativeToElement(event, element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const elementStyle = window.getComputedStyle(element);
  const leftPadding = parseInt(elementStyle.getPropertyValue("padding-left"), 10) || 0;
  const topPadding = parseInt(elementStyle.getPropertyValue("padding-top"), 10) || 0;
  return [
    event.clientX - rect.left - leftPadding,
    event.clientY - rect.top - topPadding,
  ];
}

function getTerminalCoords(term, event) {
  const element = term?.element;
  const cssCellWidth = term?.dimensions?.css?.cell?.width;
  const cssCellHeight = term?.dimensions?.css?.cell?.height;
  if (!element || !cssCellWidth || !cssCellHeight) return null;

  const coords = getCoordsRelativeToElement(event, element);
  if (!coords) return null;

  const x = Math.min(Math.max(Math.ceil(coords[0] / cssCellWidth), 1), term.cols);
  const y = Math.min(Math.max(Math.ceil(coords[1] / cssCellHeight), 1), term.rows);
  return { x: x - 1, y: y - 1 };
}

function repeatSequence(count, str) {
  let result = "";
  for (let i = 0; i < Math.floor(count); i += 1) {
    result += str;
  }
  return result;
}

function directionSequence(direction, applicationCursor) {
  return `${ESC}${applicationCursor ? "O" : "["}${direction}`;
}

function colsFromRowBeginning(currX) {
  return currX - 1;
}

function colsFromRowEnd(currX, cols) {
  return cols - currX;
}

function getWrappedRowsForAbsoluteRow(bufferService, absoluteRow) {
  let rowCount = 0;
  let currentRow = absoluteRow;
  let line = bufferService?.buffer?.lines?.get(currentRow);
  let lineWraps = line?.isWrapped;

  while (lineWraps && currentRow >= 0) {
    rowCount += 1;
    currentRow -= 1;
    line = bufferService?.buffer?.lines?.get(currentRow);
    lineWraps = line?.isWrapped;
  }

  return rowCount;
}

function getWrappedRowsCount(startAbsoluteRow, targetAbsoluteRow, bufferService) {
  let wrappedRows = 0;
  const startRow = startAbsoluteRow - getWrappedRowsForAbsoluteRow(bufferService, startAbsoluteRow);
  const endRow = targetAbsoluteRow - getWrappedRowsForAbsoluteRow(bufferService, targetAbsoluteRow);
  const direction = startAbsoluteRow > targetAbsoluteRow ? -1 : 1;

  for (let i = 0; i < Math.abs(startRow - endRow); i += 1) {
    const line = bufferService?.buffer?.lines?.get(startRow + (direction * i));
    if (line?.isWrapped) wrappedRows += 1;
  }

  return wrappedRows;
}

function bufferLineBetween(startCol, startAbsoluteRow, endCol, endAbsoluteRow, forward, bufferService) {
  const buffer = bufferService?.buffer;
  if (!buffer) return "";

  let currentCol = startCol;
  let currentRow = startAbsoluteRow;
  let bufferStr = "";
  let localStartCol = startCol;

  while ((currentCol !== endCol || currentRow !== endAbsoluteRow)
    && currentRow >= 0
    && currentRow < buffer.lines.length) {
    currentCol += forward ? 1 : -1;

    if (forward && currentCol > bufferService.cols - 1) {
      bufferStr += buffer.translateBufferLineToString(currentRow, false, localStartCol, currentCol);
      currentCol = 0;
      localStartCol = 0;
      currentRow += 1;
    } else if (!forward && currentCol < 0) {
      bufferStr += buffer.translateBufferLineToString(currentRow, false, 0, localStartCol + 1);
      currentCol = bufferService.cols - 1;
      localStartCol = currentCol;
      currentRow -= 1;
    }
  }

  return bufferStr + buffer.translateBufferLineToString(currentRow, false, localStartCol, currentCol);
}

function getHorizontalDirection(startX, startAbsoluteRow, targetX, targetAbsoluteRow, bufferService, applicationCursor) {
  let startRow;
  if (moveToRequestedRow(startAbsoluteRow, targetAbsoluteRow, bufferService, applicationCursor).length > 0) {
    startRow = targetAbsoluteRow - getWrappedRowsForAbsoluteRow(bufferService, targetAbsoluteRow);
  } else {
    startRow = startAbsoluteRow;
  }

  if ((startX < targetX && startRow <= targetAbsoluteRow)
    || (startX >= targetX && startRow < targetAbsoluteRow)) {
    return Direction.RIGHT;
  }
  return Direction.LEFT;
}

function moveToRequestedRow(startAbsoluteRow, targetAbsoluteRow, bufferService, applicationCursor) {
  const startRow = startAbsoluteRow - getWrappedRowsForAbsoluteRow(bufferService, startAbsoluteRow);
  const endRow = targetAbsoluteRow - getWrappedRowsForAbsoluteRow(bufferService, targetAbsoluteRow);
  const rowsToMove = Math.abs(startRow - endRow) - getWrappedRowsCount(startAbsoluteRow, targetAbsoluteRow, bufferService);
  const direction = startAbsoluteRow > targetAbsoluteRow ? Direction.UP : Direction.DOWN;
  return repeatSequence(rowsToMove, directionSequence(direction, applicationCursor));
}

function resetStartingRow(startX, startAbsoluteRow, targetX, targetAbsoluteRow, bufferService, applicationCursor) {
  if (moveToRequestedRow(startAbsoluteRow, targetAbsoluteRow, bufferService, applicationCursor).length === 0) {
    return "";
  }
  return repeatSequence(
    bufferLineBetween(
      startX,
      startAbsoluteRow,
      startX,
      startAbsoluteRow - getWrappedRowsForAbsoluteRow(bufferService, startAbsoluteRow),
      false,
      bufferService
    ).length,
    directionSequence(Direction.LEFT, applicationCursor)
  );
}

function moveToRequestedCol(startX, startAbsoluteRow, targetX, targetAbsoluteRow, bufferService, applicationCursor) {
  const startRow = moveToRequestedRow(startAbsoluteRow, targetAbsoluteRow, bufferService, applicationCursor).length > 0
    ? targetAbsoluteRow - getWrappedRowsForAbsoluteRow(bufferService, targetAbsoluteRow)
    : startAbsoluteRow;
  const direction = getHorizontalDirection(
    startX,
    startAbsoluteRow,
    targetX,
    targetAbsoluteRow,
    bufferService,
    applicationCursor
  );

  return repeatSequence(
    bufferLineBetween(
      startX,
      startRow,
      targetX,
      targetAbsoluteRow,
      direction === Direction.RIGHT,
      bufferService
    ).length,
    directionSequence(direction, applicationCursor)
  );
}

function buildMoveToAbsoluteCellSequence(term, targetX, targetAbsoluteRow) {
  const core = term?._core;
  const bufferService = core?._bufferService;
  const buffer = term?.buffer?.active;
  if (!bufferService || !buffer) return "";

  const startX = buffer.cursorX;
  const startAbsoluteRow = buffer.baseY + buffer.cursorY;
  const applicationCursor = Boolean(term?.modes?.applicationCursorKeysMode);

  if (buffer.type !== "alternate") {
    if (startAbsoluteRow === targetAbsoluteRow) {
      const direction = startX > targetX ? Direction.LEFT : Direction.RIGHT;
      return repeatSequence(Math.abs(startX - targetX), directionSequence(direction, applicationCursor));
    }

    const direction = startAbsoluteRow > targetAbsoluteRow ? Direction.LEFT : Direction.RIGHT;
    const rowDifference = Math.abs(startAbsoluteRow - targetAbsoluteRow);
    const cellsToMove = colsFromRowEnd(startAbsoluteRow > targetAbsoluteRow ? targetX : startX, bufferService.cols)
      + ((rowDifference - 1) * bufferService.cols)
      + 1
      + colsFromRowBeginning(startAbsoluteRow > targetAbsoluteRow ? startX : targetX);

    return repeatSequence(cellsToMove, directionSequence(direction, applicationCursor));
  }

  return resetStartingRow(startX, startAbsoluteRow, targetX, targetAbsoluteRow, bufferService, applicationCursor)
    + moveToRequestedRow(startAbsoluteRow, targetAbsoluteRow, bufferService, applicationCursor)
    + moveToRequestedCol(startX, startAbsoluteRow, targetX, targetAbsoluteRow, bufferService, applicationCursor);
}

function buildMoveToCellSequence(term, targetX, targetY) {
  const buffer = term?.buffer?.active;
  if (!buffer) return "";
  return buildMoveToAbsoluteCellSequence(term, targetX, buffer.baseY + targetY);
}

function getPromptSelectionEditContext(term) {
  const range = term?.getSelectionPosition?.();
  const selectionText = term?.getSelection?.() || "";
  const buffer = term?.buffer?.active;
  const bufferService = term?._core?._bufferService;

  if (!range || !selectionText || !buffer || !bufferService) {
    return null;
  }

  if (term.modes.mouseTrackingMode !== "none") return null;
  if (buffer.type !== "normal") return null;
  if (buffer.baseY !== buffer.viewportY) return null;

  const currentAbsoluteRow = buffer.baseY + buffer.cursorY;
  const currentWrappedStart = currentAbsoluteRow - getWrappedRowsForAbsoluteRow(bufferService, currentAbsoluteRow);
  const start = range.start;
  const end = range.end;

  if (!start || !end) return null;
  if (start.y < currentWrappedStart || end.y > currentAbsoluteRow) return null;

  const deleteCount = bufferLineBetween(start.x, start.y, end.x, end.y, true, bufferService).length;
  if (!deleteCount) return null;

  return {
    startX: start.x,
    startAbsoluteRow: start.y,
    deleteCount,
    moveSequence: buildMoveToAbsoluteCellSequence(term, start.x, start.y),
    deleteSequence: repeatSequence(deleteCount, DELETE_SEQUENCE),
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
  plainClickMovesCursor = false,
  promptUndoShortcut = false,
  promptSelectionEditing = false,
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
  const fitTimersRef = useRef([]);
  const lastSyncedPtySizeRef = useRef("");
  const mouseGestureRef = useRef(null);

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
    fitTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    fitTimersRef.current = [];
    lastSyncedPtySizeRef.current = "";
    roRef.current?.disconnect();
    roRef.current = null;

    if (termRef.current) {
      const prevName = termRef.current.__sessionName;
      if (prevName) unregRef.current(prevName);
      delete termRef.current.__raylineFit;
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
        cursorStyle: "underline",
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

      term.attachCustomKeyEventHandler((event) => {
        if (!promptUndoShortcut || event.type !== "keydown") {
          // continue into other detached-terminal prompt shortcuts below
        } else {
          const isPromptUndoShortcut = event.metaKey
            && !event.ctrlKey
            && !event.altKey
            && !event.shiftKey
            && event.code === "KeyZ";

          if (isPromptUndoShortcut) {
            if (term.modes.mouseTrackingMode !== "none" || term.buffer.active.type !== "normal") {
              return true;
            }

            event.preventDefault();
            event.stopPropagation();
            term.clearSelection();
            term.focus();
            term.input("\x1f", true);
            emitTerminalDebug("session:prompt-undo-shortcut", {
              sessionName,
              cols: term.cols,
              rows: term.rows,
            });
            return false;
          }
        }

        if (event.type !== "keydown") {
          return true;
        }

        if (!promptSelectionEditing) {
          return true;
        }

        const selectionEdit = getPromptSelectionEditContext(term);
        if (!selectionEdit) return true;

        const isPlainPrintable = event.key.length === 1
          && !event.metaKey
          && !event.ctrlKey
          && !event.altKey;
        const isDeleteKey = event.key === "Backspace" || event.key === "Delete";
        if (!isPlainPrintable && !isDeleteKey) {
          return true;
        }

        event.preventDefault();
        event.stopPropagation();
        term.clearSelection();
        term.focus();
        term.input(`${selectionEdit.moveSequence}${selectionEdit.deleteSequence}${isPlainPrintable ? event.key : ""}`, true);
        emitTerminalDebug("session:prompt-selection-edit", {
          sessionName,
          action: isDeleteKey ? "delete-selection" : "replace-selection",
          deleteCount: selectionEdit.deleteCount,
          startX: selectionEdit.startX,
          startAbsoluteRow: selectionEdit.startAbsoluteRow,
        });
        return false;
      });

      const syncSessionSize = (reason, cols = term.cols, rows = term.rows) => {
        if (!cols || !rows) return;
        const sizeKey = `${cols}x${rows}`;
        if (lastSyncedPtySizeRef.current === sizeKey) return;
        lastSyncedPtySizeRef.current = sizeKey;
        resizeRef.current(sessionName, cols, rows);
        emitTerminalDebug("session:pty-resize-sync", {
          sessionName,
          reason,
          cols,
          rows,
          active: activeRef.current,
          container: measureElementBox(containerRef.current),
        });
      };

      term.onResize(({ cols, rows }) => {
        emitTerminalDebug("session:term-resize", {
          sessionName,
          cols,
          rows,
          active: activeRef.current,
          container: measureElementBox(containerRef.current),
        });
        syncSessionSize("term-resize", cols, rows);
      });

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
      syncSessionSize("initial-fit");

      fitAddonRef.current = fitAddon;
      termRef.current = term;
      term.__raylineFit = () => {
        if (!fitAddonRef.current || !containerRef.current) return;
        const box = measureElementBox(containerRef.current);
        if (!box?.clientWidth || !box?.clientHeight) return;
        try {
          fitAddonRef.current.fit();
          syncSessionSize("manual-fit");
          emitTerminalDebug("session:manual-fit", {
            sessionName,
            cols: term.cols,
            rows: term.rows,
            container: box,
          });
        } catch {
          // Ignore transient fit failures during reveal/layout transitions.
        }
      };

      const scheduleDeferredFits = (delays, phase) => {
        fitTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        fitTimersRef.current = delays.map((delay) => window.setTimeout(() => {
          if (cancelled) return;
          term.__raylineFit?.();
          emitTerminalDebug("session:deferred-fit", { sessionName, phase, delay });
        }, delay));
      };

      term.onData((data) => sendRef.current(sessionName, data));

      const handleMouseDown = (event) => {
        if (!plainClickMovesCursor || event.button !== 0 || event.detail !== 1) {
          mouseGestureRef.current = null;
          return;
        }
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
          mouseGestureRef.current = null;
          return;
        }
        if (event.target instanceof Element && event.target.closest("a")) {
          mouseGestureRef.current = null;
          return;
        }

        mouseGestureRef.current = {
          startX: event.clientX,
          startY: event.clientY,
          startTime: event.timeStamp,
          hadSelectionAtMouseDown: term.getSelection().length > 1,
          dragged: false,
        };
      };

      const handleMouseMove = (event) => {
        const gesture = mouseGestureRef.current;
        if (!gesture) return;
        if (
          Math.abs(event.clientX - gesture.startX) > CLICK_CURSOR_MOVE_DRAG_PX
          || Math.abs(event.clientY - gesture.startY) > CLICK_CURSOR_MOVE_DRAG_PX
        ) {
          gesture.dragged = true;
        }
      };

      const handleMouseUp = (event) => {
        const gesture = mouseGestureRef.current;
        mouseGestureRef.current = null;
        if (!gesture || !plainClickMovesCursor) return;
        if (gesture.dragged || gesture.hadSelectionAtMouseDown) return;
        if (event.button !== 0 || event.detail !== 1) return;
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.timeStamp - gesture.startTime > CLICK_CURSOR_MOVE_MAX_MS) return;
        if (term.modes.mouseTrackingMode !== "none") return;
        if (term.buffer.active.type !== "normal") return;
        if (term.buffer.active.baseY !== term.buffer.active.viewportY) return;
        if (term.getSelection().length > 1) return;

        const coords = getTerminalCoords(term, event);
        if (!coords) return;

        const sequence = buildMoveToCellSequence(term, coords.x, coords.y);
        if (!sequence) return;

        event.preventDefault();
        event.stopPropagation();
        term.clearSelection();
        term.focus();
        term.input(sequence, true);
        emitTerminalDebug("session:plain-click-cursor-move", {
          sessionName,
          targetX: coords.x,
          targetY: coords.y,
          cols: term.cols,
          rows: term.rows,
        });
      };

      term.element?.addEventListener("mousedown", handleMouseDown);
      term.element?.addEventListener("mousemove", handleMouseMove);
      term.element?.addEventListener("mouseup", handleMouseUp);

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

      term.__raylineFit?.();
      scheduleDeferredFits([0, 60, 180, 420], "startup");
      if (document.fonts?.ready) {
        document.fonts.ready.then(() => {
          if (cancelled) return;
          scheduleDeferredFits([0, 80], "fonts-ready");
        }).catch(() => {});
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
      mouseGestureRef.current = null;
      emitTerminalDebug("session:teardown", { sessionName });
      teardown();
    };
  }, [opaqueBackground, plainClickMovesCursor, promptSelectionEditing, promptUndoShortcut, sessionName, teardown]);

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
      try { termRef.current?.__raylineFit?.(); } catch { /* ignore transient fit failures */ }
      try { termRef.current?.focus(); } catch { /* ignore transient focus failures */ }
      window.requestAnimationFrame(() => {
        logActiveState("raf-2");
        try { termRef.current?.__raylineFit?.(); } catch { /* ignore transient fit failures */ }
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
  plainClickMovesCursor = false,
  promptUndoShortcut = false,
  promptSelectionEditing = false,
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
          plainClickMovesCursor={plainClickMovesCursor}
          promptUndoShortcut={promptUndoShortcut}
          promptSelectionEditing={promptSelectionEditing}
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

function TabBar({
  sessions,
  activeSession,
  onSelectSession,
  onKillSession,
  background = "transparent",
}) {
  const s = useFontScale();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        overflowX: "auto",
        background,
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        flexShrink: 0,
        scrollbarWidth: "none",
        padding: "5px 8px 4px",
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
              minHeight: 28,
              padding: "5px 10px",
              cursor: "pointer",
              flexShrink: 0,
              background: isActive
                ? "rgba(255,255,255,0.08)"
                : "rgba(255,255,255,0.018)",
              borderRadius: 7,
              transition: "background .15s, color .15s",
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
  windowControlsVisible = false,
  windowMode = false,
}) {
  const s = useFontScale();
  const [width, setWidth] = useState(480);
  const hasWallpaper = Boolean(wallpaper?.dataUrl);
  const overlayAlpha = getTerminalWallpaperOverlayAlpha(wallpaper);
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
        ...(windowMode
          ? { background: TERMINAL_OPAQUE_BG }
          : getPaneSurfaceStyle(hasWallpaper)),
        backdropFilter: windowMode ? "none" : (hasWallpaper ? "saturate(1.1)" : "blur(56px) saturate(1.1)"),
        borderLeft: windowMode ? "none" : "1px solid rgba(255,255,255,0.025)",
        position: "relative",
        zIndex: 10,
        overflow: "hidden",
        isolation: "isolate",
      }}
    >
      {windowMode && hasWallpaper && (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              pointerEvents: "none",
              backgroundImage: `url(${wallpaper.dataUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              filter: getWallpaperImageFilter(wallpaper),
              opacity: getWallpaperOpacityValue(wallpaper).toFixed(3),
              transform: wallpaper.imgBlur ? "scale(1.04)" : "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              pointerEvents: "none",
              background: `linear-gradient(180deg, rgba(13,13,16,${overlayAlpha.toFixed(2)}), rgba(9,9,11,${Math.min(overlayAlpha + 0.12, 0.84).toFixed(2)}))`,
            }}
          />
        </>
      )}
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
      {/* Spacer that clears the window controls area on Windows */}
      {windowControlsVisible && (
        <div style={{ height: WINDOW_DRAG_HEIGHT, flexShrink: 0 }} />
      )}

      {/* Header */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "relative",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: windowMode ? "flex-end" : "space-between",
              height: WINDOW_DRAG_HEIGHT,
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
              {(!windowMode || !windowControlsVisible) && (
                <IconButton onClick={windowMode ? onRequestClose : onToggleDrawer} title={windowMode ? "Close window" : "Close drawer"}>
                  <X size={13} strokeWidth={1.5} />
                </IconButton>
              )}
            </div>
          </div>

          {/* Tab bar — only when there are multiple sessions */}
          {sessions.length > 1 && (
            <TabBar
              sessions={sessions}
              activeSession={activeSession}
              onSelectSession={onSelectSession}
              onKillSession={onKillSession}
              background="transparent"
            />
          )}
        </div>
      </div>

      {/* Content */}
      {sessions.length === 0 ? (
        <EmptyState onCreate={handleCreate} blank={windowMode} />
      ) : (
        <div
          style={{
            position: "relative",
            zIndex: 2,
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <TerminalViewport
            sessions={sessions}
            activeSession={activeSession}
            opaqueBackground={windowMode && !hasWallpaper}
            plainClickMovesCursor={windowMode}
            promptUndoShortcut={windowMode && isMac}
            promptSelectionEditing={windowMode}
            onSendInput={onSendInput}
            onResizeSession={onResizeSession}
            registerTerminal={registerTerminal}
            unregisterTerminal={unregisterTerminal}
          />
        </div>
      )}
    </div>
  );
}
