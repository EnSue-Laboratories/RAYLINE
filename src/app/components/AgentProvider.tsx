import { useLayoutEffect, type ReactNode } from "react";
import { useAgent } from "../boundaries";
import { LiveConversationsContext, liveConversationsStore, publishAgentApi } from "../stores/live";

/**
 * Owns `useAgent()`. Its state updates (coalesced stream flushes, in a
 * transition) re-render only this provider and the context consumers; the
 * `children` element is created by App and bails out. After each commit the
 * conversations map is published to `liveConversationsStore` for derived
 * stores, persistence and handlers.
 */
export function AgentProvider({ children }: { children: ReactNode }) {
  const agent = useAgent();
  const { conversations } = agent;

  useLayoutEffect(() => {
    publishAgentApi(agent);
  });

  useLayoutEffect(() => {
    liveConversationsStore.setState(conversations);
  }, [conversations]);

  return <LiveConversationsContext.Provider value={conversations}>{children}</LiveConversationsContext.Provider>;
}
