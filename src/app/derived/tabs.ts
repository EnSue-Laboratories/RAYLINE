/** Pinned conversation tabs (TabStrip), memoized by a content signature. */

import type { Conversation, ConversationData } from "@shared/chat/types";
import { computeTabState, type TabState } from "../../utils/tabs";

export interface TabDescriptor {
  id: string;
  title: string;
  state: TabState;
}

export function buildPinnedTabs(
  convos: readonly Conversation[],
  getLive: (id: string) => ConversationData,
): TabDescriptor[] {
  return convos
    .filter((c) => c.tab?.pinned)
    .sort((a, b) => {
      const aPinnedAt = Number(a.tab?.pinnedAt) || 0;
      const bPinnedAt = Number(b.tab?.pinnedAt) || 0;
      if (aPinnedAt !== bPinnedAt) return aPinnedAt - bPinnedAt;
      return (a.ts || 0) - (b.ts || 0);
    })
    .map((c) => ({
      id: c.id,
      title: c.title || "Untitled",
      state: computeTabState(c, { isStreaming: Boolean(getLive(c.id).isStreaming) }),
    }));
}

export function tabsSignature(tabs: readonly TabDescriptor[]): string {
  return tabs.map((t) => `${t.id}\u0000${t.title}\u0000${t.state}`).join("\u0001");
}

/** Neighbour to activate when the tab `id` closes (previous, else next). */
export function neighbourTabId(tabs: readonly TabDescriptor[], id: string): string | null {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return null;
  return tabs[index - 1]?.id ?? tabs[index + 1]?.id ?? null;
}
