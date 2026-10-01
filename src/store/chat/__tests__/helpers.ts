import type { AgentStreamEvent } from "@shared/agent/events";
import type { AssistantMessage, ChatMessage, MessagePart } from "@shared/chat/types";
import { applyStreamEvent } from "../applyStreamEvent";
import { type ConversationDraft, StoreDraft } from "../draft";
import type { ConversationRuntime } from "../types";

export function convo(messages: ChatMessage[], extra: Partial<ConversationRuntime> = {}): ConversationRuntime {
  return { messages, isStreaming: true, error: null, ...extra };
}

export function assistant(parts: MessagePart[] = [], extra: Partial<AssistantMessage> = {}): AssistantMessage {
  return { id: "a1", role: "assistant", parts, isStreaming: true, isThinking: false, _startedAt: 1000, _usage: null, ...extra };
}

/** Apply `events` to `base` in one draft (one flush) and return the committed entry. */
export function run(base: ConversationRuntime | undefined, ...events: AgentStreamEvent[]): { result: ConversationRuntime | undefined; draft: ConversationDraft } {
  const map = new Map<string, ConversationRuntime>();
  if (base) map.set("c1", base);
  const store = new StoreDraft(map);
  const draft = store.conversation("c1");
  for (const event of events) applyStreamEvent(draft, event);
  return { result: store.commit().get("c1"), draft };
}

export function lastAssistant(result: ConversationRuntime | undefined): AssistantMessage {
  const message = result?.messages.at(-1);
  if (message?.role !== "assistant") throw new Error("expected a trailing assistant message");
  return message;
}

export function parts(result: ConversationRuntime | undefined): MessagePart[] {
  return lastAssistant(result).parts ?? [];
}

/** Claude raw stream event wrapped in a `stream_event` envelope. */
export function se(event: Extract<AgentStreamEvent, { type: "stream_event" }>["event"]): AgentStreamEvent {
  return { type: "stream_event", event };
}
