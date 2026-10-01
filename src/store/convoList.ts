/**
 * Conversation metadata rows (the sidebar list) and the active conversation
 * id. Transcripts that are still being streamed live in the agent store;
 * `archivedMessages` here is the persisted copy.
 */

import type { Conversation } from "@shared/chat/types";
import { createStore, useStore } from "./createStore";

export interface ConvoListState {
  convos: Conversation[];
  activeId: string | null;
}

export const convoListStore = createStore<ConvoListState>({ convos: [], activeId: null });

export function getConvos(): Conversation[] {
  return convoListStore.getState().convos;
}

export function getActiveId(): string | null {
  return convoListStore.getState().activeId;
}

export function findConvo(id: string | null | undefined): Conversation | undefined {
  if (!id) return undefined;
  return convoListStore.getState().convos.find((c) => c.id === id);
}

export function getActiveConvo(): Conversation | null {
  const { convos, activeId } = convoListStore.getState();
  return activeId ? convos.find((c) => c.id === activeId) ?? null : null;
}

/** Replace the list; the updater may return `prev` to signal "no change". */
export function setConvos(updater: (prev: Conversation[]) => Conversation[]): void {
  convoListStore.setState((state) => {
    const convos = updater(state.convos);
    return convos === state.convos ? state : { ...state, convos };
  });
}

/** Map one conversation by id. Unchanged when `fn` returns its input. */
export function updateConvo(id: string, fn: (convo: Conversation) => Conversation): void {
  setConvos((prev) => {
    let changed = false;
    const next = prev.map((c) => {
      if (c.id !== id) return c;
      const updated = fn(c);
      if (updated !== c) changed = true;
      return updated;
    });
    return changed ? next : prev;
  });
}

export function prependConvo(convo: Conversation): void {
  setConvos((prev) => [convo, ...prev]);
}

export function setActiveId(activeId: string | null): void {
  convoListStore.setState((state) => (state.activeId === activeId ? state : { ...state, activeId }));
}

export function useActiveId(): string | null {
  return useStore(convoListStore, selectActiveId);
}

export function useConvos(): Conversation[] {
  return useStore(convoListStore, selectConvos);
}

/** The active conversation row; identity only changes when that row changes. */
export function useActiveConvo(): Conversation | null {
  return useStore(convoListStore, selectActiveConvo);
}

function selectActiveId(state: ConvoListState): string | null {
  return state.activeId;
}

function selectConvos(state: ConvoListState): Conversation[] {
  return state.convos;
}

function selectActiveConvo(state: ConvoListState): Conversation | null {
  return state.activeId ? state.convos.find((c) => c.id === state.activeId) ?? null : null;
}
