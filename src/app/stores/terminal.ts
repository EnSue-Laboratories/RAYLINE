/** Terminal surface state published by <TerminalBridge> (which owns `useTerminal`). */

import { createStore, useStore } from "../../store/createStore";
import type { TerminalApi } from "../types";

export interface TerminalSnapshot {
  api: TerminalApi | null;
  sessionCount: number;
  windowOpen: boolean;
}

export const terminalStore = createStore<TerminalSnapshot>({ api: null, sessionCount: 0, windowOpen: false });

export function publishTerminal(api: TerminalApi): void {
  terminalStore.setState((prev) => {
    const sessionCount = api.sessions.length;
    const windowOpen = api.windowOpen;
    if (prev.api === api && prev.sessionCount === sessionCount && prev.windowOpen === windowOpen) return prev;
    return { api, sessionCount, windowOpen };
  });
}

export function getTerminalApi(): TerminalApi | null {
  return terminalStore.getState().api;
}

export function useTerminalSessionCount(): number {
  return useStore(terminalStore, (s) => s.sessionCount);
}

export function useTerminalWindowOpen(): boolean {
  return useStore(terminalStore, (s) => s.windowOpen);
}
