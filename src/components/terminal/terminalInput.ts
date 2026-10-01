import type { Terminal } from "@xterm/xterm";
import {
  buildMoveToCellSequence,
  getBufferService,
  getPromptSelectionEditContext,
  getTerminalCellFromEvent,
} from "./cursorMove";
import { emitTerminalDebug } from "./debug";

const CLICK_CURSOR_MOVE_MAX_MS = 500;
const CLICK_CURSOR_MOVE_DRAG_PX = 5;

export interface TerminalInputOptions {
  sessionName: string;
  /** Detached window only: a plain click moves the prompt cursor there. */
  plainClickMovesCursor: boolean;
  /** Detached window on macOS only: ⌘Z sends readline undo (^_). */
  promptUndoShortcut: boolean;
  /** Detached window only: typing over a prompt selection replaces it. */
  promptSelectionEditing: boolean;
}

function hasModifier(event: MouseEvent | KeyboardEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function copySelection(term: Terminal): boolean {
  if (!term.hasSelection()) return false;
  void window.api?.writeClipboardText?.(term.getSelection());
  term.clearSelection();
  return true;
}

function pasteClipboard(term: Terminal): void {
  void window.api?.readClipboardText?.().then((text) => {
    if (text) term.input(text, true);
  });
}

/** Builds the `attachCustomKeyEventHandler` callback (false = handled). */
export function createKeyEventHandler(term: Terminal, options: TerminalInputOptions): (event: KeyboardEvent) => boolean {
  const { sessionName, promptUndoShortcut, promptSelectionEditing } = options;

  return (event) => {
    if (event.type !== "keydown") return true;

    if (promptUndoShortcut && event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.code === "KeyZ") {
      if (term.modes.mouseTrackingMode !== "none" || term.buffer.active.type !== "normal") return true;
      event.preventDefault();
      event.stopPropagation();
      term.clearSelection();
      term.focus();
      term.input("\x1f", true);
      emitTerminalDebug("session:prompt-undo-shortcut", { sessionName, cols: term.cols, rows: term.rows });
      return false;
    }

    const plainCtrl = event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    if (plainCtrl && event.code === "KeyC" && copySelection(term)) return false;
    if (plainCtrl && event.code === "KeyV") {
      event.preventDefault();
      event.stopPropagation();
      pasteClipboard(term);
      return false;
    }

    if (!promptSelectionEditing) return true;

    const bufferService = getBufferService(term);
    const selectionEdit = bufferService ? getPromptSelectionEditContext(term, bufferService) : null;
    if (!selectionEdit) return true;

    const isPlainPrintable = event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
    const isDeleteKey = event.key === "Backspace" || event.key === "Delete";
    if (!isPlainPrintable && !isDeleteKey) return true;

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
  };
}

interface MouseGesture {
  startX: number;
  startY: number;
  startTime: number;
  hadSelectionAtMouseDown: boolean;
  dragged: boolean;
}

/**
 * Right-click copies the selection (or pastes), and — when enabled — a plain
 * single click on the prompt line moves the shell cursor there. Returns a
 * cleanup that removes the listeners.
 */
export function attachMouseHandlers(term: Terminal, options: TerminalInputOptions): () => void {
  const element = term.element;
  if (!element) return () => {};
  const { sessionName, plainClickMovesCursor } = options;
  let gesture: MouseGesture | null = null;

  const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    if (!copySelection(term)) pasteClipboard(term);
  };

  const handleMouseDown = (event: MouseEvent) => {
    gesture = null;
    if (!plainClickMovesCursor || event.button !== 0 || event.detail !== 1 || hasModifier(event)) return;
    if (event.target instanceof Element && event.target.closest("a")) return;
    gesture = {
      startX: event.clientX,
      startY: event.clientY,
      startTime: event.timeStamp,
      hadSelectionAtMouseDown: term.getSelection().length > 1,
      dragged: false,
    };
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!gesture) return;
    if (
      Math.abs(event.clientX - gesture.startX) > CLICK_CURSOR_MOVE_DRAG_PX
      || Math.abs(event.clientY - gesture.startY) > CLICK_CURSOR_MOVE_DRAG_PX
    ) {
      gesture.dragged = true;
    }
  };

  const handleMouseUp = (event: MouseEvent) => {
    const current = gesture;
    gesture = null;
    if (!current || !plainClickMovesCursor) return;
    if (current.dragged || current.hadSelectionAtMouseDown) return;
    if (event.button !== 0 || event.detail !== 1 || hasModifier(event)) return;
    if (event.timeStamp - current.startTime > CLICK_CURSOR_MOVE_MAX_MS) return;
    const buffer = term.buffer.active;
    if (term.modes.mouseTrackingMode !== "none" || buffer.type !== "normal" || buffer.baseY !== buffer.viewportY) return;
    if (term.getSelection().length > 1) return;

    const coords = getTerminalCellFromEvent(term, event);
    const bufferService = getBufferService(term);
    if (!coords || !bufferService) return;

    const sequence = buildMoveToCellSequence(term, bufferService, coords.x, coords.y);
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

  element.addEventListener("mousedown", handleMouseDown);
  element.addEventListener("mousemove", handleMouseMove);
  element.addEventListener("mouseup", handleMouseUp);
  element.addEventListener("contextmenu", handleContextMenu);

  return () => {
    gesture = null;
    element.removeEventListener("mousedown", handleMouseDown);
    element.removeEventListener("mousemove", handleMouseMove);
    element.removeEventListener("mouseup", handleMouseUp);
    element.removeEventListener("contextmenu", handleContextMenu);
  };
}
