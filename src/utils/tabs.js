
// Shape of conversation.tab:
//   { pinned: boolean, pinnedAt: number, lastSeenAt: number, runEndedAt: number|null }

export function getTabMeta(conversation) {
  const t = conversation?.tab;
  return {
    pinned: Boolean(t?.pinned),
    pinnedAt: Number(t?.pinnedAt) || 0,
    lastSeenAt: Number(t?.lastSeenAt) || 0,
    runEndedAt: t?.runEndedAt == null ? null : Number(t.runEndedAt),
  };
}

export function computeTabState(conversation, { isStreaming }) {
  const { runEndedAt, lastSeenAt } = getTabMeta(conversation);
  if (isStreaming) return "streaming";
  if (runEndedAt != null && runEndedAt > lastSeenAt) return "done";
  return "seen";
}

export function withTabPatch(conversation, patch) {
  const prev = conversation?.tab || {};
  return { ...conversation, tab: { ...prev, ...patch } };
}

export function countPinnedTabs(conversations = []) {
  return conversations.reduce(
    (count, conversation) => count + (conversation?.tab?.pinned ? 1 : 0),
    0
  );
}

export function pinTabPatch(now = Date.now()) {
  return { pinned: true, pinnedAt: now, runEndedAt: null };
}

export function runEndedPatch(now = Date.now()) {
  return { runEndedAt: now };
}

export function markSeenPatch(now = Date.now()) {
  return { lastSeenAt: now, runEndedAt: null };
}

export function unpinTabPatch() {
  return { pinned: false, runEndedAt: null };
}

export function clearPinnedTabs(conversations = []) {
  let changed = false;
  const next = conversations.map((conversation) => {
    if (!conversation?.tab?.pinned) return conversation;
    changed = true;
    return withTabPatch(conversation, unpinTabPatch());
  });
  return changed ? next : conversations;
}

export function resetPinnedTabs(conversations = [], minimum = 2) {
  const pinnedCount = countPinnedTabs(conversations);
  if (pinnedCount === 0 || pinnedCount >= minimum) return conversations;
  return clearPinnedTabs(conversations);
}
