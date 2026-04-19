# Session Tab Bar — Design

**Date:** 2026-04-19
**Status:** Design approved, ready for implementation plan
**Branch:** `feat/tabbar`

---

## Problem

Runs can last minutes. Users want to switch to another conversation while a run streams in the background, but today there's no surface that shows "work in flight elsewhere." The only way to know a background run finished is to navigate back to that conversation and look. The chat header has horizontal space going unused.

## Goal

Surface conversations that have active (streaming) or recently-finished runs as pinned "tabs" in the chat header, so the user can:

1. **See at a glance** which conversations have work running or freshly done.
2. **Switch between them** in one click.
3. **Hear when a background run completes**, without needing to look.

The tab bar is a *signal of parallel work*, not a replacement for sidebar navigation.

---

## Behavior

### Tab lifecycle

| Event | Result |
| --- | --- |
| Conversation starts streaming | Tab auto-appears. State = `streaming`. |
| Stream ends | State → `done`. Audio chime fires (if background + not muted). Dot turns solid. |
| User views the tab | State → `seen`. Dot clears. Tab stays. |
| User clicks close `×` | Tab removed from bar. Run (if streaming) **keeps going** — close is unpin only. |
| User sends another message on a convo that already has a tab | Same tab; state → `streaming`. |

A tab is a view onto a conversation, not a process. It never kills a run.

### When the tab bar appears

- **≥1 tab:** Tab strip renders on the left side of the existing header row. Right-side chips (`GitStatusPill`, `BranchSelector`, `ModelPicker`, terminal button) stay exactly where they are.
- **0 tabs:** Header falls back to today's layout — the `title · N MESSAGES` block on the left, chips on the right. UI is unchanged when nothing is running.

This means: users who don't do parallel work never see a tab bar.

### Current conversation

- If the current conversation has a tab, that tab is highlighted as active. The `title · N MESSAGES` block is *hidden* (tab already shows the title).
- If the current conversation does **not** have a tab (e.g. user opened an old convo without sending), the title block renders inline alongside any existing background tabs. No tab is highlighted.

### State visual

| State | Dot | Title |
| --- | --- | --- |
| `streaming` | animated pulse, cyan (matches existing loading color) | normal weight |
| `done` (unread) | solid, amber | normal weight |
| `seen` | none | normal weight |
| `active` (any state) | as above | brighter (`rgba(255,255,255,0.92)`), subtle pill fill |

### Audio chime

- Fires exactly once when a *background* run ends (i.e. the convo whose stream just ended is **not** the currently-viewed one).
- Plays at ~60% volume via Web Audio API.
- Library: **Glass** (default), Tink, Pop, Ping, Purr, Blow, Bottle, plus **Mute**.
- Setting lives under a new **Notifications** section in `Settings.jsx`.
- Sound files ship bundled (copy `.aiff` → `.wav`/`.mp3` into `public/sounds/`, since renderer can't directly load `/System/Library/Sounds/`).

---

## Visual design

### Style: floating pill (Style 2)

Tabs are rounded pills from the same family as `GitStatusPill` and `ModelPicker`. This keeps the whole header row reading as one coherent strip rather than "browser tabs bolted onto a minimal app."

```
┌──────────────────────────────────────────────────────────────────────┐
│ [•] fix sidebar scroll  × | [•] worktree promote  × |                │
│                                                    [git][main][sonnet][▭] │
└──────────────────────────────────────────────────────────────────────┘
```

### Pill anatomy

- **Shape:** 8px radius, height 26px (aligns with existing chips).
- **Padding:** 10px left, 8px right, 6px gap between elements.
- **Border:** `1px solid rgba(255,255,255,0.08)` (inactive) / `rgba(255,255,255,0.14)` (active).
- **Fill:** transparent (inactive) / `rgba(255,255,255,0.06)` (active).
- **Dot:** 6px circle on the left; animated scale-breathe when `streaming`.
- **Title:** `system-ui` 12px, truncate with ellipsis at ~160px max width. Full title on `title` attribute.
- **Close `×`:** 14px icon, shows on hover (always visible on active tab). `rgba(255,255,255,0.4)` → `.75` on hover.

### Layout on the header row

```jsx
// Current structure (ChatArea.jsx ~274):
<div style={{ display:"flex", justifyContent:"space-between" }}>
  <div> {/* left: title block */} </div>
  <div> {/* right: chips */} </div>
</div>

// New structure:
<div style={{ display:"flex", justifyContent:"space-between", gap: 12 }}>
  <div style={{ display:"flex", alignItems:"center", gap: 6, minWidth: 0, flex: 1 }}>
    {tabs.length > 0 ? (
      <TabStrip tabs={tabs} activeId={active} onSelect={...} onClose={...} />
    ) : null}
    {!currentHasTab && <TitleBlock title={convo.title} count={convo.msgs.length} />}
  </div>
  <div> {/* right: chips — unchanged */} </div>
</div>
```

### Overflow behavior

- Tab strip has `overflow-x: auto`, `scrollbar-width: none`, `flex: 1`, `min-width: 0`.
- Individual tabs don't shrink below their natural size — we scroll horizontally instead of squishing.
- Active tab auto-scrolls into view when its convo is selected (via `scrollIntoView({ inline: "center" })`).
- No hard cap on tab count (but if performance demands, sort: active first, then streaming, then done).

### Animations

- **Tab appear:** opacity 0→1, width grow from 0 in 180ms `cubic-bezier(.16,1,.3,1)` (reuse existing easing from the sidebar).
- **Tab close:** reverse — width collapse, then removed.
- **State dot pulse (streaming):** `scale(0.8) → scale(1.1)` loop, 1.4s.
- **Done → seen:** dot fades out over 250ms when the tab is viewed.

---

## Data model

### Tab identity

A tab is identified by its `conversationId` — no separate tab entity. The app already tracks `isStreaming` per conversation; we add one flag.

### New conversation fields

```js
{
  // existing: id, title, msgs, cwd, model, isStreaming, ...
  tab: {
    pinned: boolean,      // true once the convo has ever started streaming this session
    lastSeenAt: number,   // timestamp the user last viewed this tab; drives dot clearing
    runEndedAt: number?,  // timestamp of most recent stream end (null while streaming)
  }
}
```

Derived at render time:
- `state = isStreaming ? "streaming" : (runEndedAt > lastSeenAt ? "done" : "seen")`
- `visible = tab.pinned` (never cleared automatically — only by the user close action)

### Persistence

- Tabs persist in `claudi-state.json` under each conversation's `tab` field.
- Persisted: `pinned`, `lastSeenAt`, `runEndedAt`.
- On app restart: all previously-pinned tabs reappear, state computed fresh. A tab that was `streaming` at close time becomes `done` (since the run is actually gone).

---

## Integration points

| File | Change |
| --- | --- |
| `src/App.jsx` | Add tab state helpers (`pinTab`, `unpinTab`, `markTabSeen`). Wire `isStreaming` → `pinned = true`. Wire stream-end → audio chime + `runEndedAt`. |
| `src/components/ChatArea.jsx` | Replace left side of header row with `<TabStrip>` / fallback title block. |
| `src/components/TabStrip.jsx` | **New.** Horizontal scrollable list of `<Tab>`. |
| `src/components/Tab.jsx` | **New.** Single pill: dot + title + close. |
| `src/components/Settings.jsx` | Add "Notifications" section: sound dropdown + volume. |
| `src/utils/chime.js` | **New.** Lazy-loaded `playChime(soundId, volume)` wrapping `Audio` / Web Audio. |
| `public/sounds/` | **New.** Bundled chime files: `glass.mp3`, `tink.mp3`, `pop.mp3`, `ping.mp3`, `purr.mp3`, `blow.mp3`, `bottle.mp3`. |

### Hooks into existing streaming lifecycle

`useAgent.js` already emits `isStreaming` transitions. We add two callbacks at the App level:

- **on stream start** (false → true): `pinTab(conversationId)`.
- **on stream end** (true → false): `setRunEndedAt(conversationId, now)`. If `conversationId !== active` and chime not muted → `playChime()`.

`markTabSeen(conversationId)` runs in `handleSelect()` whenever the user switches to that convo.

---

## Edge cases

- **User closes the only tab while viewing it.** Tab goes away; header falls back to title block (or empty state). Conversation remains selected — close is a no-op on navigation.
- **Convo is deleted from the sidebar.** Its tab disappears along with it.
- **Chime fires while user is typing in an unrelated convo.** Fine — background-only rule already avoids the "stream ends on screen" case; the chime is the *whole point* here.
- **Multiple runs finish in rapid succession.** Each plays its own chime; no debounce. If this turns annoying in practice we'll add a 300ms debounce later. (YAGNI for now.)
- **Very long title (e.g. 50 chars).** Truncates with ellipsis in the pill; `title` attribute shows full on hover.
- **Tab bar full-width on narrow windows.** Horizontal scroll handles it. The right-side chips never get pushed off because they live in a separate flex child with `flex-shrink: 0`.
- **Conversation with no messages yet (user opened but didn't send).** No tab until first send. Header shows title block as today.

---

## Out of scope (explicitly)

- **Drag-to-reorder tabs.** Tabs are chronologically ordered by most-recent-stream-start. Ship that first; reorder is future work.
- **Tab groups / pinning vs unpinning semantics.** Close = unpin. No separate "pin" action.
- **Keyboard shortcuts (Cmd-1..9, Cmd-W).** Nice-to-have; defer.
- **Per-conversation chime overrides.** Global setting only, v1.
- **Notification on focus-lost / dock badge.** The audio chime covers the core use case. Dock badge is a future win.

---

## Success criteria

1. Running two conversations in parallel, I can see both in the tab bar and switch in one click.
2. When a background run finishes, I hear one chime and see a persistent amber dot on that tab.
3. When I click the dot-bearing tab, the dot clears and stays cleared.
4. Closing a tab while it's streaming does **not** cancel the run (verified via `agent-cancel` not being called).
5. A user who never has parallel work never sees any change from today's UI.
6. Settings has a Notifications section with 7 sounds + mute, and the choice persists across restarts.
