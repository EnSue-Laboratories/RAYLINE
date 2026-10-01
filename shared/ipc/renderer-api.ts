/**
 * Shapes of the objects the preloads expose via `contextBridge`:
 *  - `RaylineApi` — electron/preload → `window.api` (main + terminal windows)
 *  - `GithubApi`  — electron/preload-pm → `window.ghApi` (Project Manager)
 *
 * Method names match the preloads exactly. Pass-through methods are typed via
 * the contract helpers so they stay in sync with `InvokeChannels`; wrappers
 * whose JS signature differs from the channel args spell it out.
 *
 * The `Window` augmentation lives in src/types/window.d.ts (renderer-only) so
 * the electron project never sees DOM types.
 */

import type {
  EventSubscriber,
  Invoker,
  InvokeResult,
  Sender,
  SyncArgs,
  SyncResult,
} from "./contract";
import type { CloneRepoRequest } from "../git/types";
import type { ProviderUpstreamConfig, RemoteRuntimeCheckInput, UpstreamProviderId } from "../providers/types";
import type { ShellRunRequest } from "../system/types";
import type {
  TerminalNameRequest,
  TerminalReadRequest,
  TerminalResizeRequest,
  TerminalSendRequest,
} from "../terminal/types";

/**
 * Minimal structural view of a DOM `File` (shared/ cannot reference DOM
 * types). A real `File` is assignable.
 */
export interface PlatformFile {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

/** `window.api` */
export interface RaylineApi {
  // Agent runs
  agentStart: Sender<"agent-start">;
  agentCancel: Sender<"agent-cancel">;
  agentEditAndResend: Sender<"agent-edit-resend">;
  onAgentStream: EventSubscriber<"agent-stream">;
  onAgentDone: EventSubscriber<"agent-done">;
  onAgentError: EventSubscriber<"agent-error">;
  agentPermissionRespond: Sender<"agent-permission-respond">;
  onAgentPermissionRequest: EventSubscriber<"agent-permission-request">;
  onAgentPermissionCancelled: EventSubscriber<"agent-permission-cancelled">;

  // Dialogs, files, images
  pickFolder: Invoker<"folder-pick">;
  selectWallpaper: Invoker<"select-wallpaper">;
  deleteWallpaper: Invoker<"delete-wallpaper">;
  readImage: Invoker<"read-image">;
  storeMessageImage: Invoker<"store-message-image">;

  // Sessions & checkpoints
  listSessions: Invoker<"list-sessions">;
  loadSession: Invoker<"load-session">;
  loadSessionSearchText: Invoker<"load-session-search-text">;
  moveSession: Invoker<"move-session">;
  rewindFiles: Invoker<"rewind-files">;
  checkpointCreate: Invoker<"checkpoint-create">;
  checkpointRestore: Invoker<"checkpoint-restore">;

  // App state
  saveState: Invoker<"save-state">;
  saveStateSync: (...args: SyncArgs<"save-state-sync">) => SyncResult<"save-state-sync">;
  loadState: Invoker<"load-state">;
  stateLoad: Invoker<"state:load">;
  stateLoadConversation: Invoker<"state:load-conversation">;
  stateSave: Invoker<"state:save">;
  stateSaveSync: (...args: SyncArgs<"state:save-sync">) => SyncResult<"state:save-sync">;
  /**
   * `webUtils.getPathForFile`; null when the file has no backing path
   * (e.g. pasted from the clipboard). Method syntax on purpose so the preload
   * can implement it with a DOM `File` parameter.
   */
  getFilePath(file: PlatformFile): string | null;

  // One-shot helpers & system
  quickExplain: Invoker<"quick-explain">;
  dispatchPlan: Invoker<"dispatch-plan">;
  getSystemInfo: Invoker<"system-info">;
  getDraftsPath: Invoker<"get-drafts-path">;
  pathExists: Invoker<"path-exists">;
  checkCliInstalled: Invoker<"check-cli-installed">;
  getModelCatalog: Invoker<"model-catalog">;
  opencodeStatus: Invoker<"opencode-status">;
  opencodeSaveConfig: Invoker<"opencode-save-config">;
  opencodeGetProviderConfig: Invoker<"opencode-get-provider-config">;
  /** Wraps `sync-provider-upstreams` as `{ provider, config }`. */
  syncProviderUpstreams: (
    provider: UpstreamProviderId,
    config: ProviderUpstreamConfig | null,
  ) => Promise<InvokeResult<"sync-provider-upstreams">>;
  shellRun: (request: ShellRunRequest) => Promise<InvokeResult<"shell-run">>;
  remoteRuntimeCheck: (input: RemoteRuntimeCheckInput) => Promise<InvokeResult<"remote-runtime-check">>;

  // Git
  gitBranches: Invoker<"git-branches">;
  gitCreateBranch: Invoker<"git-create-branch">;
  gitCheckout: Invoker<"git-checkout">;
  gitWorktreeList: Invoker<"git-worktree-list">;
  gitWorktreeAdd: Invoker<"git-worktree-add">;
  gitDeleteBranch: Invoker<"git-delete-branch">;
  gitWorktreeRemove: Invoker<"git-worktree-remove">;
  gitWorktreePromote: Invoker<"git-worktree-promote">;
  gitStatus: Invoker<"git-status">;
  gitRemoteSlug: Invoker<"git-remote-slug">;
  gitFetch: Invoker<"git-fetch">;
  gitDiff: Invoker<"git-diff">;
  gitStage: Invoker<"git-stage">;
  gitUnstage: Invoker<"git-unstage">;
  gitRevert: Invoker<"git-revert">;
  gitIgnore: Invoker<"git-ignore">;
  gitCommit: Invoker<"git-commit">;
  gitPush: Invoker<"git-push">;
  gitPull: Invoker<"git-pull">;
  gitPrStatus: Invoker<"git-pr-status">;
  gitCreatePr: Invoker<"git-create-pr">;
  gitMergePr: Invoker<"git-merge-pr">;
  gitGenCommitMessage: Invoker<"git-gen-commit-message">;

  // Terminal sessions
  terminalCreate: Invoker<"terminal-create">;
  terminalSend: (request: TerminalSendRequest) => Promise<InvokeResult<"terminal-send">>;
  terminalRead: (request: TerminalReadRequest) => Promise<InvokeResult<"terminal-read">>;
  terminalKill: (request: TerminalNameRequest) => Promise<InvokeResult<"terminal-kill">>;
  terminalList: Invoker<"terminal-list">;
  terminalResize: (request: TerminalResizeRequest) => Promise<InvokeResult<"terminal-resize">>;
  terminalMetadata: Invoker<"terminal-metadata">;
  terminalConsumePreferredSession: Invoker<"terminal-consume-preferred-session">;
  terminalSavedMetadata: Invoker<"terminal-saved-metadata">;
  terminalDebugLog: Sender<"terminal-debug-log">;
  onTerminalOutput: EventSubscriber<"terminal-output">;
  openTerminalWindow: Invoker<"open-terminal-window">;
  closeTerminalWindow: Invoker<"close-terminal-window">;
  isTerminalWindowOpen: Invoker<"is-terminal-window-open">;
  setTerminalSurfacePreference: Invoker<"terminal-surface-preference">;
  terminalWindowReady: Sender<"terminal-window-ready">;
  closeCurrentWindow: Invoker<"window-close-current">;
  onTerminalWindowState: EventSubscriber<"terminal-window-state">;
  onTerminalSidebarRevealRequest: EventSubscriber<"terminal-sidebar-reveal-request">;
  onTerminalSessionsState: EventSubscriber<"terminal-sessions-state">;

  // File operations
  openPath: Invoker<"open-path">;
  selectFiles: Invoker<"select-files">;

  // GitHub (subset available in the main window)
  ghGetIssue: Invoker<"gh-get-issue">;
  ghListIssues: Invoker<"gh-list-issues">;
  ghGetRepoName: Invoker<"gh-get-repo-name">;

  // Project Manager
  openProjectManager: Sender<"open-project-manager">;
  /** Wraps `project-clone`. */
  cloneRepo: (request: CloneRepoRequest) => Promise<InvokeResult<"project-clone">>;

  // Window appearance & clipboard
  setWindowOpacity: Invoker<"set-window-opacity">;
  setWindowBackgroundColor: Invoker<"set-window-background-color">;
  windowMinimize: Invoker<"window-minimize">;
  windowToggleMaximize: Invoker<"window-toggle-maximize">;
  windowClose: Invoker<"window-close">;
  writeClipboardImage: Invoker<"clipboard-write-image">;
  writeClipboardText: Invoker<"clipboard-write-text">;
  readClipboardText: Invoker<"clipboard-read-text">;

  // Auto-updater
  getAppVersion: Invoker<"get-app-version">;
  getAppBuild: Invoker<"get-app-build">;
  checkForUpdates: Invoker<"updater-check">;
  downloadUpdate: Invoker<"updater-download">;
  installUpdate: Invoker<"updater-install">;
  onUpdaterStatus: EventSubscriber<"updater-status">;

  // Multica
  multicaSendCode: Invoker<"multica-send-code">;
  multicaVerifyCode: Invoker<"multica-verify-code">;
  multicaListWorkspaces: Invoker<"multica-list-workspaces">;
  multicaListAgents: Invoker<"multica-list-agents">;
  multicaEnsureSession: Invoker<"multica-ensure-session">;
  multicaSendMessage: Invoker<"multica-send-message">;
  multicaListMessages: Invoker<"multica-list-messages">;
  multicaSubscribe: Invoker<"multica-subscribe">;
}

/** `window.ghApi` (Project Manager window). */
export interface GithubApi {
  checkAuth: Invoker<"gh-check-auth">;
  listAuthAccounts: Invoker<"gh-list-auth-accounts">;
  switchAccount: Invoker<"gh-switch-account">;
  listUserRepos: Invoker<"gh-list-user-repos">;
  listIssues: Invoker<"gh-list-issues">;
  listPRs: Invoker<"gh-list-prs">;
  getIssue: Invoker<"gh-get-issue">;
  getPR: Invoker<"gh-get-pr">;
  listComments: Invoker<"gh-list-comments">;
  addComment: Invoker<"gh-add-comment">;
  listCollaborators: Invoker<"gh-list-collaborators">;
  assignIssue: Invoker<"gh-assign-issue">;
  unassignIssue: Invoker<"gh-unassign-issue">;
  checkoutPR: Invoker<"gh-checkout-pr">;
  closeIssue: Invoker<"gh-close-issue">;
  mergePR: Invoker<"gh-merge-pr">;
  reopenIssue: Invoker<"gh-reopen-issue">;
  createIssue: Invoker<"gh-create-issue">;
  createPR: Invoker<"gh-create-pr">;
  listBranches: Invoker<"gh-list-branches">;
  getLinkedPRs: Invoker<"gh-linked-prs">;
  getCurrentBranch: Invoker<"gh-current-branch">;
  getRepoDefaultBranch: Invoker<"gh-repo-default-branch">;
  uploadImage: Invoker<"gh-upload-image">;
  loadPmState: Invoker<"gh-load-pm-state">;
  savePmState: Invoker<"gh-save-pm-state">;
  /** Reads the main window's persisted state (`load-state`). */
  loadAppState: Invoker<"load-state">;
  readImage: Invoker<"read-image">;
  getSystemInfo: Invoker<"system-info">;
  setWindowBackgroundColor: Invoker<"set-window-background-color">;
  windowMinimize: Invoker<"window-minimize">;
  windowToggleMaximize: Invoker<"window-toggle-maximize">;
  windowClose: Invoker<"window-close">;
  authStart: Invoker<"gh-auth-start">;
  authCancel: Invoker<"gh-auth-cancel">;
  authLogout: Invoker<"gh-auth-logout">;
  onAuthEvent: EventSubscriber<"gh-auth-event">;
}
