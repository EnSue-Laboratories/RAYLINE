/* eslint-disable no-unused-vars */
// Shape of conversation.tab:
//   { pinned: boolean, lastSeenAt: number, runEndedAt: number|null }

export function getTabMeta(conversation) {
  const t = conversation?.tab;
  return {
    pinned: Boolean(t?.pinned),
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

export function pinTabPatch(now = Date.now()) {
  return { pinned: true, runEndedAt: null };
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
