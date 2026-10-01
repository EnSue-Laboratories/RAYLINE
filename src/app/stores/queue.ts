/** Messages queued while their conversation is streaming (persisted). */

import type { Attachment, QueuedMessage } from "@shared/chat/types";
import { createStore, useStore } from "../../store/createStore";
import { normalizeQueuedMessage } from "../conversation/queue";

export const queueStore = createStore<QueuedMessage[]>([]);

/** Conversations whose run we already asked to stop so the queue can proceed. */
export const queueInterruptRequested = new Set<string>();
/** Guards the async preflight gap before useAgent flips `isStreaming`. */
export const sendInFlight = new Set<string>();

export function getQueue(): QueuedMessage[] {
  return queueStore.getState();
}

export function setQueue(next: QueuedMessage[]): void {
  queueStore.setState(next);
}

export function enqueueMessage(input: { conversationId: string; text: string; attachments?: Attachment[] }): QueuedMessage | null {
  const entry = normalizeQueuedMessage(input);
  if (!entry) return null;
  setQueue([...getQueue(), entry]);
  return entry;
}

export function removeQueuedMessage(queueId: string): void {
  if (!queueId) return;
  const queue = getQueue();
  const removed = queue.find((item) => item.id === queueId);
  const next = queue.filter((item) => item.id !== queueId);
  if (removed && !next.some((item) => item.conversationId === removed.conversationId)) {
    queueInterruptRequested.delete(removed.conversationId);
  }
  setQueue(next);
}

export function updateQueuedMessage(queueId: string, nextText: string): void {
  if (!queueId) return;
  const trimmed = typeof nextText === "string" ? nextText.trim() : "";
  if (!trimmed) {
    removeQueuedMessage(queueId);
    return;
  }
  setQueue(getQueue().map((item) => (item.id === queueId ? { ...item, text: trimmed } : item)));
}

const EMPTY_QUEUE: QueuedMessage[] = [];

function sameItems(a: QueuedMessage[], b: QueuedMessage[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

export function useQueuedMessagesFor(conversationId: string | null): QueuedMessage[] {
  return useStore(
    queueStore,
    (queue) => {
      if (!conversationId) return EMPTY_QUEUE;
      const items = queue.filter((item) => item.conversationId === conversationId);
      return items.length === 0 ? EMPTY_QUEUE : items;
    },
    sameItems,
  );
}
