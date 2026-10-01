import type { TerminalCreateOptions, TerminalCreateResult, TerminalSessionInfo } from "@shared/terminal/types";
import { useStableCallback } from "../hooks/useStableCallback";
import { getPaneSurfaceStyle } from "../utils/paneSurface";
import { WINDOW_DRAG_HEIGHT } from "../windowChrome";
import EmptyState from "./terminal/EmptyState";
import TerminalToolbar from "./terminal/TerminalToolbar";
import type { TerminalWallpaper } from "./terminal/theme";
import TerminalViewport from "./terminal/TerminalViewport";
import type { TerminalHandle } from "./terminal/types";
import { useDrawerResize } from "./terminal/useDrawerResize";
import WallpaperBackdrop from "./terminal/WallpaperBackdrop";

export interface TerminalDrawerProps {
  sessions: TerminalSessionInfo[];
  activeSession: string | null;
  onSelectSession: (name: string) => void;
  onCreateSession: (options: TerminalCreateOptions) => Promise<TerminalCreateResult> | void;
  onKillSession: (name: string) => void;
  onSendInput: (name: string, text: string) => void;
  onResizeSession: (name: string, cols: number, rows: number) => void;
  /** Drawer mode only: whether the drawer is shown. */
  drawerOpen?: boolean;
  /** Drawer mode close button. */
  onToggleDrawer?: () => void;
  /** Window mode close button. */
  onRequestClose?: () => void;
  registerTerminal: (name: string, handle: TerminalHandle) => void;
  unregisterTerminal: (name: string, handle?: TerminalHandle) => void;
  /** Working directory for sessions created from the "+" button. */
  cwd?: string | null;
  wallpaper?: TerminalWallpaper | null;
  windowControlsVisible?: boolean;
  /** Rendered as the dedicated terminal window instead of the in-app drawer. */
  windowMode?: boolean;
}

const IS_MAC = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || "");

/**
 * Terminal surface: the optional in-app drawer and the dedicated terminal
 * window. Pieces live in ./terminal/ — xterm lifecycle (useXtermSession),
 * toolbar + tabs, resize, theming.
 */
export default function TerminalDrawer({
  sessions,
  activeSession,
  onSelectSession,
  onCreateSession,
  onKillSession,
  onSendInput,
  onResizeSession,
  drawerOpen = false,
  onToggleDrawer,
  onRequestClose,
  registerTerminal,
  unregisterTerminal,
  cwd,
  wallpaper,
  windowControlsVisible = false,
  windowMode = false,
}: TerminalDrawerProps) {
  const { width, onPointerDown, onPointerMove, onPointerUp } = useDrawerResize(480);
  const wallpaperUrl = wallpaper?.dataUrl;
  const hasWallpaper = Boolean(wallpaperUrl);

  const handleCreate = useStableCallback(() => {
    void onCreateSession({ name: `shell-${Date.now()}`, cwd: cwd || undefined });
  });
  const handleClose = useStableCallback(() => {
    (windowMode ? onRequestClose : onToggleDrawer)?.();
  });

  if (!windowMode && !drawerOpen) return null;

  return (
    <div
      style={{
        width: windowMode ? "100%" : width,
        minWidth: windowMode ? 0 : 280,
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        ...(windowMode ? { background: "var(--bg-primary)" } : getPaneSurfaceStyle(hasWallpaper)),
        backdropFilter: !windowMode && hasWallpaper ? "saturate(1.1)" : "none",
        borderLeft: windowMode ? "none" : "1px solid var(--border)",
        position: "relative",
        zIndex: 10,
        overflow: "hidden",
        isolation: "isolate",
      }}
    >
      {windowMode && wallpaper && wallpaperUrl && <WallpaperBackdrop wallpaper={{ ...wallpaper, dataUrl: wallpaperUrl }} />}

      {/* Resize handle */}
      {!windowMode && (
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
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

      {/* Spacer that clears the window controls area on Windows (drawer mode only) */}
      {windowControlsVisible && !windowMode && <div style={{ height: WINDOW_DRAG_HEIGHT, flexShrink: 0 }} />}

      <TerminalToolbar
        sessions={sessions}
        activeSession={activeSession}
        onSelectSession={onSelectSession}
        onKillSession={onKillSession}
        onCreate={handleCreate}
        onClose={handleClose}
        windowMode={windowMode}
        windowControlsVisible={windowControlsVisible}
        isMac={IS_MAC}
      />

      {sessions.length === 0 ? (
        <EmptyState onCreate={handleCreate} blank={windowMode} />
      ) : (
        <div style={{ position: "relative", zIndex: 2, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <TerminalViewport
            sessions={sessions}
            activeSession={activeSession}
            opaqueBackground={windowMode && !hasWallpaper}
            plainClickMovesCursor={windowMode}
            promptUndoShortcut={windowMode && IS_MAC}
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
