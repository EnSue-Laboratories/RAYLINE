/**
 * Record provider-native session ids (Claude session, Codex thread, OpenCode
 * / Grok / AGY session) on the active conversation as they arrive from the
 * stream, so later sends resume them.
 */

import type { Conversation, ConversationData, ConversationSession } from "@shared/chat/types";
import { getRuntimeProviderForProvider, type ModelProviderId, type RuntimeProviderId } from "@shared/providers/types";
import { convoListStore, updateConvo } from "../../store/convoList";
import { getActiveConversationSession, normalizeConversationState, upsertConversationSession } from "../conversation/sessions";
import { logSessionState } from "../log";
import { getLiveConversation, liveConversationsStore } from "../stores/live";

type NativeIdField = "_claudeSessionId" | "_codexThreadId" | "_opencodeSessionId" | "_grokSessionId" | "_agySessionId";

/** Live-data field → runtime provider. Claude/Codex captures may belong to a remote-* provider. */
const CAPTURE_FIELDS: readonly { field: NativeIdField; runtime: RuntimeProviderId; remoteCapable: boolean }[] = [
  { field: "_codexThreadId", runtime: "codex", remoteCapable: true },
  { field: "_claudeSessionId", runtime: "claude", remoteCapable: true },
  { field: "_opencodeSessionId", runtime: "opencode", remoteCapable: false },
  { field: "_grokSessionId", runtime: "grok", remoteCapable: false },
  { field: "_agySessionId", runtime: "agy", remoteCapable: false },
];

export interface SessionCapture {
  provider: ModelProviderId;
  nativeSessionId: string;
}

/** Pure: native ids in `data` not yet recorded in the conversation's ledger. */
export function findNewSessionCaptures(
  normalized: Conversation,
  activeSession: ConversationSession | null,
  data: ConversationData,
): SessionCapture[] {
  const captureProvider = (runtime: RuntimeProviderId): ModelProviderId =>
    [activeSession?.provider, normalized.lastProvider].find(
      (provider): provider is ModelProviderId => Boolean(provider) && getRuntimeProviderForProvider(provider as ModelProviderId) === runtime,
    ) ?? runtime;
  const captures: SessionCapture[] = [];
  for (const { field, runtime, remoteCapable } of CAPTURE_FIELDS) {
    const nativeSessionId = data[field];
    if (!nativeSessionId) continue;
    const provider = remoteCapable ? captureProvider(runtime) : runtime;
    if (normalized.providerSessions[provider] !== nativeSessionId) captures.push({ provider, nativeSessionId });
  }
  return captures;
}

export function applySessionCaptures(
  conversation: Conversation,
  activeSession: ConversationSession | null,
  captures: readonly SessionCapture[],
): Conversation {
  let next = normalizeConversationState(conversation);
  for (const { provider, nativeSessionId } of captures) {
    next = upsertConversationSession(
      next,
      {
        id: activeSession?.provider === provider && !activeSession.nativeSessionId ? activeSession.id : undefined,
        provider,
        nativeSessionId,
        model: next.model,
        syncedThroughMessageCount: Math.max(activeSession?.syncedThroughMessageCount || 0, next.archivedMessages.length),
        origin: "capture",
      },
      { activate: true, preferPendingActive: true, lastProvider: next.lastProvider || provider },
    );
  }
  return next;
}

// Skip the (transcript-sized) normalization when neither the row nor the
// captured ids changed since the last check.
let lastChecked: { row: Conversation; ids: string } | null = null;

function capturedIds(data: ConversationData): string {
  return CAPTURE_FIELDS.map(({ field }) => data[field] ?? "").join("\u0000");
}

function run(): void {
  const { convos, activeId } = convoListStore.getState();
  if (!activeId) return;
  const convo = convos.find((c) => c.id === activeId);
  if (!convo) return;
  const data = getLiveConversation(activeId);
  const ids = capturedIds(data);
  if (lastChecked?.row === convo && lastChecked.ids === ids) return;
  lastChecked = { row: convo, ids };
  if (!ids.replace(/\u0000/g, "")) return;

  const normalized = normalizeConversationState(convo);
  const activeSession = getActiveConversationSession(normalized);
  const captures = findNewSessionCaptures(normalized, activeSession, data);
  if (captures.length === 0) return;

  logSessionState("captureProviderSession", {
    conversationId: activeId,
    captures,
    lastProvider: normalized.lastProvider || null,
    sessionId: normalized.sessionId || null,
    sessionProvider: normalized.sessionProvider || null,
    providerSessions: normalized.providerSessions,
    activeSessionId: normalized.activeSessionId || null,
    activeSession,
  });
  updateConvo(activeId, (c) => applySessionCaptures(c, activeSession, captures));
}

export function startSessionCapture(): () => void {
  const unsubscribers = [liveConversationsStore.subscribe(run), convoListStore.subscribe(run)];
  run();
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
