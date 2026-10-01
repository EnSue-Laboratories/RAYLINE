import type { ConversationTabMeta } from "@shared/chat/types";

/** Anything carrying an optional `tab` (a Conversation or a sidebar row). */
export interface TabbedConversation {
  tab?: ConversationTabMeta;
}

export interface NormalizedTabMeta {
  pinned: boolean;
  pinnedAt: number;
  lastSeenAt: number;
  runEndedAt: number | null;
}

export type TabState = "streaming" | "done" | "seen";

export function getTabMeta(conversation: TabbedConversation | null | undefined): NormalizedTabMeta {
  const t = conversation?.tab;
  return {
    pinned: Boolean(t?.pinned),
    pinnedAt: Number(t?.pinnedAt) || 0,
    lastSeenAt: Number(t?.lastSeenAt) || 0,
    runEndedAt: t?.runEndedAt == null ? null : Number(t.runEndedAt),
  };
}

export function computeTabState(
  conversation: TabbedConversation | null | undefined,
  { isStreaming }: { isStreaming: boolean },
): TabState {
  const { runEndedAt, lastSeenAt } = getTabMeta(conversation);
  if (isStreaming) return "streaming";
  if (runEndedAt != null && runEndedAt > lastSeenAt) return "done";
  return "seen";
}

export function withTabPatch<T extends TabbedConversation>(conversation: T, patch: ConversationTabMeta): T {
  const prev = conversation.tab ?? {};
  return { ...conversation, tab: { ...prev, ...patch } };
}

export function countPinnedTabs(conversations: readonly TabbedConversation[] = []): number {
  return conversations.reduce(
    (count, conversation) => count + (conversation.tab?.pinned ? 1 : 0),
    0,
  );
}

export function pinTabPatch(now: number = Date.now()): ConversationTabMeta {
  return { pinned: true, pinnedAt: now, runEndedAt: null };
}

export function runEndedPatch(now: number = Date.now()): ConversationTabMeta {
  return { runEndedAt: now };
}

export function markSeenPatch(now: number = Date.now()): ConversationTabMeta {
  return { lastSeenAt: now, runEndedAt: null };
}

export function unpinTabPatch(): ConversationTabMeta {
  return { pinned: false, runEndedAt: null };
}

/** Unpins every pinned conversation; returns the input array when nothing was pinned. */
export function clearPinnedTabs<T extends TabbedConversation>(conversations: T[] = []): T[] {
  let changed = false;
  const next = conversations.map((conversation) => {
    if (!conversation.tab?.pinned) return conversation;
    changed = true;
    return withTabPatch(conversation, unpinTabPatch());
  });
  return changed ? next : conversations;
}

/** A tab strip needs at least `minimum` tabs; below that, unpin everything. */
export function resetPinnedTabs<T extends TabbedConversation>(conversations: T[] = [], minimum = 2): T[] {
  const pinnedCount = countPinnedTabs(conversations);
  if (pinnedCount === 0 || pinnedCount >= minimum) return conversations;
  return clearPinnedTabs(conversations);
}
