/** Main + terminal window preload → `window.api`. */

import { contextBridge, webUtils } from "electron";
import type { PlatformFile, RaylineApi } from "@shared/ipc/renderer-api";
import { invoke, invoker, sender, subscriber, syncSender } from "./preload/ipc";

// Inlined logger: the sandboxed preload cannot require main-process modules.
const VERBOSE_PRELOAD_LOGS = (() => {
  const truthy = /^(1|true|yes|on)$/i;
  const debug = (process.env.RAYLINE_DEBUG ?? "").trim();
  if (truthy.test(process.env.RAYLINE_VERBOSE_LOGS ?? "")) return true;
  if (truthy.test(debug)) return true;
  return debug
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((t) => t === "rayline:*" || t === "rayline:checkpoint-preload" || t === "checkpoint-preload");
})();

const logCheckpoint = (...args: unknown[]): void => {
  if (VERBOSE_PRELOAD_LOGS) console.log("[checkpoint-preload]", ...args);
};

// Main only sends terminal output to windows that listen; announce the first
// listener / last unsubscribe of this window.
const terminalOutputSubscriber = subscriber("terminal-output");
const announceTerminalOutput = sender("terminal-output-subscribe");
let terminalOutputListeners = 0;

const subscribeTerminalOutput: RaylineApi["onTerminalOutput"] = (listener) => {
  const unsubscribe = terminalOutputSubscriber(listener);
  terminalOutputListeners += 1;
  if (terminalOutputListeners === 1) announceTerminalOutput(true);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    unsubscribe();
    terminalOutputListeners -= 1;
    if (terminalOutputListeners === 0) announceTerminalOutput(false);
  };
};

const api = {
  // Agent runs
  agentStart: sender("agent-start"),
  agentCancel: sender("agent-cancel"),
  agentEditAndResend: sender("agent-edit-resend"),
  onAgentStream: subscriber("agent-stream"),
  onAgentDone: subscriber("agent-done"),
  onAgentError: subscriber("agent-error"),
  agentPermissionRespond: sender("agent-permission-respond"),
  onAgentPermissionRequest: subscriber("agent-permission-request"),
  onAgentPermissionCancelled: subscriber("agent-permission-cancelled"),

  // Dialogs, files, images
  pickFolder: invoker("folder-pick"),
  selectWallpaper: invoker("select-wallpaper"),
  deleteWallpaper: invoker("delete-wallpaper"),
  readImage: invoker("read-image"),
  storeMessageImage: invoker("store-message-image"),

  // Sessions & checkpoints
  listSessions: invoker("list-sessions"),
  loadSession: invoker("load-session"),
  loadSessionSearchText: invoker("load-session-search-text"),
  moveSession: invoker("move-session"),
  rewindFiles: invoker("rewind-files"),
  checkpointCreate: (cwdPath) => {
    logCheckpoint("checkpointCreate", { cwdPath });
    return invoke("checkpoint-create", cwdPath);
  },
  checkpointRestore: (cwdPath, ref) => {
    logCheckpoint("checkpointRestore", { cwdPath, ref });
    return invoke("checkpoint-restore", cwdPath, ref);
  },

  // App state (legacy whole-state + v2 split persistence)
  saveState: invoker("save-state"),
  saveStateSync: syncSender("save-state-sync"),
  loadState: invoker("load-state"),
  stateLoad: invoker("state:load"),
  stateLoadConversation: invoker("state:load-conversation"),
  stateSave: invoker("state:save"),
  stateSaveSync: syncSender("state:save-sync"),
  getFilePath(file: PlatformFile): string | null {
    try {
      // A renderer `File` arrives here; PlatformFile is its DOM-free view.
      return webUtils.getPathForFile(file as unknown as File);
    } catch {
      return null;
    }
  },

  // One-shot helpers & system
  quickExplain: invoker("quick-explain"),
  dispatchPlan: invoker("dispatch-plan"),
  getSystemInfo: invoker("system-info"),
  getDraftsPath: invoker("get-drafts-path"),
  pathExists: invoker("path-exists"),
  checkCliInstalled: invoker("check-cli-installed"),
  getModelCatalog: invoker("model-catalog"),
  opencodeStatus: invoker("opencode-status"),
  opencodeSaveConfig: invoker("opencode-save-config"),
  opencodeGetProviderConfig: invoker("opencode-get-provider-config"),
  syncProviderUpstreams: (provider, config) => invoke("sync-provider-upstreams", { provider, config }),
  shellRun: ({ command, cwd }) => invoke("shell-run", { command, cwd }),
  remoteRuntimeCheck: ({ sshCommand }) => invoke("remote-runtime-check", { sshCommand }),

  // Git
  gitBranches: invoker("git-branches"),
  gitCreateBranch: invoker("git-create-branch"),
  gitCheckout: invoker("git-checkout"),
  gitWorktreeList: invoker("git-worktree-list"),
  gitWorktreeAdd: invoker("git-worktree-add"),
  gitDeleteBranch: invoker("git-delete-branch"),
  gitWorktreeRemove: invoker("git-worktree-remove"),
  gitWorktreePromote: invoker("git-worktree-promote"),
  gitStatus: invoker("git-status"),
  gitRemoteSlug: invoker("git-remote-slug"),
  gitFetch: invoker("git-fetch"),
  gitDiff: invoker("git-diff"),
  gitStage: invoker("git-stage"),
  gitUnstage: invoker("git-unstage"),
  gitRevert: invoker("git-revert"),
  gitIgnore: invoker("git-ignore"),
  gitCommit: invoker("git-commit"),
  gitPush: invoker("git-push"),
  gitPull: invoker("git-pull"),
  gitPrStatus: invoker("git-pr-status"),
  gitCreatePr: invoker("git-create-pr"),
  gitMergePr: invoker("git-merge-pr"),
  gitGenCommitMessage: invoker("git-gen-commit-message"),

  // Terminal sessions
  terminalCreate: invoker("terminal-create"),
  terminalSend: ({ name, text }) => invoke("terminal-send", { name, text }),
  terminalRead: ({ name, lines }) => invoke("terminal-read", { name, lines }),
  terminalKill: ({ name }) => invoke("terminal-kill", { name }),
  terminalList: invoker("terminal-list"),
  terminalResize: ({ name, cols, rows }) => invoke("terminal-resize", { name, cols, rows }),
  terminalMetadata: invoker("terminal-metadata"),
  terminalConsumePreferredSession: invoker("terminal-consume-preferred-session"),
  terminalSavedMetadata: invoker("terminal-saved-metadata"),
  terminalDebugLog: sender("terminal-debug-log"),
  onTerminalOutput: subscribeTerminalOutput,
  openTerminalWindow: invoker("open-terminal-window"),
  closeTerminalWindow: invoker("close-terminal-window"),
  isTerminalWindowOpen: invoker("is-terminal-window-open"),
  setTerminalSurfacePreference: invoker("terminal-surface-preference"),
  terminalWindowReady: sender("terminal-window-ready"),
  closeCurrentWindow: invoker("window-close-current"),
  onTerminalWindowState: subscriber("terminal-window-state"),
  onTerminalSidebarRevealRequest: subscriber("terminal-sidebar-reveal-request"),
  onTerminalSessionsState: subscriber("terminal-sessions-state"),

  // File operations
  openPath: invoker("open-path"),
  selectFiles: invoker("select-files"),

  // GitHub (subset available in the main window)
  ghGetIssue: invoker("gh-get-issue"),
  ghListIssues: invoker("gh-list-issues"),
  ghGetRepoName: invoker("gh-get-repo-name"),

  // Project Manager
  openProjectManager: sender("open-project-manager"),
  cloneRepo: ({ url, parentDir }) => invoke("project-clone", { url, parentDir }),

  // Window appearance & clipboard
  setWindowOpacity: invoker("set-window-opacity"),
  setWindowBackgroundColor: invoker("set-window-background-color"),
  windowMinimize: invoker("window-minimize"),
  windowToggleMaximize: invoker("window-toggle-maximize"),
  windowClose: invoker("window-close"),
  writeClipboardImage: invoker("clipboard-write-image"),
  writeClipboardText: invoker("clipboard-write-text"),
  readClipboardText: invoker("clipboard-read-text"),

  // Auto-updater
  getAppVersion: invoker("get-app-version"),
  getAppBuild: invoker("get-app-build"),
  checkForUpdates: invoker("updater-check"),
  downloadUpdate: invoker("updater-download"),
  installUpdate: invoker("updater-install"),
  onUpdaterStatus: subscriber("updater-status"),

  // Multica
  multicaSendCode: invoker("multica-send-code"),
  multicaVerifyCode: invoker("multica-verify-code"),
  multicaListWorkspaces: invoker("multica-list-workspaces"),
  multicaListAgents: invoker("multica-list-agents"),
  multicaEnsureSession: invoker("multica-ensure-session"),
  multicaSendMessage: invoker("multica-send-message"),
  multicaListMessages: invoker("multica-list-messages"),
  multicaSubscribe: invoker("multica-subscribe"),
} satisfies RaylineApi;

contextBridge.exposeInMainWorld("api", api);
