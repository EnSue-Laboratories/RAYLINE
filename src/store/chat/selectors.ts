/**
 * Narrow React subscriptions to the conversations store. Each hook only
 * re-renders its component when its slice changes:
 *
 * - `useMessageIds(cid)`  — when messages are added / removed / reordered
 * - `useMessage(cid, mid)` — when THAT message object changes (copy-on-write
 *   flushes leave every other message's identity alone)
 * - `useConversationStatus(cid)` — `{ isStreaming, error }`, shallow-compared
 * - `useStreamingIds()` — ids of streaming conversations, shallow-compared
 */
import { useCallback } from "react";
import type { ChatMessage } from "@shared/chat/types";
import { shallowEqual, useStore } from "../createStore";
import { conversationsStore } from "./store";
import { type ConversationRuntime, type ConversationsState, EMPTY_CONVERSATION } from "./types";

const EMPTY_IDS: readonly string[] = [];

// Derived data cached per immutable messages array (shared by all subscribers).
const idsCache = new WeakMap<readonly ChatMessage[], readonly string[]>();
const indexCache = new WeakMap<readonly ChatMessage[], ReadonlyMap<string, ChatMessage>>();

export function selectMessageIds(messages: readonly ChatMessage[]): readonly string[] {
  let ids = idsCache.get(messages);
  if (!ids) {
    ids = messages.map((message) => message.id);
    idsCache.set(messages, ids);
  }
  return ids;
}

export function selectMessage(messages: readonly ChatMessage[], messageId: string): ChatMessage | undefined {
  let index = indexCache.get(messages);
  if (!index) {
    const map = new Map<string, ChatMessage>();
    for (const message of messages) map.set(message.id, message);
    index = map;
    indexCache.set(messages, index);
  }
  return index.get(messageId);
}

function conversationOf(state: ConversationsState, conversationId: string | null | undefined): ConversationRuntime {
  return (conversationId ? state.byId.get(conversationId) : undefined) ?? EMPTY_CONVERSATION;
}

/** The whole conversation entry. Re-renders on every change to it — prefer the narrower hooks. */
export function useConversation(conversationId: string | null | undefined): ConversationRuntime {
  const selector = useCallback((state: ConversationsState) => conversationOf(state, conversationId), [conversationId]);
  return useStore(conversationsStore, selector);
}

export function useMessageIds(conversationId: string | null | undefined): readonly string[] {
  const selector = useCallback(
    (state: ConversationsState) => (conversationId ? selectMessageIds(conversationOf(state, conversationId).messages) : EMPTY_IDS),
    [conversationId],
  );
  return useStore(conversationsStore, selector, shallowEqual);
}

export function useMessage(conversationId: string | null | undefined, messageId: string): ChatMessage | undefined {
  const selector = useCallback(
    (state: ConversationsState) => selectMessage(conversationOf(state, conversationId).messages, messageId),
    [conversationId, messageId],
  );
  return useStore(conversationsStore, selector);
}

export interface ConversationStatus {
  isStreaming: boolean;
  error: string | null;
}

export function useConversationStatus(conversationId: string | null | undefined): ConversationStatus {
  const selector = useCallback((state: ConversationsState): ConversationStatus => {
    const convo = conversationOf(state, conversationId);
    return { isStreaming: Boolean(convo.isStreaming), error: convo.error ?? null };
  }, [conversationId]);
  return useStore(conversationsStore, selector, shallowEqual);
}

function selectStreamingIds(state: ConversationsState): readonly string[] {
  const ids: string[] = [];
  for (const [id, convo] of state.byId) if (convo.isStreaming) ids.push(id);
  return ids;
}

export function useStreamingIds(): readonly string[] {
  return useStore(conversationsStore, selectStreamingIds, shallowEqual);
}

