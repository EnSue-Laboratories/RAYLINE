/**
 * IPC contract — single source of truth for every channel between the
 * renderer windows and the main process.
 *
 *  - `InvokeChannels`: `ipcRenderer.invoke` ↔ `ipcMain.handle`
 *  - `SendChannels`:   `ipcRenderer.send`   → `ipcMain.on` (fire-and-forget)
 *  - `SyncChannels`:   `ipcRenderer.sendSync` → `ipcMain.on` + `event.returnValue`
 *  - `EventChannels`:  `webContents.send`   → `ipcRenderer.on`
 *
 * `args` are named tuples in the exact order the preload passes them;
 * `result` is what the main handler resolves to (handlers documented as
 * "rejects" can also reject — the renderer sees an Error whose message is
 * prefixed with "Error invoking remote method '<channel>': ").
 *
 * Adding a channel: declare it here → expose it in electron/preload (and the
 * matching interface in ./renderer-api) → implement the handler in
 * electron/main. See shared/README.md.
 */

import type {
  AgentDonePayload,
  AgentErrorPayload,
  AgentStreamPayload,
} from "../agent/events";
import type {
  AgentCancelRequest,
  AgentEditResendRequest,
  AgentPermissionCancelled,
  AgentPermissionRequest,
  AgentPermissionResponse,
  Conversation,
  AgentStartRequest,
  DispatchPlan,
  DispatchPlanRequest,
  LoadedSession,
  QuickExplainRequest,
  RewindFilesRequest,
  SessionSearchText,
  SessionSummary,
  StoredMessageImage,
  StoreMessageImageInput,
} from "../chat/types";
import type {
  CloneRepoRequest,
  CloneRepoResult,
  GitBranchList,
  GitCommitMessageOk,
  GitCreatePrOk,
  GitDiff,
  GitIgnoreOk,
  GitMergePrOk,
  GitOpResult,
  GitPrStatus,
  GitStatus,
  GitStdout,
  GitSuccess,
  GitWorktree,
  GitWorktreeAddOptions,
  GitWorktreeAddResult,
  GitWorktreePromoteResult,
} from "../git/types";
import type {
  GhAuthEvent,
  GhAuthStartResult,
  GhBranch,
  GhCheckAuthResult,
  GhComment,
  GhCreatePrResult,
  GhIssue,
  GhLinkedPr,
  GhListAuthAccountsResult,
  GhLogoutResult,
  GhMergeResult,
  GhPullRequest,
  GhRepoSummary,
  GhStateFilter,
  GhSwitchAccountResult,
  GhUser,
  PmState,
  PmStateInput,
} from "../github/types";
import type {
  CheckCliInstalledOptions,
  CliInstalledSnapshot,
  MulticaAgent,
  MulticaAuthedArgs,
  MulticaChatSession,
  MulticaEnsureSessionArgs,
  MulticaListMessagesResult,
  MulticaListWorkspacesResult,
  MulticaSendCodeArgs,
  MulticaSendMessageArgs,
  MulticaSendMessageResult,
  MulticaSessionArgs,
  MulticaSubscribeArgs,
  MulticaVerifyCodeArgs,
  MulticaVerifyCodeResult,
  MulticaWorkspaceArgs,
  OpenCodeProviderConfig,
  OpenCodeSaveConfigInput,
  OpenCodeStatus,
  OpenCodeStatusSnapshot,
  ProviderUpstreamConfig,
  RemoteRuntimeCheckInput,
  RemoteRuntimeCheckResult,
  UpstreamProviderId,
} from "../providers/types";
import type { PersistedAppIndex, PersistedAppState, StateSaveRequest } from "../state/types";
import type { ShellRunRequest, ShellRunResult, SystemInfo } from "../system/types";
import type {
  TerminalCreateOptions,
  TerminalCreateResult,
  TerminalDebugLogPayload,
  TerminalNameRequest,
  TerminalOpResult,
  TerminalOutputPayload,
  TerminalReadRequest,
  TerminalReadResult,
  TerminalResizeRequest,
  TerminalSendRequest,
  TerminalSessionInfo,
  TerminalSessionMetadata,
  TerminalSessionsStatePayload,
  TerminalSidebarRevealRequest,
  TerminalSurfacePreference,
  TerminalWindowStatePayload,
} from "../terminal/types";
import type { UpdaterStatus } from "../updater/types";

/** `sync-provider-upstreams` argument (`config: null` clears). */
export interface SyncProviderUpstreamsRequest {
  provider: UpstreamProviderId;
  config: ProviderUpstreamConfig | null;
}

// ── invoke / handle ─────────────────────────────────────────────────────────

export interface InvokeChannels {
  // Dialogs & files
  /** Directory picker; null when cancelled. */
  "folder-pick": { args: []; result: string | null };
  /** Copies the chosen image into userData/wallpapers; removes the previous managed copy. */
  "select-wallpaper": { args: [previousPath?: string | null]; result: string | null };
  "delete-wallpaper": { args: [filePath: string]; result: boolean };
  /** Reads an image file (supports `~/`) as a data URL; null on failure. */
  "read-image": { args: [filePath: string]; result: string | null };
  /** Persists a data-URL image under userData/message-images (content-addressed). */
  "store-message-image": { args: [input: StoreMessageImageInput]; result: StoredMessageImage | null };
  /** `shell.openPath`: "" on success, else an error message. */
  "open-path": { args: [dirPath: string]; result: string };
  /** Multi-file picker; [] when cancelled. */
  "select-files": { args: []; result: string[] };
  "path-exists": { args: [path: string]; result: boolean };
  "get-drafts-path": { args: []; result: string };

  // Sessions & checkpoints
  "list-sessions": { args: [cwd: string]; result: SessionSummary[] };
  "load-session": { args: [sessionId: string]; result: LoadedSession };
  "load-session-search-text": { args: [sessionId: string]; result: SessionSearchText };
  /** Copies a Claude session file into the new cwd's project dir; false if not found. */
  "move-session": { args: [sessionId: string, newCwd: string]; result: boolean };
  /** Rejects on failure. */
  "rewind-files": { args: [request: RewindFilesRequest]; result: { success: true } };
  /** Snapshot worktree into refs/claudi-checkpoints/<ref>. Rejects on failure. */
  "checkpoint-create": { args: [cwdPath: string]; result: { ref: string } };
  /** Rejects on failure. */
  "checkpoint-restore": { args: [cwdPath: string, ref: string]; result: { success: true } };

  // App state
  "save-state": { args: [state: PersistedAppState]; result: boolean };
  /** Raw JSON from disk (may be from an older version) or null. Validate with `isPersistedAppState`. */
  "load-state": { args: []; result: PersistedAppState | null };

  // v2 split persistence (see shared/state/types.ts). Replaces save-state /
  // load-state for the main window; the legacy channels stay for the Project
  // Manager window until it migrates.
  /** Index only (no transcripts); migrates the legacy file on first call. null = fresh install. */
  "state:load": { args: []; result: PersistedAppIndex | null };
  /** Lazy transcript load when a conversation is opened. [] if none on disk. */
  "state:load-conversation": { args: [conversationId: string]; result: Conversation["archivedMessages"] };
  /** Async atomic write of the index and/or changed transcripts. */
  "state:save": { args: [request: StateSaveRequest]; result: boolean };

  // One-shot agent helpers
  /** Resolves to markdown, "Error: …", or "Timed out". Never rejects. */
  "quick-explain": { args: [request: QuickExplainRequest]; result: string };
  /** Rejects when the brief is empty or the planner output has no rows. */
  "dispatch-plan": { args: [request: DispatchPlanRequest]; result: DispatchPlan };

  // System / providers
  "system-info": { args: []; result: SystemInfo };
  "check-cli-installed": { args: [options?: CheckCliInstalledOptions]; result: CliInstalledSnapshot };
  "opencode-status": { args: []; result: OpenCodeStatus };
  /** Rejects on invalid provider/model id. */
  "opencode-save-config": { args: [input: OpenCodeSaveConfigInput]; result: OpenCodeStatusSnapshot };
  "opencode-get-provider-config": { args: [providerId: string]; result: OpenCodeProviderConfig };
  /** Windows only: patches ~/.claude settings for a Claude upstream. Always true. */
  "sync-provider-upstreams": { args: [request: SyncProviderUpstreamsRequest]; result: true };
  "shell-run": { args: [request: ShellRunRequest]; result: ShellRunResult };
  "remote-runtime-check": { args: [input: RemoteRuntimeCheckInput]; result: RemoteRuntimeCheckResult };

  // Git (see shared/git/types for which handlers reject)
  "git-branches": { args: [cwd: string]; result: GitBranchList };
  /** Rejects on failure. */
  "git-create-branch": { args: [cwd: string, name: string]; result: GitSuccess };
  /** Rejects on failure. */
  "git-checkout": { args: [cwd: string, name: string]; result: GitSuccess };
  "git-worktree-list": { args: [cwd: string]; result: GitWorktree[] };
  /** Rejects on failure (after automatic repair attempts). */
  "git-worktree-add": {
    args: [cwd: string, path: string, branch: string, options?: GitWorktreeAddOptions];
    result: GitWorktreeAddResult;
  };
  /** Rejects on failure. */
  "git-delete-branch": { args: [cwd: string, name: string]; result: GitSuccess };
  /** Rejects on failure. */
  "git-worktree-remove": { args: [cwd: string, path: string]; result: GitSuccess };
  "git-worktree-promote": {
    args: [mainRepoPath: string, worktreePath: string, branchName?: string | null];
    result: GitWorktreePromoteResult;
  };
  "git-status": { args: [cwd: string]; result: GitStatus | null };
  /** `owner/repo` of the GitHub `origin` remote, or null. */
  "git-remote-slug": { args: [cwd: string]; result: string | null };
  "git-fetch": { args: [cwd: string]; result: GitOpResult };
  "git-diff": { args: [cwd: string]; result: GitDiff };
  /** No/empty paths = `git add -A`. */
  "git-stage": { args: [cwd: string, paths?: string[]]; result: GitOpResult };
  /** No/empty paths = `git reset HEAD`. */
  "git-unstage": { args: [cwd: string, paths?: string[]]; result: GitOpResult };
  "git-revert": { args: [cwd: string, path: string, untracked?: boolean]; result: GitOpResult };
  "git-ignore": { args: [cwd: string, path: string]; result: GitOpResult<GitIgnoreOk> };
  /** Stages everything if nothing is staged; appends `coauthor` trailer. */
  "git-commit": { args: [cwd: string, message: string, coauthor?: string]; result: GitOpResult<GitStdout> };
  "git-push": { args: [cwd: string]; result: GitOpResult<GitStdout> };
  "git-pull": { args: [cwd: string]; result: GitOpResult<GitStdout> };
  "git-pr-status": { args: [cwd: string]; result: GitOpResult<GitPrStatus> };
  "git-create-pr": { args: [cwd: string, base?: string]; result: GitOpResult<GitCreatePrOk> };
  "git-merge-pr": { args: [cwd: string]; result: GitOpResult<GitMergePrOk> };
  "git-gen-commit-message": { args: [cwd: string]; result: GitOpResult<GitCommitMessageOk> };
  /** Prefers `gh repo clone`, falls back to `git clone`. Never rejects. */
  "project-clone": { args: [request: CloneRepoRequest]; result: CloneRepoResult };

  // Terminal
  "terminal-create": { args: [options: TerminalCreateOptions]; result: TerminalCreateResult };
  "terminal-send": { args: [request: TerminalSendRequest]; result: TerminalOpResult };
  "terminal-read": { args: [request: TerminalReadRequest]; result: TerminalReadResult };
  "terminal-kill": { args: [request: TerminalNameRequest]; result: TerminalOpResult };
  "terminal-list": { args: []; result: TerminalSessionInfo[] };
  "terminal-resize": { args: [request: TerminalResizeRequest]; result: TerminalOpResult };
  "terminal-metadata": { args: []; result: TerminalSessionMetadata[] };
  /** Name of the last auto-created session not yet claimed by a window (cleared on read). */
  "terminal-consume-preferred-session": { args: []; result: string | null };
  /** Metadata saved at last quit (file is deleted after reading). */
  "terminal-saved-metadata": { args: []; result: TerminalSessionMetadata[] };
  "open-terminal-window": { args: []; result: true };
  "close-terminal-window": { args: []; result: true };
  "is-terminal-window-open": { args: []; result: boolean };
  "terminal-surface-preference": { args: [state: TerminalSurfacePreference]; result: true };

  // Windows & clipboard (act on the sender's window)
  /** Closes the sender's window. */
  "window-close-current": { args: []; result: boolean };
  /** Clamped to 0.2–1. */
  "set-window-opacity": { args: [opacity: number]; result: boolean };
  /** `#RRGGBB` only. */
  "set-window-background-color": { args: [color: string]; result: boolean };
  "window-minimize": { args: []; result: boolean };
  /** true = now maximized, false = restored (or no window). */
  "window-toggle-maximize": { args: []; result: boolean };
  "window-close": { args: []; result: boolean };
  /** `data:image/...` URLs only. */
  "clipboard-write-image": { args: [dataUrl: string]; result: boolean };
  "clipboard-write-text": { args: [text: string]; result: true };
  "clipboard-read-text": { args: []; result: string };

  // Auto-updater (progress on `updater-status`)
  "get-app-version": { args: []; result: string };
  "updater-check": { args: []; result: void };
  "updater-download": { args: []; result: void };
  "updater-install": { args: []; result: void };

  // Multica (REST passthrough; rejects with "multica <METHOD> <path> <status>: …")
  "multica-send-code": { args: [args: MulticaSendCodeArgs]; result: unknown };
  "multica-verify-code": { args: [args: MulticaVerifyCodeArgs]; result: MulticaVerifyCodeResult };
  "multica-list-workspaces": { args: [args: MulticaAuthedArgs]; result: MulticaListWorkspacesResult };
  "multica-list-agents": { args: [args: MulticaWorkspaceArgs]; result: MulticaAgent[] };
  "multica-ensure-session": { args: [args: MulticaEnsureSessionArgs]; result: MulticaChatSession };
  "multica-send-message": { args: [args: MulticaSendMessageArgs]; result: MulticaSendMessageResult };
  "multica-list-messages": { args: [args: MulticaSessionArgs]; result: MulticaListMessagesResult };
  /** Re-attach the sender to a conversation's Multica WS stream. */
  "multica-subscribe": { args: [args: MulticaSubscribeArgs]; result: void };

  // GitHub (gh CLI). Unless noted these reject with gh's stderr on failure.
  /** `gh repo view` for cwd; null on failure. */
  "gh-get-repo-name": { args: [cwd: string]; result: string | null };
  "gh-check-auth": { args: []; result: GhCheckAuthResult };
  "gh-list-auth-accounts": { args: []; result: GhListAuthAccountsResult };
  "gh-switch-account": { args: [user: string]; result: GhSwitchAccountResult };
  /** Personal + org repos, deduped. Default limit 100. */
  "gh-list-user-repos": { args: [limit?: number]; result: GhRepoSummary[] };
  /** Pull requests filtered out. */
  "gh-list-issues": { args: [repo: string, state?: GhStateFilter]; result: GhIssue[] };
  "gh-list-prs": { args: [repo: string, state?: GhStateFilter]; result: GhPullRequest[] };
  "gh-get-issue": { args: [repo: string, number: number]; result: GhIssue };
  "gh-get-pr": { args: [repo: string, number: number]; result: GhPullRequest };
  "gh-list-comments": { args: [repo: string, number: number]; result: GhComment[] };
  "gh-add-comment": { args: [repo: string, number: number, body: string]; result: GhComment };
  "gh-list-collaborators": { args: [repo: string]; result: GhUser[] };
  "gh-assign-issue": { args: [repo: string, number: number, assignees: string[]]; result: GhIssue };
  "gh-unassign-issue": { args: [repo: string, number: number, assignees: string[]]; result: GhIssue };
  "gh-checkout-pr": { args: [repo: string, prNumber: number]; result: GitSuccess };
  "gh-close-issue": { args: [repo: string, number: number]; result: GhIssue };
  "gh-merge-pr": { args: [repo: string, number: number]; result: GhMergeResult };
  "gh-reopen-issue": { args: [repo: string, number: number]; result: GhIssue };
  "gh-create-issue": { args: [repo: string, title: string, body?: string]; result: GhIssue };
  /** `base` defaults to "main". */
  "gh-create-pr": {
    args: [repo: string, title: string, body: string, head: string, base?: string];
    result: GhCreatePrResult;
  };
  "gh-list-branches": { args: [repo: string]; result: GhBranch[] };
  "gh-linked-prs": { args: [repo: string, number: number]; result: GhLinkedPr[] };
  /** Branch of the *main process* cwd (not a repo argument); null on failure. */
  "gh-current-branch": { args: []; result: string | null };
  /** Falls back to "main". */
  "gh-repo-default-branch": { args: [repo: string]; result: string };
  /** Not implemented: always rejects. */
  "gh-upload-image": { args: [repo: string, base64Data: string, filename: string]; result: never };
  "gh-load-pm-state": { args: []; result: PmState };
  "gh-save-pm-state": { args: [state: PmStateInput]; result: boolean };
  /** Starts `gh auth login --web`; progress on `gh-auth-event` to the sender. */
  "gh-auth-start": { args: []; result: GhAuthStartResult };
  "gh-auth-cancel": { args: []; result: true };
  "gh-auth-logout": { args: []; result: GhLogoutResult };
}

// ── send / on (fire-and-forget) ─────────────────────────────────────────────

export interface SendChannels {
  /** Starts a run; results arrive on agent-stream / agent-done / agent-error. */
  "agent-start": { args: [request: AgentStartRequest] };
  /** Cancels any provider's run for the conversation. */
  "agent-cancel": { args: [request: AgentCancelRequest] };
  /** Resume + fork the native session with an edited prompt. */
  "agent-edit-resend": { args: [request: AgentEditResendRequest] };
  "agent-permission-respond": { args: [response: AgentPermissionResponse] };
  "terminal-debug-log": { args: [payload: TerminalDebugLogPayload] };
  "open-project-manager": { args: [] };
  /** Terminal window renderer finished mounting. */
  "terminal-window-ready": { args: [] };
}

// ── sendSync ────────────────────────────────────────────────────────────────

export interface SyncChannels {
  /** Used from `beforeunload`; returns whether the write succeeded. */
  "save-state-sync": { args: [state: PersistedAppState]; result: boolean };
  /** beforeunload: flush only pending (dirty) data synchronously. Keep payloads small. */
  "state:save-sync": { args: [request: StateSaveRequest]; result: boolean };
}

// ── main → renderer events ──────────────────────────────────────────────────

export interface EventChannels {
  "agent-stream": AgentStreamPayload;
  "agent-done": AgentDonePayload;
  "agent-error": AgentErrorPayload;
  "agent-permission-request": AgentPermissionRequest;
  "agent-permission-cancelled": AgentPermissionCancelled;
  /** Broadcast to all windows. */
  "terminal-output": TerminalOutputPayload;
  /** Broadcast to all windows. */
  "terminal-window-state": TerminalWindowStatePayload;
  /** Main window only. */
  "terminal-sidebar-reveal-request": TerminalSidebarRevealRequest;
  /** Broadcast to all windows. */
  "terminal-sessions-state": TerminalSessionsStatePayload;
  /** Main window only. */
  "updater-status": UpdaterStatus;
  /** Sent to the window that called `gh-auth-start`. */
  "gh-auth-event": GhAuthEvent;
}

// ── Helper types ────────────────────────────────────────────────────────────

export type InvokeChannel = keyof InvokeChannels;
export type InvokeArgs<K extends InvokeChannel> = InvokeChannels[K]["args"];
export type InvokeResult<K extends InvokeChannel> = InvokeChannels[K]["result"];

export type SendChannel = keyof SendChannels;
export type SendArgs<K extends SendChannel> = SendChannels[K]["args"];

export type SyncChannel = keyof SyncChannels;
export type SyncArgs<K extends SyncChannel> = SyncChannels[K]["args"];
export type SyncResult<K extends SyncChannel> = SyncChannels[K]["result"];

export type EventChannel = keyof EventChannels;
export type EventPayload<K extends EventChannel> = EventChannels[K];

/** Returned by every `on*` subscription; removes the listener. */
export type Unsubscribe = () => void;

/** Renderer-side invoke signature for a channel. */
export type Invoker<K extends InvokeChannel> = (...args: InvokeArgs<K>) => Promise<InvokeResult<K>>;

/** Renderer-side send signature for a channel. */
export type Sender<K extends SendChannel> = (...args: SendArgs<K>) => void;

/** Renderer-side subscription signature for an event channel. */
export type EventSubscriber<K extends EventChannel> = (listener: (payload: EventPayload<K>) => void) => Unsubscribe;

/**
 * Main-side handler signature (without the IpcMainInvokeEvent, which lives
 * in electron's types and therefore not in shared/).
 */
export type InvokeHandler<K extends InvokeChannel> = (
  ...args: InvokeArgs<K>
) => InvokeResult<K> | Promise<InvokeResult<K>>;

export type SendHandler<K extends SendChannel> = (...args: SendArgs<K>) => void;
