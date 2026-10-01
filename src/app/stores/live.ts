/**
 * Bridge between `useAgent()` (React state inside <AgentProvider>) and the
 * rest of the shell. The provider publishes the conversations map here after
 * every commit so non-React code (derived sidebar rows, tab state,
 * persistence, side-effect subscriptions) can react without App
 * re-rendering, and handlers can read live data without closures.
 *
 * Follow-up: replace with chat-core's conversations store selectors.
 */

import { createContext } from "react";
import type { ChatMessage, ConversationData } from "@shared/chat/types";
import { createStore } from "../../store/createStore";
import type { AgentApi } from "../types";

export type LiveConversations = ReadonlyMap<string, ConversationData>;

const EMPTY_MESSAGES: ChatMessage[] = [];

/** Shared empty value for conversations without live data (stable identity). */
export const EMPTY_CONVERSATION_DATA: ConversationData = { messages: EMPTY_MESSAGES, isStreaming: false, error: null };

export const liveConversationsStore = createStore<LiveConversations>(new Map());

/** Same map as the store, but propagated in the agent's own (transition) render. */
export const LiveConversationsContext = createContext<LiveConversations>(new Map());

let agentApi: AgentApi | null = null;

export function publishAgentApi(api: AgentApi): void {
  agentApi = api;
}

export function getAgentApi(): AgentApi {
  if (!agentApi) throw new Error("useAgent() is not mounted (AgentProvider missing)");
  return agentApi;
}

export function getLiveConversation(id: string | null | undefined): ConversationData {
  if (!id) return EMPTY_CONVERSATION_DATA;
  return liveConversationsStore.getState().get(id) ?? EMPTY_CONVERSATION_DATA;
}

export function selectLiveConversation(map: LiveConversations, id: string | null | undefined): ConversationData {
  if (!id) return EMPTY_CONVERSATION_DATA;
  return map.get(id) ?? EMPTY_CONVERSATION_DATA;
}
