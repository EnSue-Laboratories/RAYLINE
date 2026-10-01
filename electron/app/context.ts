/**
 * AppContext: the main process's shared state, created once in main.ts and
 * passed explicitly to window, lifecycle and IPC modules (replaces the old
 * module-level globals of main.cjs).
 */

import path from "node:path";
import { app, type BrowserWindow } from "electron";
import type { PersistedAppIndex, PersistedAppState } from "@shared/state/types";
import { StateStore } from "../services/state-store";

export interface AppEnv {
  readonly isDev: boolean;
  readonly isMac: boolean;
  readonly isWindows: boolean;
  /** Vite dev-server port (dev only). */
  readonly devServerPort: string;
}

export interface AppPaths {
  readonly userData: string;
  readonly draftsDir: string;
  readonly wallpapersDir: string;
  readonly messageImagesDir: string;
  /** Terminal sessions saved at quit, restored on next launch. */
  readonly terminalMetaFile: string;
  readonly mcpConfigFile: string;
  readonly preloadMain: string;
  readonly preloadProjectManager: string;
  readonly mcpTerminalServerScript: string;
}

export interface AppWindows {
  main: BrowserWindow | null;
  pm: BrowserWindow | null;
  terminal: BrowserWindow | null;
}

export interface TerminalUiState {
  revealTimer: NodeJS.Timeout | null;
  /** Last auto-created session not yet claimed by a window. */
  pendingPreferredSessionName: string | null;
  /** Main window's "sidebar terminal" setting (from persisted state). */
  sidebarEnabledPreference: boolean;
  /** webContents ids listening to `terminal-output` (`terminal-output-subscribe`). */
  readonly outputSubscribers: Set<number>;
}

/** Terminal WebSocket server + MCP config, available once the server started. */
export interface TerminalRuntimeInfo {
  wsPort: number;
  mcpConfigPath: string;
}

export interface AppContext {
  readonly env: AppEnv;
  readonly paths: AppPaths;
  readonly windows: AppWindows;
  readonly terminalUi: TerminalUiState;
  terminalRuntime: TerminalRuntimeInfo | null;
  readonly stateStore: StateStore;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Remembers the sidebar-terminal preference carried by persisted state / the renderer. */
export function rememberTerminalSurfacePreference(ctx: AppContext, state: unknown): void {
  if (isRecord(state) && typeof state.sidebarTerminalEnabled === "boolean") {
    ctx.terminalUi.sidebarEnabledPreference = state.sidebarTerminalEnabled;
  }
}

/** Call after `app.setName` / any userData override, before `app.whenReady`. */
export function createAppContext(): AppContext {
  const userData = app.getPath("userData");
  const home = app.getPath("home");
  const env: AppEnv = {
    isDev: !app.isPackaged,
    isMac: process.platform === "darwin",
    isWindows: process.platform === "win32",
    devServerPort: process.env.VITE_PORT || "5173",
  };
  const paths: AppPaths = {
    userData,
    draftsDir: path.join(userData, "drafts"),
    wallpapersDir: path.join(userData, "wallpapers"),
    messageImagesDir: path.join(userData, "message-images"),
    terminalMetaFile: path.join(userData, "terminal-sessions.json"),
    mcpConfigFile: path.join(userData, "mcp-terminal.json"),
    preloadMain: path.join(__dirname, "preload.cjs"),
    preloadProjectManager: path.join(__dirname, "preload-pm.cjs"),
    mcpTerminalServerScript: path.join(__dirname, "mcp-terminal-server.cjs"),
  };

  const ctx: AppContext = {
    env,
    paths,
    windows: { main: null, pm: null, terminal: null },
    terminalUi: {
      revealTimer: null,
      pendingPreferredSessionName: null,
      sidebarEnabledPreference: false,
      outputSubscribers: new Set<number>(),
    },
    terminalRuntime: null,
    stateStore: new StateStore({
      userDataDir: userData,
      legacyFallbackFiles: [
        path.join(home, "Library/Application Support/scaffold-tmp/claudi-state.json"),
        path.join(home, "Library/Application Support/Ensue/claudi-state.json"),
      ],
      onSettings: (settings: PersistedAppState | PersistedAppIndex) => rememberTerminalSurfacePreference(ctx, settings),
    }),
  };
  return ctx;
}
