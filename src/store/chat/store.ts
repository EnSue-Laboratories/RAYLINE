import { createStore } from "../createStore";
import { createLogger } from "../../utils/logger";
import { StoreDraft } from "./draft";
import { type ConversationRuntime, type ConversationsState, EMPTY_CONVERSATION, type StreamEffect } from "./types";

/**
 * How the latest commit should reach legacy whole-map consumers (`useAgent`'s
 * `conversations`): coalesced mid-stream flushes are `transition`, everything
 * else (user actions, terminal events) is `urgent`. Fine-grained selector
 * subscribers always update synchronously.
 */
export type CommitPriority = "urgent" | "transition";

export const conversationsStore = createStore<ConversationsState>({ byId: new Map() });

let lastCommitPriority: CommitPriority = "urgent";

export function getLastCommitPriority(): CommitPriority {
  return lastCommitPriority;
}

const log = createLogger("useAgent");

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
export function updateConversations(recipe: (draft: StoreDraft) => void, priority: CommitPriority = "urgent"): void {
  const base = conversationsStore.getState().byId;
  const draft = new StoreDraft(base);
  recipe(draft);
  const next = draft.commit();
  if (next !== base) {
    lastCommitPriority = priority;
    conversationsStore.setState({ byId: next });
    lastCommitPriority = "urgent";
  }
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
