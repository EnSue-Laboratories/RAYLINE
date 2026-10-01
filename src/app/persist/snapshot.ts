/**
 * Pure persistence planning: per-conversation snapshots (cached by row and
 * live-data identity) and the delta to send to `state:save`.
 *
 * Dirty tracking is by identity, never by deep comparison: a conversation's
 * transcript is dirty when its *source array* (live messages if any, else
 * `conversation.archivedMessages`) is not the one we last saved.
 */

import type { ChatMessage, Conversation, ConversationData, QueuedMessage } from "@shared/chat/types";
import {
  STATE_STORE_VERSION,
  type ConversationMeta,
  type PersistedAppIndex,
  type PersistedAppState,
  type StateSaveRequest,
} from "@shared/state/types";
import {
  getMessageTextPreview,
  isNonEmptyArchivedMessage,
  isPersistableLiveMessage,
  sanitizeArchivedMessage,
  serializeMessagesForState,
} from "../conversation/archive";
import { hasConversationMessages, normalizeConversationState } from "../conversation/sessions";

/** Conversation + live transcript → the object persisted for it. */
export function buildPersistedConversationSnapshot(conversation: Conversation, conversationData: ConversationData | null | undefined): Conversation {
  // `multicaConnected` is transient live state; never persist it.
  const { multicaConnected: _transient, ...conversationForPersist } = conversation as Conversation & { multicaConnected?: boolean };
  const normalized = normalizeConversationState(conversationForPersist);
  const liveMessages = Array.isArray(conversationData?.messages)
    ? conversationData.messages.filter(isPersistableLiveMessage)
    : [];
  if (liveMessages.length === 0) return normalized;

  const archivedMessages = serializeMessagesForState(liveMessages)
    .map(sanitizeArchivedMessage)
    .filter(isNonEmptyArchivedMessage);
  const preview = getMessageTextPreview(liveMessages[liveMessages.length - 1]).slice(0, 60);
  return normalizeConversationState({
    ...normalized,
    archivedMessages,
    ...(preview ? { lastPreview: preview } : {}),
  });
}

export interface SnapshotEntry {
  id: string;
  conversation: Conversation;
  data: ConversationData;
  hasLive: boolean;
  pending: boolean;
  snapshot: Conversation;
  /** Whether the conversation is persisted at all (has messages or an unloaded transcript). */
  keep: boolean;
  /** Identity of the transcript source; compared against the last saved one. */
  transcriptKey: readonly ChatMessage[];
}

export type SnapshotCache = Map<string, SnapshotEntry>;

export interface CollectInput {
  convos: readonly Conversation[];
  getLive: (id: string) => ConversationData;
  /** Transcript not loaded yet (v2 lazy load): keep the row, never write its transcript. */
  isTranscriptPending: (id: string) => boolean;
}

/**
 * Persistable snapshots in list order. Reuses cached entries when the row
 * and its live data are unchanged, so only actively-changing conversations
 * are rebuilt (normalization walks the whole transcript).
 */
export function collectPersistableConversations(input: CollectInput, cache: SnapshotCache): SnapshotEntry[] {
  const seen = new Set<string>();
  const out: SnapshotEntry[] = [];
  for (const conversation of input.convos) {
    const data = input.getLive(conversation.id);
    // Without live messages the snapshot depends only on the row.
    const hasLive = Array.isArray(data.messages) && data.messages.some(isPersistableLiveMessage);
    const pending = input.isTranscriptPending(conversation.id);
    seen.add(conversation.id);
    const cached = cache.get(conversation.id);
    let entry: SnapshotEntry;
    if (
      cached &&
      cached.conversation === conversation &&
      cached.hasLive === hasLive &&
      (!hasLive || cached.data === data) &&
      cached.pending === pending
    ) {
      entry = cached;
    } else {
      entry = {
        id: conversation.id,
        conversation,
        data,
        hasLive,
        pending,
        snapshot: buildPersistedConversationSnapshot(conversation, data),
        keep: pending || hasConversationMessages(conversation, data),
        transcriptKey: hasLive ? data.messages : conversation.archivedMessages,
      };
      cache.set(conversation.id, entry);
    }
    if (entry.keep) out.push(entry);
  }
  for (const id of [...cache.keys()]) {
    if (!seen.has(id)) cache.delete(id);
  }
  return out;
}

/** What was last written, used to compute the next delta. */
export interface SaveBaseline {
  indexJson: string | null;
  /** Conversation id → transcript source saved last. */
  savedKeys: Map<string, readonly ChatMessage[]>;
  /** Conversation ids that have a transcript file on disk. */
  savedIds: Set<string>;
}

export function createBaseline(): SaveBaseline {
  return { indexJson: null, savedKeys: new Map(), savedIds: new Set() };
}

export interface PlanInput {
  entries: readonly SnapshotEntry[];
  activeId: string | null;
  /** Settings slice of the index (everything except convos/active/queue). */
  settings: Omit<PersistedAppState, "convos" | "active" | "queuedMessages">;
  queuedMessages: QueuedMessage[];
  isTranscriptPending: (id: string) => boolean;
}

export interface SavePlan {
  index: PersistedAppIndex;
  indexJson: string;
  indexChanged: boolean;
  upserts: { id: string; key: readonly ChatMessage[]; archivedMessages: ChatMessage[] }[];
  deletes: string[];
}

function toMeta(snapshot: Conversation): ConversationMeta {
  const { archivedMessages: _transcript, ...meta } = snapshot;
  return meta;
}

export function resolvePersistedActive(entries: readonly SnapshotEntry[], activeId: string | null): string | null {
  return entries.some((e) => e.id === activeId) ? activeId : entries[0]?.id ?? null;
}

export function planStateSave(input: PlanInput, baseline: SaveBaseline): SavePlan {
  const index: PersistedAppIndex = {
    ...input.settings,
    version: STATE_STORE_VERSION,
    convos: input.entries.map((e) => toMeta(e.snapshot)),
    active: resolvePersistedActive(input.entries, input.activeId),
    queuedMessages: input.queuedMessages,
  };
  const indexJson = JSON.stringify(index);

  const upserts: SavePlan["upserts"] = [];
  const liveIds = new Set<string>();
  for (const entry of input.entries) {
    liveIds.add(entry.id);
    if (input.isTranscriptPending(entry.id)) continue;
    if (baseline.savedKeys.get(entry.id) === entry.transcriptKey) continue;
    upserts.push({ id: entry.id, key: entry.transcriptKey, archivedMessages: entry.snapshot.archivedMessages });
  }
  const deletes = [...baseline.savedIds].filter((id) => !liveIds.has(id));

  return { index, indexJson, indexChanged: indexJson !== baseline.indexJson, upserts, deletes };
}

export function isEmptyPlan(plan: SavePlan): boolean {
  return !plan.indexChanged && plan.upserts.length === 0 && plan.deletes.length === 0;
}

/** v2 request: index only when it changed, transcripts only for dirty conversations. */
export function toStateSaveRequest(plan: SavePlan): StateSaveRequest {
  const request: StateSaveRequest = {};
  if (plan.indexChanged) request.index = plan.index;
  if (plan.upserts.length > 0 || plan.deletes.length > 0) {
    request.transcripts = {
      upserts: plan.upserts.map(({ id, archivedMessages }) => ({ id, archivedMessages })),
      deletes: plan.deletes,
    };
  }
  return request;
}

/** Legacy `save-state` payload: the whole state with inline transcripts. */
export function toLegacyPayload(plan: SavePlan, entries: readonly SnapshotEntry[]): PersistedAppState {
  const { version: _version, convos: _meta, ...rest } = plan.index;
  return { ...rest, convos: entries.map((e) => e.snapshot) };
}

/** Record a sent plan as the new baseline (optimistic; see `revertBaseline`). */
export function commitBaseline(plan: SavePlan, baseline: SaveBaseline): void {
  baseline.indexJson = plan.indexJson;
  for (const upsert of plan.upserts) {
    baseline.savedKeys.set(upsert.id, upsert.key);
    baseline.savedIds.add(upsert.id);
  }
  for (const id of plan.deletes) {
    baseline.savedKeys.delete(id);
    baseline.savedIds.delete(id);
  }
}

/** A save failed: forget what it claimed to write so the next flush resends it. */
export function revertBaseline(plan: SavePlan, baseline: SaveBaseline): void {
  baseline.indexJson = null;
  for (const upsert of plan.upserts) baseline.savedKeys.delete(upsert.id);
  for (const id of plan.deletes) baseline.savedIds.add(id);
}
