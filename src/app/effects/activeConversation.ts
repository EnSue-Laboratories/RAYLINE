/**
 * Reactions to the active conversation's live state:
 *  - archive sync: when it is idle with messages, persist the transcript +
 *    preview on the row and mark the active session synced;
 *  - queue release: send the next queued message once it stops streaming;
 *  - Multica auto-reconnect after restart / WS loss.
 */

import type { ChatMessage } from "@shared/chat/types";
import { convoListStore, updateConvo } from "../../store/convoList";
import { getLastMessagePreview, serializeMessagesForState } from "../conversation/archive";
import { normalizeMulticaContext } from "../conversation/multica";
import { getActiveConversationSession, markConversationSessionSynced, normalizeConversationState } from "../conversation/sessions";
import { liveConversationsStore, getLiveConversation } from "../stores/live";
import { getQueue, queueInterruptRequested, queueStore, sendInFlight, setQueue } from "../stores/queue";
import { isTranscriptPending, transcriptStatusStore } from "../stores/transcripts";
import { uiStore } from "../stores/ui";
import { reconnectMulticaConversation } from "../actions/multica";
import { sendFromComposer } from "../actions/compose";

// ── archive sync ────────────────────────────────────────────────────────────

let lastSynced: { id: string; messages: ChatMessage[] } | null = null;

function syncActiveArchive(): void {
  const { activeId } = convoListStore.getState();
  if (!activeId) return;
  const data = getLiveConversation(activeId);
  if (data.isStreaming || data.messages.length === 0) return;
  if (lastSynced?.id === activeId && lastSynced.messages === data.messages) return;
  lastSynced = { id: activeId, messages: data.messages };

  const preview = getLastMessagePreview(data.messages);
  const archivedMessages = serializeMessagesForState(data.messages);
  const syncedMessageCount = data.messages.length;
  updateConvo(activeId, (c) => {
    const normalized = normalizeConversationState({ ...c, ...(preview ? { lastPreview: preview } : {}), archivedMessages });
    const activeSession = getActiveConversationSession(normalized);
    return activeSession ? markConversationSessionSynced(normalized, activeSession.id, syncedMessageCount) : normalized;
  });
}

// ── queue release ───────────────────────────────────────────────────────────

let queueCheckScheduled = false;

function releaseQueuedMessage(): void {
  queueCheckScheduled = false;
  const { activeId } = convoListStore.getState();
  if (!activeId || getLiveConversation(activeId).isStreaming || sendInFlight.has(activeId)) return;
  const queue = getQueue();
  const next = queue.find((item) => item.conversationId === activeId);
  if (!next) return;
  queueInterruptRequested.delete(activeId);
  setQueue(queue.filter((item) => item.id !== next.id));
  void sendFromComposer(next.text, next.attachments);
}

function scheduleQueueRelease(): void {
  if (queueCheckScheduled) return;
  const { activeId } = convoListStore.getState();
  if (!activeId || !getQueue().some((item) => item.conversationId === activeId)) return;
  queueCheckScheduled = true;
  // After the current commit, like the effect it replaces.
  setTimeout(releaseQueuedMessage, 0);
}

// ── Multica reconnect ───────────────────────────────────────────────────────

const reconnectInFlight = new Set<string>();
let lastReconnectKey = "";

function maybeReconnectMultica(): void {
  const { activeId, convos } = convoListStore.getState();
  const { stateLoaded, showNewChatCard } = uiStore.getState();
  const convo = activeId ? convos.find((c) => c.id === activeId) : undefined;
  const ctx = normalizeMulticaContext(convo?._multica);
  if (!stateLoaded || showNewChatCard || !activeId || !convo || !ctx) {
    lastReconnectKey = "";
    return;
  }
  const data = getLiveConversation(activeId);
  const connected = Boolean(data.multicaConnected);
  const hydrated =
    !isTranscriptPending(activeId) && (data.messages.length > 0 || convo.archivedMessages.length === 0);
  // Only re-evaluate when an input of the old effect changed (not on every stream flush).
  const key = [activeId, ctx.sessionId, ctx.serverUrl, ctx.workspaceId, ctx.workspaceSlug, ctx.agentId, data.isStreaming, connected, hydrated].join("|");
  if (key === lastReconnectKey) return;
  lastReconnectKey = key;
  if (data.isStreaming || connected || !hydrated || reconnectInFlight.has(activeId)) return;

  reconnectInFlight.add(activeId);
  reconnectMulticaConversation(activeId, ctx)
    .catch((err: unknown) => console.error("[multica] automatic reconnect failed:", err))
    .finally(() => reconnectInFlight.delete(activeId));
}

function onChange(): void {
  syncActiveArchive();
  scheduleQueueRelease();
  maybeReconnectMultica();
}

export function startActiveConversationEffects(): () => void {
  const unsubscribers = [
    liveConversationsStore.subscribe(onChange),
    convoListStore.subscribe(onChange),
    queueStore.subscribe(scheduleQueueRelease),
    uiStore.subscribe(maybeReconnectMultica),
    transcriptStatusStore.subscribe(maybeReconnectMultica),
  ];
  onChange();
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
