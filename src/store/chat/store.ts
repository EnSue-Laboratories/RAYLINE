import { createStore } from "../createStore";
import { createLogger } from "../../utils/logger";
import { StoreDraft } from "./draft";
import { type ConversationRuntime, type ConversationsState, EMPTY_CONVERSATION, type StreamEffect } from "./types";

export const conversationsStore = createStore<ConversationsState>({ byId: new Map() });

const log = createLogger("useAgent"); // debug scope name kept for existing `rayline:debug` settings

function runEffects(effects: readonly StreamEffect[]): void {
  for (const effect of effects) {
    switch (effect.kind) {
      case "multica-agent-status":
        window.dispatchEvent(new CustomEvent("multica-agent-status", { detail: effect.agent }));
        break;
      case "log":
        log(effect.message, effect.data);
        break;
      default: {
        const unhandled: never = effect;
        return unhandled;
      }
    }
  }
}

/**
 * Run `recipe` against ONE copy-on-write draft of the map and commit the
 * result (a no-op when nothing changed). Effects run after the commit.
 */
export function updateConversations(recipe: (draft: StoreDraft) => void): void {
  const base = conversationsStore.getState().byId;
  const draft = new StoreDraft(base);
  recipe(draft);
  const next = draft.commit();
  if (next !== base) conversationsStore.setState({ byId: next });
  if (draft.effects.length > 0) runEffects(draft.effects);
}

/** Non-reactive read for event handlers. Never subscribe through this. */
export function getConversation(id: string | null | undefined): ConversationRuntime {
  return (id ? conversationsStore.getState().byId.get(id) : undefined) ?? EMPTY_CONVERSATION;
}

/** Test hook: reset the store to an empty map. */
export function resetConversationsStoreForTests(byId: ReadonlyMap<string, ConversationRuntime> = new Map()): void {
  conversationsStore.setState({ byId });
}
