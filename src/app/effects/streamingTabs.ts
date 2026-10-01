/**
 * Auto-pinning streaming conversations as tabs, run-ended marks and the
 * completion chime. The first tab strip only appears for a concurrent
 * streaming burst; once it exists, any newly streaming session joins it. If
 * the user collapses the pinned set below two tabs, it stays dismissed until
 * concurrency drops and a new burst starts.
 */

import type { Conversation, ConversationData } from "@shared/chat/types";
import { getAppSettings } from "../../store/appSettings";
import { convoListStore, setConvos } from "../../store/convoList";
import { playChime } from "../../utils/chime";
import { countPinnedTabs, pinTabPatch, runEndedPatch, withTabPatch } from "../../utils/tabs";
import { conversationsStore, getConversation } from "../../store/conversations";

export type TabRoundState = "idle" | "active" | "dismissed";

export interface StreamingTransition {
  /** Streaming state per conversation (next `prev`). */
  next: Map<string, boolean>;
  streamingIds: string[];
  endedIds: string[];
  round: TabRoundState;
  /** Ids to pin, or null. */
  pinIds: Set<string> | null;
}

/** Pure core: compare streaming states and decide pins / run-ended marks. */
export function computeStreamingTransition(
  convos: readonly Conversation[],
  getLive: (id: string) => ConversationData,
  prev: ReadonlyMap<string, boolean>,
  round: TabRoundState,
): StreamingTransition {
  const next = new Map<string, boolean>();
  const streamingIds: string[] = [];
  const endedIds: string[] = [];
  for (const convo of convos) {
    const streaming = Boolean(getLive(convo.id).isStreaming);
    next.set(convo.id, streaming);
    if (streaming) streamingIds.push(convo.id);
    if (prev.get(convo.id) && !streaming) endedIds.push(convo.id);
  }

  const hasConcurrentStreaming = streamingIds.length > 1;
  const hasVisibleTabs = countPinnedTabs(convos) >= 2;
  let nextRound: TabRoundState = hasConcurrentStreaming ? round : "idle";
  if (!hasVisibleTabs && hasConcurrentStreaming && nextRound === "idle") nextRound = "active";
  const shouldPin = streamingIds.length > 0 && (hasVisibleTabs || (hasConcurrentStreaming && nextRound !== "dismissed"));
  return { next, streamingIds, endedIds, round: nextRound, pinIds: shouldPin ? new Set(streamingIds) : null };
}

export function applyStreamingTransition(convos: Conversation[], pinIds: Set<string> | null, endedIds: readonly string[]): Conversation[] {
  if (!pinIds && endedIds.length === 0) return convos;
  const ended = new Set(endedIds);
  let changed = false;
  const next = convos.map((conversation) => {
    let updated = conversation;
    if (pinIds?.has(conversation.id) && !conversation.tab?.pinned) {
      updated = withTabPatch(updated, pinTabPatch());
      changed = true;
    }
    if (ended.has(conversation.id)) {
      updated = withTabPatch(updated, runEndedPatch());
      changed = true;
    }
    return updated;
  });
  return changed ? next : convos;
}

let prevStreaming: ReadonlyMap<string, boolean> = new Map();
let round: TabRoundState = "idle";

/** The user closed tabs below the strip minimum: don't re-pin until the burst ends. */
export function dismissTabRound(): void {
  round = "dismissed";
}

function run(): void {
  const transition = computeStreamingTransition(convoListStore.getState().convos, getConversation, prevStreaming, round);
  // Update bookkeeping first: setConvos below re-enters this listener.
  prevStreaming = transition.next;
  round = transition.round;
  if (transition.pinIds || transition.endedIds.length > 0) {
    setConvos((prev) => applyStreamingTransition(prev, transition.pinIds, transition.endedIds));
  }
  const { notificationsMuted, notificationSound } = getAppSettings();
  if (transition.endedIds.length > 0 && !notificationsMuted) {
    transition.endedIds.forEach((_, index) => {
      window.setTimeout(() => playChime(notificationSound), index * 140);
    });
  }
}

export function startStreamingTabs(): () => void {
  const unsubscribers = [conversationsStore.subscribe(run), convoListStore.subscribe(run)];
  run();
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
