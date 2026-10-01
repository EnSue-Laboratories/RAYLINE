import { useEffect, type ReactNode } from "react";
import { connectAgentEvents } from "../../store/conversations";

/**
 * Connects `agent-stream` / `agent-done` / `agent-error` to the conversations
 * store for the lifetime of the app (ref-counted; StrictMode safe). Live chat
 * state lives in src/store/conversations: components subscribe with its
 * selectors and handlers call its actions, so nothing re-renders from here.
 */
export function AgentProvider({ children }: { children: ReactNode }) {
  useEffect(() => connectAgentEvents(), []);
  return children;
}
