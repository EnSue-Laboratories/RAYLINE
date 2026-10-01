import type { ChatMessage, Conversation, ConversationData } from "@shared/chat/types";

export function convo(partial: Partial<Conversation> & { id: string }): Conversation {
  return {
    title: "Chat",
    model: "sonnet",
    ts: 1000,
    sessions: [],
    activeSessionId: null,
    providerSessions: {},
    sessionId: null,
    sessionProvider: null,
    archivedMessages: [],
    ...partial,
  };
}

export function user(id: string, text: string): ChatMessage {
  return { id, role: "user", text };
}

export function assistant(id: string, text: string, extra: Partial<Extract<ChatMessage, { role: "assistant" }>> = {}): ChatMessage {
  return { id, role: "assistant", parts: [{ type: "text", text }], ...extra };
}

export function live(messages: ChatMessage[], isStreaming = false): ConversationData {
  return { messages, isStreaming, error: null };
}

export const EMPTY_LIVE: ConversationData = { messages: [], isStreaming: false, error: null };
