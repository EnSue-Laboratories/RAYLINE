/**
 * Main → renderer agent events (`agent-stream`, `agent-done`, `agent-error`)
 * wired into the conversations store. Stream events are coalesced into one
 * commit per frame (≤ ~30 fps); terminal events flush immediately.
 */
import type { AgentDonePayload, AgentErrorPayload, AgentStreamPayload, RateLimits, TokenUsage } from "@shared/agent/events";
import type { ChatMessage, LoadedSession } from "@shared/chat/types";
import { buildErrorPart, editTrailingAssistant, finalizeAssistant, findLatestAssistantIndex } from "./assistant";
import { applyStreamPayloads, clearPendingStart, finalizeAll } from "./actions";
import { isImmediateFlushEvent } from "./applyStreamEvent";
import { conversationsStore, updateConversations } from "./store";
import { browserFrameScheduler, createStreamBuffer, type FrameScheduler, type StreamBuffer } from "./streamBuffer";

const CODEX_USAGE_HYDRATION_RETRY_DELAYS_MS = [0, 150, 500, 1200, 2500];

interface SessionStats {
  usage: TokenUsage | null;
  rateLimits: RateLimits | null;
}

export function extractSessionStats(result: LoadedSession | null | undefined): SessionStats {
  const messages: readonly ChatMessage[] = result?.messages ?? [];
  const latest = messages[findLatestAssistantIndex(messages)];
  const assistant = latest?.role === "assistant" ? latest : undefined;
  return {
    usage: result?.usageSnapshot || assistant?._usage || null,
    rateLimits: result?.rateLimitsSnapshot || assistant?._rateLimits || null,
  };
}

/** Fill missing usage / quota on the latest assistant message (never overwrites). */
export function applySessionStats(conversationId: string, stats: SessionStats): void {
  updateConversations((draft) => {
    const convo = draft.conversation(conversationId);
    if (!convo.exists) return;
    const index = findLatestAssistantIndex(convo.messages);
    const current = convo.messages[index];
    if (current?.role !== "assistant") return;
    const nextUsage = current._usage || stats.usage || null;
    const nextRateLimits = current._rateLimits || stats.rateLimits || null;
    if (nextUsage === current._usage && nextRateLimits === current._rateLimits) return;
    const message = convo.editAssistant(index);
    if (!message) return;
    if (nextUsage) message._usage = nextUsage;
    if (nextRateLimits) message._rateLimits = nextRateLimits;
  });
}

const hydrationTimers = new Set<number>();

/** Codex usage lands in the session file after exit: poll it a few times. */
function scheduleUsageHydration(conversationId: string, codexThreadId: string, attempt = 0): void {
  const retry = (): void => {
    const delay = CODEX_USAGE_HYDRATION_RETRY_DELAYS_MS[attempt + 1];
    if (delay == null) return;
    const timer = window.setTimeout(() => {
      hydrationTimers.delete(timer);
      scheduleUsageHydration(conversationId, codexThreadId, attempt + 1);
    }, delay);
    hydrationTimers.add(timer);
  };
  window.api
    .loadSession(codexThreadId)
    .then((result) => {
      const stats = extractSessionStats(result);
      if (stats.usage || stats.rateLimits) applySessionStats(conversationId, stats);
      else retry();
    })
    .catch(retry);
}

export function handleAgentDone(buffer: StreamBuffer<AgentStreamPayload> | null, { conversationId, provider, threadId }: AgentDonePayload): void {
  // Apply buffered tokens BEFORE finalizing so the last chunk is never lost.
  buffer?.flush();
  clearPendingStart(conversationId);
  const convo = conversationsStore.getState().byId.get(conversationId);
  if (!convo) return;
  const codexThreadId = convo._codexThreadId || (provider === "codex" && typeof threadId === "string" && threadId ? threadId : null);
  let needsUsageHydration = false;
  updateConversations((draft) => {
    const entry = draft.conversation(conversationId);
    finalizeAll(entry.messages, (messages) => entry.setMessages(messages));
    const latest = entry.messages[findLatestAssistantIndex(entry.messages)];
    if (latest?.role === "assistant" && codexThreadId && (!latest._usage || !latest._rateLimits)) needsUsageHydration = true;
    if (codexThreadId) entry.set("_codexThreadId", codexThreadId);
    // Grok / AGY / OpenCode report their native session id on exit (PR #230).
    if (typeof threadId === "string" && threadId) {
      if (provider === "grok") entry.set("_grokSessionId", threadId);
      else if (provider === "agy") entry.set("_agySessionId", threadId);
      else if (provider === "opencode") entry.set("_opencodeSessionId", threadId);
    }
    entry.set("isStreaming", false);
  });
  if (needsUsageHydration && codexThreadId && typeof window.api?.loadSession === "function") scheduleUsageHydration(conversationId, codexThreadId);
}

/**
 * `agent-error` (always followed by `agent-done`): surface the error on the
 * last assistant message. Merges into the entry — native session ids and the
 * Multica connection flag survive (previously the entry was replaced).
 */
export function handleAgentError(buffer: StreamBuffer<AgentStreamPayload> | null, { conversationId, error }: AgentErrorPayload): void {
  buffer?.flush();
  clearPendingStart(conversationId);
  updateConversations((draft) => {
    const convo = draft.conversation(conversationId, () => ({ messages: [], isStreaming: false, error: null }));
    const message = editTrailingAssistant(convo);
    if (message) {
      convo.editParts(message).push(convo.own(buildErrorPart(error)));
      finalizeAssistant(message);
    }
    convo.set("error", error);
    convo.set("isStreaming", false);
  });
}

// ── Connection (ref-counted; one IPC subscription for any number of hooks) ──

let connections = 0;
let teardown: (() => void) | null = null;

export function connectAgentEvents(scheduler: FrameScheduler = browserFrameScheduler): () => void {
  if (!window.api) return () => {};
  connections += 1;
  if (connections === 1) {
    // Mid-stream events coalesce into one commit per frame; terminal events
    // (and the done / error backstops) flush immediately.
    const buffer = createStreamBuffer<AgentStreamPayload>((items) => applyStreamPayloads(items), scheduler);
    const offStream = window.api.onAgentStream((payload) => buffer.push(payload, isImmediateFlushEvent(payload.event)));
    const offDone = window.api.onAgentDone((payload) => handleAgentDone(buffer, payload));
    const offError = window.api.onAgentError((payload) => handleAgentError(buffer, payload));
    teardown = () => {
      offStream();
      offDone();
      offError();
      // Drop buffered events without flushing — the subscriber is going away.
      buffer.dispose();
      for (const timer of hydrationTimers) window.clearTimeout(timer);
      hydrationTimers.clear();
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    connections -= 1;
    if (connections === 0) {
      teardown?.();
      teardown = null;
    }
  };
}
