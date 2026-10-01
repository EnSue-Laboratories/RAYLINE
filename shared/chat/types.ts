/**
 * Renderer chat data model: messages and their parts, conversations (sidebar
 * entries, persisted in app state), live per-conversation stream state, and
 * the request payloads the renderer sends to start / edit / cancel agent runs.
 *
 * Shapes are derived from src/hooks/useAgent, src/App (persistence +
 * normalizeConversationState), src/components/Message & friends,
 * electron/session-reader and electron/agent-manager.
 */

import type { RateLimits, TokenUsage } from "../agent/usage";
import type { DispatchModelPayload, EffortLevel } from "../models/types";
import type {
  ModelProviderId,
  MulticaContext,
  OpenCodeRuntimeConfig,
  ProviderUpstreamConfig,
  RemoteRuntimeConfig,
  RuntimeProviderId,
} from "../providers/types";

// ── Attachments & images ────────────────────────────────────────────────────

/** Image in the composer / queue (src/utils/attachments `fileToAttachment`). */
export interface ImageAttachment {
  type: "image";
  dataUrl: string;
  name?: string;
  /** Original filesystem path, when known. */
  path?: string;
  /** Copy under userData/message-images (from `store-message-image`). */
  storagePath?: string;
  mime?: string;
}

/** Non-image file attachment; only the path is sent to the agent. */
export interface FileAttachment {
  type: "file";
  name?: string;
  path?: string;
}

export type Attachment = ImageAttachment | FileAttachment;

/** Image as carried on a live user message / sent to Multica. */
export interface ImagePayload {
  dataUrl: string;
  name?: string;
  path?: string;
  storagePath?: string;
  mime?: string;
}

export const STORED_MESSAGE_IMAGE_TYPE = "rayline-stored-image";

/** Image persisted to disk by main (`store-message-image`, state save). */
export interface StoredMessageImage {
  type: typeof STORED_MESSAGE_IMAGE_TYPE;
  storagePath: string;
  mime?: string;
  name?: string;
  originalPath?: string;
}

/** `user.images[]` entry: data URL (legacy), live payload, or stored ref. */
export type MessageImage = string | ImagePayload | StoredMessageImage;

/** Argument of `store-message-image`. */
export interface StoreMessageImageInput {
  dataUrl: string;
  name?: string;
  path?: string;
}

// ── Message parts ───────────────────────────────────────────────────────────

/** Streaming bookkeeping shared by parts built from Claude content blocks. */
interface StreamedPartFields {
  /** Claude content-block index within the API call. */
  blockIndex?: number;
  /** `${turn}:${blockIndex}` — unique per block across multi-call turns. */
  _streamKey?: string;
  /** OpenCode part start time (ms), used for ordering. */
  _opencodeTime?: number;
}

export interface TextPart extends StreamedPartFields {
  type: "text";
  text: string;
  id?: string;
}

export interface ThinkingPart extends StreamedPartFields {
  type: "thinking";
  text: string;
  id?: string;
  /** Set once thinking finished (OpenCode reports start/end). */
  durationMs?: number;
}

export type ToolStatus = "running" | "done";

/**
 * A tool call and (once finished) its result. `result` is whatever the
 * provider returned: a string, Claude `tool_result` content blocks, parsed
 * JSON (Codex), or null while running.
 */
export interface ToolPart extends StreamedPartFields {
  type: "tool";
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** Raw accumulated `input_json_delta` while streaming (Claude). */
  argsJson?: string;
  result: unknown;
  status: ToolStatus;
}

/** Assistant-emitted image (Claude image block / OpenAI image output). */
export interface ImagePart extends StreamedPartFields {
  type: "image";
  id?: string;
  /** http(s) URL or data URL. */
  src?: string;
  alt?: string;
  mime?: string;
  storagePath?: string;
  originalPath?: string;
}

export type StatusKind = "paused" | (string & {});

/** Inline status banner (e.g. "Paused by hook"). */
export interface StatusPart {
  type: "status";
  kind: StatusKind;
  title?: string;
  text?: string;
}

export type MessagePart = TextPart | ThinkingPart | ToolPart | ImagePart | StatusPart;
export type MessagePartType = MessagePart["type"];

// ── AskUserQuestion (rendered from a ToolPart named "AskUserQuestion") ──────

export interface AskUserQuestionOption {
  label: string;
  description?: string;
}

export interface AskUserQuestionItem {
  question: string;
  header?: string;
  options?: AskUserQuestionOption[];
  multiSelect?: boolean;
}

export interface AskUserQuestionArgs {
  questions: AskUserQuestionItem[];
}

export const ASK_USER_QUESTION_TOOL = "AskUserQuestion";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isAskUserQuestionItem(value: unknown): value is AskUserQuestionItem {
  return isRecord(value) && typeof value.question === "string";
}

/** Narrow a tool part's args to AskUserQuestion's `{ questions }`. */
export function getAskUserQuestionArgs(part: ToolPart): AskUserQuestionArgs | null {
  if (part.name !== ASK_USER_QUESTION_TOOL) return null;
  const questions = part.args.questions;
  if (!Array.isArray(questions)) return null;
  return { questions: questions.filter(isAskUserQuestionItem) };
}

// ── Messages ────────────────────────────────────────────────────────────────

/** Per-assistant-message Claude stream bookkeeping (useAgent). */
export interface StreamState {
  currentTurn: number;
  seenIndexes: Record<number, boolean>;
  /** content-block index → stream key */
  activeBlocks: Record<number, string>;
  /** stream key → still thinking */
  activeThinking: Record<string, boolean>;
}

interface ChatMessageBase {
  id: string;
  /** Never sent to / synced with an agent session (shell mode, dev fixtures). */
  localOnly?: boolean;
  /** Multica server message id (dedupe on reconnect). */
  _multicaId?: string | number;
}

export interface UserMessage extends ChatMessageBase {
  role: "user";
  text: string;
  images?: MessageImage[];
  files?: FileAttachment[];
  /** `shell-command` for `!cmd` shell-mode input. */
  mode?: "shell-command";
  /** Claude-assigned message uuid (needed for rewind / edit). */
  claudeUuid?: string;
}

export interface AssistantMessage extends ChatMessageBase {
  role: "assistant";
  /** Missing only on legacy persisted messages that stored plain `text`. */
  parts?: MessagePart[];
  /** Legacy plain-text body. */
  text?: string;
  /** Legacy tool calls (pre-`parts`). */
  toolCalls?: ToolPart[];
  isStreaming?: boolean;
  isThinking?: boolean;
  _streamState?: StreamState;
  /** epoch ms when the turn started (live only). */
  _startedAt?: number;
  /** Frozen duration once the turn ended (persisted). */
  _elapsedMs?: number;
  /** Latest API-call usage (window fullness), persisted. */
  _usage?: TokenUsage | null;
  /** Plan quota snapshot (transient — stripped on persist). */
  _rateLimits?: RateLimits | null;
  /** Auto-compaction in progress (transient). */
  _compacting?: boolean;
}

/** Local shell-mode result. */
export interface SystemMessage extends ChatMessageBase {
  role: "system";
  text: string;
  mode?: "shell-result";
  command?: string;
  exitCode?: number | null;
}

export type ChatMessage = UserMessage | AssistantMessage | SystemMessage;
export type ChatRole = ChatMessage["role"];

// ── Live conversation state (useAgent) ──────────────────────────────────────

export interface ConversationData {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  /** Multica WS subscription is live (transient). */
  multicaConnected?: boolean;
  /** Native session ids captured from the stream. */
  _claudeSessionId?: string;
  _codexThreadId?: string;
  _opencodeSessionId?: string;
  /** Grok native session id (from stream `sessionId` / `agent-done.threadId`). */
  _grokSessionId?: string;
  /** Antigravity native conversation id (`conversation_id`). */
  _agySessionId?: string;
}

// ── Conversations (sidebar / persisted) ─────────────────────────────────────

export type ConversationSessionOrigin =
  | "unknown"
  | "draft"
  | "fresh"
  | "legacy"
  | "legacy-primary"
  | "loaded"
  | "loaded-meta"
  | "local-shell"
  | "preview-load"
  | "preview-meta"
  | "resolved"
  | "capture"
  | (string & {});

/** One provider-native session in a conversation's session ledger. */
export interface ConversationSession {
  /** RayLine ledger id (`session-<provider>-<ts>-<rand>`). */
  id: string;
  provider: ModelProviderId | null;
  /** Claude session uuid / Codex thread id / OpenCode, Grok or AGY session id. */
  nativeSessionId: string | null;
  model: string | null;
  /** How many archived messages this native session already contains. */
  syncedThroughMessageCount: number;
  createdAt: number;
  updatedAt: number;
  origin: ConversationSessionOrigin;
}

/** Tab-strip metadata (`conversation.tab`, src/utils/tabs). */
export interface ConversationTabMeta {
  pinned?: boolean;
  pinnedAt?: number;
  lastSeenAt?: number;
  runEndedAt?: number | null;
}

export type CwdRecoveryReason = "worktree-root" | "app-cwd" | "none";

export interface CwdRecoveryMarker {
  originalCwd: string | null;
  recoveredCwd: string | null;
  recoveryReason: CwdRecoveryReason;
}

/**
 * A conversation as kept in `convoList` and persisted under `state.convos`.
 * After `normalizeConversationState()` the session-ledger fields
 * (`sessions`, `activeSessionId`, `providerSessions`, `sessionId`,
 * `sessionProvider`, `archivedMessages`) are always present.
 */
export interface Conversation {
  id: string;
  title: string;
  /** Model id (see shared/models). */
  model: string;
  /**
   * Reasoning effort chosen for this conversation; absent/null = model
   * default. Introduced with the effort-agnostic model id scheme.
   */
  effort?: EffortLevel | null;
  /**
   * Grok only: start the first turn with `grok --continue` (resume the CLI's
   * most recent session for the cwd) when no native session id exists yet.
   * Replaces the PR #230 `grok-46-continue` model id (see
   * `normalizeModelSelection`, which reports it as `grokContinue`).
   */
  grokContinue?: boolean;
  /** Creation / last-activity epoch ms. */
  ts: number;
  cwd?: string;

  sessions: ConversationSession[];
  activeSessionId: string | null;
  /** Derived lookup provider → latest native session id. */
  providerSessions: Partial<Record<ModelProviderId, string>>;
  /** Active session's native id (derived). */
  sessionId: string | null;
  sessionProvider: ModelProviderId | null;
  lastProvider?: ModelProviderId;
  /** @deprecated pre-ledger field, migrated by normalizeConversationState. */
  provider?: ModelProviderId;

  /** Persisted transcript (serializeMessagesForState). */
  archivedMessages: ChatMessage[];
  lastPreview?: string;

  dispatchId?: string;
  tags?: string[];
  tab?: ConversationTabMeta;
  /** user-message index → checkpoint ref (`checkpoint-create`). */
  checkpoints?: Record<number, string>;
  pendingCwdRecovery?: CwdRecoveryMarker;

  /** Active Multica binding and per-agent bindings. */
  _multica?: MulticaContext;
  _multicaSessions?: Record<string, MulticaContext>;

  /** Sidebar search hit preview (transient, never persisted). */
  _searchPreview?: string | null;
}

/** Message queued while the agent is busy (`state.queuedMessages`). */
export interface QueuedMessage {
  id: string;
  conversationId: string;
  text: string;
  attachments?: Attachment[];
  queuedAt: number;
}

// ── Agent run requests (renderer → main) ────────────────────────────────────

/** Payload of `agent-start` (useAgent `startPreparedMessage`). */
export interface AgentStartRequest {
  conversationId: string;
  prompt: string;
  /** Model CLI flag (`ModelDefinition.cliFlag`), not the RayLine model id. */
  model?: string;
  provider?: ModelProviderId;
  /** Which backend runs it; main falls back to remoteRuntime.provider, then provider. */
  runtimeProvider?: RuntimeProviderId;
  effort?: EffortLevel;
  /** OpenCode: force thinking on/off (undefined = infer from model). */
  thinking?: boolean;
  openCodeConfig?: OpenCodeRuntimeConfig;
  providerUpstreamConfig?: ProviderUpstreamConfig;
  remoteRuntime?: RemoteRuntimeConfig;
  cwd?: string;
  /** Per-project context appended to the system prompt. */
  projectContext?: string;
  /** Data URLs (Claude/Codex/OpenCode) or image payloads (Multica). */
  images?: (string | ImagePayload)[];
  files?: FileAttachment[];
  /** New native session id to create (Claude `--session-id`). */
  sessionId?: string;
  /** Existing native session to resume. */
  resumeSessionId?: string;
  forkSession?: boolean;
  /**
   * Grok only: pass `--continue` when there is no native session to resume
   * (ignored when `sessionId` / `resumeSessionId` is set). AGY rejects
   * `forkSession` and image payloads.
   */
  grokContinue?: boolean;
  /** Multica only. */
  _multica?: MulticaContext;
  _multicaToken?: string;
}

/** Payload of `agent-edit-resend` (resume + fork the native session). */
export interface AgentEditResendRequest
  extends Omit<AgentStartRequest, "images" | "files" | "sessionId" | "_multica" | "_multicaToken"> {
  resumeSessionId?: string;
  forkSession?: boolean;
}

/** Payload of `agent-cancel`. */
export interface AgentCancelRequest {
  conversationId: string;
}

// ── Tool permission prompts (Claude `can_use_tool`) ─────────────────────────

/** `agent-permission-request` (main → renderer). */
export interface AgentPermissionRequest {
  conversationId: string;
  requestId: string;
  toolUseId: string | null;
  toolName: string;
  input: Record<string, unknown>;
  blockedPath: string | null;
  description: string | null;
  permissionSuggestions: unknown[] | null;
  /** Path / command / URL shown to the user. */
  summary: string;
  targetPath: string | null;
  isSensitiveFile: boolean;
  /** `${toolName}::${target}` — key for "allow for session". */
  allowKey: string;
}

/** `agent-permission-cancelled` (main → renderer). */
export interface AgentPermissionCancelled {
  conversationId: string;
  requestId: string;
}

export type PermissionBehavior = "allow" | "deny";
export type PermissionScope = "once" | "session";

/** `agent-permission-respond` (renderer → main). */
export interface AgentPermissionResponse {
  conversationId: string;
  requestId: string;
  behavior: PermissionBehavior;
  scope?: PermissionScope;
  /** Deny reason shown to the model. */
  message?: string;
  updatedInput?: Record<string, unknown>;
}

// ── Session history (Claude ~/.claude/projects, Codex ~/.codex/sessions) ───

export type SessionSourceProvider = "claude" | "codex";

/** `list-sessions` entry. */
export interface SessionSummary {
  id: string;
  /** First user message, ≤ 60 chars, or "Untitled". */
  title: string;
  model: string | null;
  /** File mtime, epoch ms. */
  ts: number;
  cwd: string;
  provider: SessionSourceProvider;
}

/** `load-session` result. `provider` is null when the session was not found. */
export interface LoadedSession {
  messages: ChatMessage[];
  cwd: string | null;
  provider: SessionSourceProvider | null;
  /** Codex only. */
  usageSnapshot?: TokenUsage | null;
  rateLimitsSnapshot?: RateLimits | null;
}

/** `load-session-search-text` result. */
export interface SessionSearchText {
  text: string;
  cwd: string | null;
  provider: SessionSourceProvider | null;
}

/** `rewind-files` argument (Claude `--rewind-files`). */
export interface RewindFilesRequest {
  sessionId: string;
  messageUuid: string;
  cwd?: string;
}

// ── One-shot helpers ────────────────────────────────────────────────────────

/** `quick-explain` argument; resolves to markdown text (or "Error: …"). */
export interface QuickExplainRequest {
  text: string;
  /** Claude `--model` value; defaults to "sonnet". */
  model?: string;
}

/** `dispatch-plan` argument. */
export interface DispatchPlanRequest {
  /** User's batch brief; must be non-empty. */
  instructions: string;
  cwd?: string | null;
  plannerModel: DispatchModelPayload;
  targetModels: DispatchModelPayload[];
  defaultTargetModel?: string;
}

export interface DispatchPlanRow {
  title: string;
  prompt: string;
  /** kebab-case branch name. */
  branch: string;
  /** Model id chosen from `targetModels`. */
  model: string;
}

/** `dispatch-plan` result (rejects when the planner returns no rows). */
export interface DispatchPlan {
  rows: DispatchPlanRow[];
}

/** One row the Dispatch card asks App to launch (worktree + conversation). */
export interface DispatchRowInput {
  prompt: string;
  attachments?: Attachment[];
  model: string;
  cwd: string;
  branch: string;
  issueContext?: string;
  tag?: string;
}

export interface DispatchRowResult {
  ok: boolean;
  row: DispatchRowInput;
  /** Conversation created for the row. */
  chatId: string;
  /** Rejection reason when `ok` is false. */
  error?: unknown;
}
