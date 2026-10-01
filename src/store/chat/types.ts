import type { MulticaAgent } from "@shared/providers/types";
import type { ConversationData } from "@shared/chat/types";

/** Live per-conversation state held by the conversations store. */
export type ConversationRuntime = ConversationData;

export interface ConversationsState {
  readonly byId: ReadonlyMap<string, ConversationRuntime>;
}

/**
 * Side effects requested by the (pure) stream reducer. The agent bridge runs
 * them after the flush commits so the reducer itself never touches the DOM.
 */
export type StreamEffect =
  | { kind: "multica-agent-status"; agent: MulticaAgent | undefined }
  | { kind: "log"; message: string; data: Record<string, unknown> };

export const EMPTY_CONVERSATION: ConversationRuntime = { messages: [], isStreaming: false, error: null };
