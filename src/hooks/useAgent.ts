/**
 * Compatibility hook over the conversations store (src/store/conversations).
 *
 * Returns the same shape App has always destructured, but every function is
 * a module-level action with a permanent identity, and `getConversation`
 * reads the store directly (not a render closure). `conversations` is the
 * whole map, mirrored into React state: urgent commits update it
 * synchronously, coalesced stream flushes inside `startTransition` (the
 * pre-store priority behaviour).
 *
 * New code should not use this hook. Subscribe narrowly instead:
 *   useMessageIds(cid) / useMessage(cid, mid) / useConversationStatus(cid) /
 *   useStreamingIds()  — and call actions / getConversation from handlers.
 */
import { startTransition, useEffect, useMemo, useState } from "react";
import {
  appendLocalMessages,
  cancelMessage,
  connectAgentEvents,
  type ConversationRuntime,
  conversationsStore,
  editAndResend,
  getConversation,
  getLastCommitPriority,
  loadMessages,
  markMulticaConnected,
  prepareMessage,
  replaceMessages,
  startPreparedMessage,
} from "../store/conversations";

const ACTIONS = {
  getConversation,
  prepareMessage,
  appendLocalMessages,
  startPreparedMessage,
  cancelMessage,
  editAndResend,
  loadMessages,
  replaceMessages,
  markMulticaConnected,
} as const;

export type AgentActions = typeof ACTIONS;

export interface UseAgentResult extends AgentActions {
  /** Whole map (legacy). Changes identity on every commit. */
  conversations: ReadonlyMap<string, ConversationRuntime>;
}

function useConversationsMirror(): ReadonlyMap<string, ConversationRuntime> {
  const [byId, setById] = useState(() => conversationsStore.getState().byId);
  useEffect(() => {
    const sync = (): void => {
      const next = conversationsStore.getState().byId;
      if (getLastCommitPriority() === "transition") startTransition(() => setById(next));
      else setById(next);
    };
    const unsubscribe = conversationsStore.subscribe(sync);
    // Catch up with commits between the first render and this subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync with the external store
    setById(conversationsStore.getState().byId);
    return unsubscribe;
  }, []);
  return byId;
}

export default function useAgent(): UseAgentResult {
  useEffect(() => connectAgentEvents(), []);
  const conversations = useConversationsMirror();
  return useMemo(() => ({ conversations, ...ACTIONS }), [conversations]);
}
