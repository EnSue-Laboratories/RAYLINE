/**
 * Conversation actions (moved out of useAgent). Plain functions with stable
 * identity: they read and write `conversationsStore` and talk to `window.api`.
 */
import type { AgentStreamPayload } from "@shared/agent/events";
import type {
  AgentEditResendRequest,
  AgentStartRequest,
  ChatMessage,
  FileAttachment,
  MessageImage,
} from "@shared/chat/types";
import type { MulticaContext } from "@shared/providers/types";
import { finalizedCopy, newAssistantMessage } from "./assistant";
import { applyStreamEvent } from "./applyStreamEvent";
import { uid } from "./ids";
import { createLogger } from "../../utils/logger";
import { type CommitPriority, getConversation, updateConversations } from "./store";
import type { ConversationRuntime } from "./types";

const log = createLogger("useAgent");

/** A message without an id yet (one is assigned on insert). */
export type ChatMessageInput = ChatMessage extends infer M ? (M extends ChatMessage ? Omit<M, "id"> & { id?: string } : never) : never;

const emptyIdle = (): ConversationRuntime => ({ messages: [], isStreaming: false, error: null });

function withId(message: ChatMessageInput): ChatMessage {
  // Explicit narrowing keeps the union intact through the spread.
  const id = message.id || uid();
  switch (message.role) {
    case "user":
      return { ...message, id };
    case "assistant":
      return { ...message, id };
    case "system":
      return { ...message, id };
    default: {
      const unhandled: never = message;
      return unhandled;
    }
  }
}

// conversationId → pendingId of a prepared-but-not-started run.
const pendingStarts = new Map<string, string>();

export function clearPendingStart(conversationId: string): void {
  pendingStarts.delete(conversationId);
}

// ── Stream ──────────────────────────────────────────────────────────────────

/** Fold a batch of stream payloads into the store with ONE draft and ONE commit. */
export function applyStreamPayloads(items: readonly AgentStreamPayload[], priority: CommitPriority = "urgent"): void {
  if (items.length === 0) return;
  updateConversations((draft) => {
    for (const { conversationId, event } of items) applyStreamEvent(draft.conversation(conversationId), event);
  }, priority);
}

// ── Sending ─────────────────────────────────────────────────────────────────

export interface PrepareMessageInput {
  conversationId: string;
  prompt: string;
  images?: MessageImage[];
  files?: FileAttachment[];
}

/** Optimistically append the user turn + an empty streaming assistant. Returns the pending id. */
export function prepareMessage({ conversationId, prompt, images, files }: PrepareMessageInput): string {
  const pendingId = uid();
  pendingStarts.set(conversationId, pendingId);
  updateConversations((draft) => {
    const convo = draft.conversation(conversationId, emptyIdle);
    const messages = [...convo.messages, { id: uid(), role: "user", text: prompt, images, files } as const, newAssistantMessage(false)];
    // A prepared run starts a fresh live entry (same as before the store split).
    convo.replace({ messages, isStreaming: true, error: null });
  });
  return pendingId;
}

export function appendLocalMessages(conversationId: string, messages: readonly ChatMessageInput[]): void {
  if (!conversationId || !Array.isArray(messages) || messages.length === 0) return;
  updateConversations((draft) => {
    const convo = draft.conversation(conversationId, emptyIdle);
    convo.setMessages([...convo.messages, ...messages.map(withId)]);
    convo.set("isStreaming", false);
    convo.set("error", null);
  });
}

export interface StartPreparedMessageInput extends Omit<AgentStartRequest, "_multica" | "_multicaToken"> {
  pendingId?: string | null;
  multicaContext?: MulticaContext;
  multicaToken?: string;
}

/** Start a run prepared by `prepareMessage`; false when it was cancelled / superseded. */
export function startPreparedMessage(input: StartPreparedMessageInput): boolean {
  const { conversationId, pendingId } = input;
  const expectedPendingId = pendingStarts.get(conversationId);
  if (pendingId && expectedPendingId !== pendingId) {
    log("Skipping stale or cancelled pending start", { conversationId, pendingId, expectedPendingId });
    return false;
  }
  if (pendingId) pendingStarts.delete(conversationId);
  if (window.api) {
    const payload: AgentStartRequest = {
      conversationId,
      sessionId: input.sessionId,
      prompt: input.prompt,
      model: input.model,
      provider: input.provider,
      runtimeProvider: input.runtimeProvider,
      effort: input.effort,
      thinking: input.thinking,
      openCodeConfig: input.openCodeConfig,
      providerUpstreamConfig: input.providerUpstreamConfig,
      grokContinue: input.grokContinue,
      remoteRuntime: input.remoteRuntime,
      cwd: input.cwd,
      projectContext: input.projectContext,
      images: input.images,
      files: input.files,
      resumeSessionId: input.resumeSessionId,
      forkSession: input.forkSession,
    };
    if (input.provider === "multica") {
      payload._multica = input.multicaContext;
      payload._multicaToken = input.multicaToken;
    }
    window.api.agentStart(payload);
  }
  return true;
}

export function cancelMessage(conversationId: string): void {
  if (pendingStarts.has(conversationId)) {
    pendingStarts.delete(conversationId);
    updateConversations((draft) => {
      const convo = draft.conversation(conversationId);
      if (!convo.exists) return;
      finalizeAll(convo.messages, (messages) => convo.setMessages(messages));
      convo.set("isStreaming", false);
      convo.set("error", null);
    });
  }
  if (window.api) window.api.agentCancel({ conversationId });
}

export interface EditAndResendInput extends Omit<AgentEditResendRequest, "prompt" | "resumeSessionId" | "forkSession"> {
  /** Native session to resume + fork. */
  sessionId?: string;
  /** Index of the edited user message; everything from it on is replaced. */
  messageIndex: number;
  newText: string;
  /** Prompt actually sent (e.g. with attachment preamble); defaults to `newText`. */
  wirePrompt?: string;
  multicaContext?: MulticaContext;
  multicaToken?: string;
}

export function editAndResend(input: EditAndResendInput): boolean {
  const { conversationId, messageIndex, newText } = input;
  updateConversations((draft) => {
    const convo = draft.conversation(conversationId);
    if (!convo.exists) return;
    const messages = [...convo.messages.slice(0, messageIndex), { id: uid(), role: "user", text: newText } as const, newAssistantMessage(false)];
    convo.replace({ messages, isStreaming: true, error: null });
  });

  if (!window.api) return false;
  const common = {
    conversationId,
    prompt: input.wirePrompt ?? newText,
    model: input.model,
    provider: input.provider,
    runtimeProvider: input.runtimeProvider,
    effort: input.effort,
    thinking: input.thinking,
    openCodeConfig: input.openCodeConfig,
    providerUpstreamConfig: input.providerUpstreamConfig,
    grokContinue: input.grokContinue,
    remoteRuntime: input.remoteRuntime,
    cwd: input.cwd,
    projectContext: input.projectContext,
  };
  if (input.provider === "multica") {
    window.api.agentStart({ ...common, _multica: input.multicaContext, _multicaToken: input.multicaToken });
    return true;
  }
  window.api.agentEditAndResend({ ...common, resumeSessionId: input.sessionId, forkSession: true });
  return true;
}

// ── Loading / replacing ─────────────────────────────────────────────────────

/** Seed a conversation from disk; ignored when it already has live messages. */
export function loadMessages(conversationId: string, messages: ChatMessage[]): void {
  updateConversations((draft) => {
    const convo = draft.conversation(conversationId, emptyIdle);
    if (convo.exists && convo.messages.length > 0) return;
    convo.replace({ messages, isStreaming: false, error: null });
  });
}

export function replaceMessages(conversationId: string, messages: readonly ChatMessageInput[] | null | undefined): void {
  if (!conversationId) return;
  const nextMessages = Array.isArray(messages) ? messages.map(withId) : [];
  updateConversations((draft) => {
    const convo = draft.conversation(conversationId, emptyIdle);
    convo.setMessages(nextMessages);
    convo.set("isStreaming", false);
    convo.set("error", null);
  });
}

export function markMulticaConnected(conversationId: string): void {
  if (!conversationId) return;
  if (getConversation(conversationId).multicaConnected) return;
  updateConversations((draft) => {
    // Transient — resets per session; stripped from persisted snapshots.
    draft.conversation(conversationId, emptyIdle).set("multicaConnected", true);
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Whether finalizing would change `message` (only those are copied). */
function needsFinalize(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  return Boolean(message.isStreaming) || Boolean(message.isThinking) || "_compacting" in message || (message._elapsedMs == null && Boolean(message._startedAt));
}

/** Stop + freeze every assistant message that is still live; untouched messages keep identity. */
export function finalizeAll(messages: readonly ChatMessage[], commit: (messages: ChatMessage[]) => void): void {
  if (!messages.some(needsFinalize)) return;
  commit(messages.map((message) => (needsFinalize(message) ? finalizedCopy(message) : message)));
}
