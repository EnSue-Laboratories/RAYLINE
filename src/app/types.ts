/**
 * Types shared by the app shell (src/app). Domain types come from shared/;
 * these describe the renderer-side seams between App's hooks, stores and
 * the still-unconverted components.
 */

import type {
  AgentPermissionRequest,
  Attachment,
  ChatMessage,
  ConversationData,
  DispatchRowInput,
  DispatchRowResult,
  FileAttachment,
  ImagePayload,
} from "@shared/chat/types";
import type { EffortLevel } from "@shared/models/types";
import type {
  ModelProviderId,
  MulticaContext,
  OpenCodeRuntimeConfig,
  ProviderUpstreamConfig,
  RemoteRuntimeConfig,
  RuntimeProviderId,
} from "@shared/providers/types";

// ── useAgent (chat-core) ────────────────────────────────────────────────────

export interface PrepareMessageInput {
  conversationId: string;
  prompt: string;
  images?: ImagePayload[];
  files?: FileAttachment[];
}

/** Fields common to `startPreparedMessage` and `editAndResend`. */
export interface AgentRunOptions {
  model?: string;
  provider: ModelProviderId;
  runtimeProvider?: RuntimeProviderId;
  effort?: EffortLevel;
  thinking?: boolean;
  openCodeConfig?: OpenCodeRuntimeConfig;
  providerUpstreamConfig?: ProviderUpstreamConfig;
  remoteRuntime?: RemoteRuntimeConfig;
  cwd?: string;
  projectContext?: string;
  multicaContext?: MulticaContext;
  multicaToken?: string;
  /** Grok only: `--continue` when no native session exists yet. */
  grokContinue?: boolean;
}

export interface StartPreparedMessageInput extends AgentRunOptions {
  conversationId: string;
  pendingId?: string;
  sessionId?: string;
  resumeSessionId?: string;
  forkSession?: boolean;
  prompt: string;
  images?: (string | ImagePayload)[];
  files?: FileAttachment[];
}

export interface EditAndResendInput extends AgentRunOptions {
  conversationId: string;
  sessionId?: string;
  messageIndex: number;
  newText: string;
  wirePrompt?: string;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A message to append locally; `useAgent` assigns an id when missing. */
export type LocalMessageInput = DistributiveOmit<ChatMessage, "id"> & { id?: string };

/** Return shape of `useAgent()` (kept by chat-core's store rewrite). */
export interface AgentApi {
  conversations: ReadonlyMap<string, ConversationData>;
  getConversation: (id: string) => ConversationData;
  prepareMessage: (input: PrepareMessageInput) => string;
  appendLocalMessages: (conversationId: string, messages: LocalMessageInput[]) => void;
  startPreparedMessage: (input: StartPreparedMessageInput) => boolean;
  cancelMessage: (conversationId: string) => void;
  editAndResend: (input: EditAndResendInput) => boolean;
  loadMessages: (conversationId: string, messages: ChatMessage[]) => void;
  replaceMessages: (conversationId: string, messages: LocalMessageInput[]) => void;
  markMulticaConnected: (conversationId: string) => void;
}

// ── useTerminal (terminal-pm-ui) ────────────────────────────────────────────

export type { TerminalApi } from "../hooks/useTerminal";

// ── Chat creation / dispatch ────────────────────────────────────────────────

/** `onCreateChat` options (NewChatCard, dispatch rows). */
export interface CreateChatOptions {
  id?: string;
  title?: string;
  prompt?: string;
  attachments?: Attachment[];
  model?: string;
  effort?: EffortLevel | null;
  /** undefined = app default, null = drafts. */
  cwd?: string | null;
  branch?: string;
  branchMode?: "new" | "existing";
  worktree?: boolean;
  worktreeBaseBranch?: string;
  issueContext?: string;
  dispatchId?: string;
  tags?: string[];
  suppressActivate?: boolean;
}

export interface DispatchOutcome {
  dispatchId: string;
  results: DispatchRowResult[];
}

export type DispatchHandler = (rows: DispatchRowInput[]) => Promise<DispatchOutcome>;

// ── Permissions ─────────────────────────────────────────────────────────────

export type PermissionRequest = AgentPermissionRequest;

export interface PermissionReply {
  requestId: string;
  behavior: "allow" | "deny";
  scope?: "once" | "session";
  message?: string;
}

// ── Runtime setup card ──────────────────────────────────────────────────────

export interface RuntimeSetupCommand {
  providerId: string;
  command: string;
}

export interface RuntimeSetupInfo {
  required: boolean;
  checking: boolean;
  installed: { claude: boolean; codex: boolean; opencode: boolean; grok: boolean; agy: boolean };
  opencodeConfigured: boolean;
  platform: string;
  onRunCommand: (command: RuntimeSetupCommand) => Promise<void>;
  onRefresh: () => void;
  onConfigureOpenCode: () => void;
}

// ── Lab / value controls (ValueControlBlock) ────────────────────────────────

export interface ControlChange {
  target: string;
  value: unknown;
}
