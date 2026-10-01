import { memo, useRef } from "react";
import { getTerminalHostBackground } from "./theme";
import type { TerminalHandle } from "./types";
import { useXtermSession } from "./useXtermSession";

export interface SessionTerminalProps {
  sessionName: string;
  isActive: boolean;
  opaqueBackground?: boolean;
  plainClickMovesCursor?: boolean;
  promptUndoShortcut?: boolean;
  promptSelectionEditing?: boolean;
  onSendInput: (name: string, data: string) => void;
  onResizeSession: (name: string, cols: number, rows: number) => void;
  registerTerminal: (name: string, handle: TerminalHandle) => void;
  unregisterTerminal: (name: string, handle?: TerminalHandle) => void;
}

/**
 * One PTY session. Inactive sessions stay mounted (scrollback and state are
 * kept) but are moved off-screen, and their output is buffered until shown.
 */
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
}: SessionTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useXtermSession(containerRef, {
    sessionName,
    isActive,
    opaqueBackground,
    plainClickMovesCursor,
    promptUndoShortcut,
    promptSelectionEditing,
    onSendInput,
    onResizeSession,
    registerTerminal,
    unregisterTerminal,
  });

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
          background: getTerminalHostBackground(opaqueBackground),
          padding: "10px 6px 8px",
          boxSizing: "border-box",
          minHeight: 0,
        }}
      />
    </div>
  );
}

export default memo(SessionTerminal);
