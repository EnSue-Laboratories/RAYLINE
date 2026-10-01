/**
 * PTY terminal sessions (electron/terminal-manager) and the terminal window.
 * The same session API is also served over a local WebSocket to the
 * terminal MCP server / `claudi-terminal` CLI (see `TerminalWsRequest`).
 */

/** Where a newly created session should be shown. */
export type TerminalReveal = boolean | "auto";

/** `terminal-create` argument. */
export interface TerminalCreateOptions {
  name: string;
  /** Shell / program to run; defaults to $SHELL. */
  command?: string;
  /** Defaults to the home directory. */
  cwd?: string;
  /** Default "auto". `false` keeps the session hidden (e.g. shell-mode runs). */
  reveal?: TerminalReveal;
}

/** Error shape shared by the session operations. */
export interface TerminalError {
  error: string;
}

export type TerminalResult<T extends object = Record<never, never>> = ({ ok: true } & T) | TerminalError;

/** `terminal-create` */
export type TerminalCreateResult = TerminalResult<{ name: string }>;
/** `terminal-send` / `terminal-kill` / `terminal-resize` */
export type TerminalOpResult = TerminalResult;
/** `terminal-read` — last N scrollback lines (raw, may contain ANSI). */
export type TerminalReadResult = TerminalResult<{ lines: string[] }>;

export interface TerminalSendRequest {
  name: string;
  /** Supports `\n`, `\r`, `\t`, `\xNN`, `\uNNNN` escapes. */
  text: string;
}

export interface TerminalReadRequest {
  name: string;
  /** Default 50, clamped to 1…5000. */
  lines?: number;
}

export interface TerminalNameRequest {
  name: string;
}

export interface TerminalResizeRequest {
  name: string;
  cols: number;
  rows: number;
}

/** `terminal-list` entry. */
export interface TerminalSessionInfo {
  name: string;
  command: string;
  cwd: string;
  pid: number;
  exitCode: number | null;
}

/** `terminal-metadata` / `terminal-saved-metadata` entry (restore on launch). */
export interface TerminalSessionMetadata {
  name: string;
  cwd: string;
  command: string;
}

/** `terminal-output` (main → renderer, all windows). */
export interface TerminalOutputPayload {
  name: string;
  data: string;
}

export type TerminalSessionsChangeReason = "created" | "exited" | "killed";

/** `terminal-sessions-state` (main → renderer, all windows). */
export interface TerminalSessionsStatePayload {
  reason: TerminalSessionsChangeReason;
  name?: string;
  exitCode?: number | null;
  reveal?: TerminalReveal;
  sessions: TerminalSessionInfo[];
}

/** `terminal-window-state` (main → renderer, all windows). */
export interface TerminalWindowStatePayload {
  open: boolean;
}

/** `terminal-sidebar-reveal-request` (main → main window). */
export interface TerminalSidebarRevealRequest {
  name: string | null;
}

/** `terminal-surface-preference` argument. */
export interface TerminalSurfacePreference {
  sidebarTerminalEnabled?: boolean;
}

/** `terminal-debug-log` payload (only logged when terminal debug is enabled). */
export interface TerminalDebugLogPayload {
  event?: string;
  details?: Record<string, unknown>;
  source?: string;
  page?: string;
}

// ── Local WebSocket protocol (terminal-manager ↔ MCP server / CLI) ──────────

export type TerminalWsAction =
  | "create_session"
  | "send_input"
  | "read_output"
  | "kill_session"
  | "list_sessions"
  | "resize";

export interface TerminalWsRequest {
  id?: string | number;
  action: TerminalWsAction;
  params?: Record<string, unknown>;
}

export interface TerminalWsResponse {
  id?: string | number;
  result?: unknown;
  error?: string;
}

/** Pushed to every WS client. */
export type TerminalWsBroadcast =
  | { type: "output"; name: string; data: string }
  | { type: "session_exited"; name: string; exitCode: number | null };
