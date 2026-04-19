# Session Tab Bar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-pinned pill tabs in the chat header for conversations with streaming or recently-finished runs, with an audio chime on background completion.

**Architecture:** Purely renderer-side (no Electron main-process changes). A new `tab` field on each `conversation` object drives a new `<TabStrip>` rendered on the left side of `ChatArea`'s existing header row. Stream start/end transitions detected by diffing `isStreaming` across renders via a `useRef`-held previous map. Sounds ship as bundled `.mp3` files in `public/sounds/`.

**Tech Stack:** React 19, Electron 41, Vite 8, `lucide-react` icons, Web `Audio` API, macOS `afconvert` for sound conversion at build-prep time.

**Design doc:** `docs/plans/2026-04-19-session-tabbar-design.md` (read this first)

**No test framework** is installed in this repo. Verification uses the dev server (`npm run dev:electron`) with manual smoke steps. Keep pure logic functions in `src/utils/` so they can be unit-tested later if the project adopts Vitest.

---

## Task 1: Bundle chime audio files

**Files:**
- Create: `public/sounds/glass.mp3`
- Create: `public/sounds/tink.mp3`
- Create: `public/sounds/pop.mp3`
- Create: `public/sounds/ping.mp3`
- Create: `public/sounds/purr.mp3`
- Create: `public/sounds/blow.mp3`
- Create: `public/sounds/bottle.mp3`

**Why mp3 not aiff:** Chromium's `<audio>` element is inconsistent with AIFF on Linux packagers. MP3 plays everywhere and is tiny.

**Step 1: Create the sounds directory**

```bash
mkdir -p public/sounds
```

**Step 2: Convert the seven macOS system sounds with afconvert**

Run once from the repo root:

```bash
for name in Glass Tink Pop Ping Purr Blow Bottle; do
  lower=$(echo "$name" | tr '[:upper:]' '[:lower:]')
  afconvert -f mp4f -d aac -b 96000 "/System/Library/Sounds/$name.aiff" "public/sounds/$lower.m4a"
  # Vite serves .mp3 with the right mime more reliably — re-wrap to MP3:
  ffmpeg -y -i "public/sounds/$lower.m4a" -codec:a libmp3lame -qscale:a 5 "public/sounds/$lower.mp3"
  rm "public/sounds/$lower.m4a"
done
```

Expected: seven `.mp3` files in `public/sounds/`, each 5–25 KB.

If `ffmpeg` is not installed: `brew install ffmpeg` (one-time). If user has no ffmpeg and won't install, skip the re-wrap; rename `.m4a` → `.mp3` won't work — switch the plan to ship `.m4a` and update the loader in Task 2 accordingly. Verify first.

**Step 3: Sanity-check one file plays**

```bash
afplay public/sounds/glass.mp3
```

Expected: The Glass chime plays.

**Step 4: Commit**

```bash
git add public/sounds/
git commit -m "feat(tabbar): bundle completion chime sounds"
```

---

## Task 2: Chime playback utility

**Files:**
- Create: `src/utils/chime.js`

**Step 1: Write the chime module**

Content of `src/utils/chime.js`:

```js
export const CHIME_SOUNDS = [
  { id: "glass", label: "Glass", src: "/sounds/glass.mp3" },
  { id: "tink", label: "Tink", src: "/sounds/tink.mp3" },
  { id: "pop", label: "Pop", src: "/sounds/pop.mp3" },
  { id: "ping", label: "Ping", src: "/sounds/ping.mp3" },
  { id: "purr", label: "Purr", src: "/sounds/purr.mp3" },
  { id: "blow", label: "Blow", src: "/sounds/blow.mp3" },
  { id: "bottle", label: "Bottle", src: "/sounds/bottle.mp3" },
];

export const DEFAULT_CHIME_ID = "glass";
export const DEFAULT_CHIME_VOLUME = 0.6;

export function getChimeById(id) {
  return CHIME_SOUNDS.find((s) => s.id === id) || CHIME_SOUNDS[0];
}

// Cache Audio elements so we don't pay network/decoding costs on every play.
const audioCache = new Map();

function getAudio(id) {
  const cached = audioCache.get(id);
  if (cached) return cached;
  const sound = getChimeById(id);
  const el = new Audio(sound.src);
  el.preload = "auto";
  audioCache.set(id, el);
  return el;
}

export function playChime(id = DEFAULT_CHIME_ID, volume = DEFAULT_CHIME_VOLUME) {
  try {
    const el = getAudio(id);
    el.currentTime = 0;
    el.volume = Math.max(0, Math.min(1, volume));
    const result = el.play();
    if (result && typeof result.catch === "function") {
      result.catch((err) => {
        console.warn("[chime] playback blocked:", err?.message || err);
      });
    }
  } catch (err) {
    console.warn("[chime] play failed:", err?.message || err);
  }
}
```

**Step 2: Smoke-test from the devtools console**

Start dev server:

```bash
npm run dev:electron
```

In the app's devtools console:

```js
import("/src/utils/chime.js").then(m => m.playChime("glass"))
```

Expected: Glass chime plays. Swap `"glass"` for each other id to verify all seven files are reachable.

**Step 3: Commit**

```bash
git add src/utils/chime.js
git commit -m "feat(tabbar): chime playback utility"
```

---

## Task 3: Notification settings state

**Files:**
- Modify: `src/App.jsx` (state declarations near line 713; persistence call around line 876; state-load around line 820-862)

**Step 1: Add state variables**

In `src/App.jsx`, alongside the other `useState` calls around line 713 (right after `developerMode`), add:

```js
const [notificationSound, setNotificationSound] = useState("glass");
const [notificationsMuted, setNotificationsMuted] = useState(false);
```

**Step 2: Persist them via saveState**

Modify the `window.api.saveState({...})` call near line 876 to include both fields. Current block:

```js
window.api.saveState({
  convos: persistableConversations,
  active: persistedActive,
  cwd,
  // ...
  developerMode,
});
```

Add the two fields:

```js
window.api.saveState({
  convos: persistableConversations,
  active: persistedActive,
  cwd,
  // ...
  developerMode,
  notificationSound,
  notificationsMuted,
});
```

Also add both variables to the `useEffect` dependency array (the line currently ending `...developerMode, stateLoaded]`, around line 892):

```js
}, [persistableConversations, persistedActive, cwd, defaultModel, fontSize, sidebarActiveOpacity, wallpaper, projects, draftsCollapsed, defaultPrBranch, appBlur, appOpacity, developerMode, notificationSound, notificationsMuted, stateLoaded]);
```

**Step 3: Restore on state load**

Find the state-load block (starts around line 820 where `state.defaultPrBranch` etc. is read). Add restoration:

```js
if (typeof state.notificationSound === "string") setNotificationSound(state.notificationSound);
if (typeof state.notificationsMuted === "boolean") setNotificationsMuted(state.notificationsMuted);
```

Place these two lines among the other `if (state.X) setX(state.X)` reads.

**Step 4: Verify state persistence**

Run the app (`npm run dev:electron`). In devtools console run:

```js
window.api.saveState
```

Expected: function exists. Change `notificationSound`/`notificationsMuted` state by calling the setters in devtools (use React DevTools, or wait until Task 4 to verify through UI).

**Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(tabbar): persist notification settings"
```

---

## Task 4: Notifications section in Settings

**Files:**
- Modify: `src/components/Settings.jsx` (add new props + new section before the GIT section around line 532)
- Modify: `src/App.jsx` (pass new props to `<Settings>`, around line 2103)

**Step 1: Add props to Settings**

In `src/components/Settings.jsx` line 7, extend the destructured props:

```js
export default function Settings({ wallpaper, onWallpaperChange, fontSize, onFontSizeChange, defaultPrBranch, onDefaultPrBranchChange, appBlur = 0, onAppBlurChange, appOpacity = 100, onAppOpacityChange, developerMode = false, onDeveloperModeChange, notificationSound = "glass", onNotificationSoundChange, notificationsMuted = false, onNotificationsMutedChange, onClose }) {
```

Add the import at the top:

```js
import { CHIME_SOUNDS } from "../utils/chime";
import { playChime } from "../utils/chime";
```

(Single-line import preferred: `import { CHIME_SOUNDS, playChime } from "../utils/chime";`)

**Step 2: Add the Notifications section**

Just **before** the `GIT` section (the `div` containing `GIT` label around line 533), insert the new section. Use the existing section patterns (label style, control style) from nearby code as your template.

```jsx
{developerMode && (
  <>
    {/* NOTIFICATIONS */}
    <div
      style={{
        fontSize: s(10),
        fontWeight: 600,
        color: "rgba(255,255,255,0.25)",
        letterSpacing: ".12em",
        textTransform: "uppercase",
        marginBottom: 20,
        marginTop: 12,
      }}
    >
      NOTIFICATIONS
    </div>

    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: s(13), color: "rgba(255,255,255,0.8)", marginBottom: 2 }}>
        Completion chime
      </div>
      <div style={{ fontSize: s(11), color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
        Plays when a background run finishes. The currently-viewed conversation stays silent.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <select
          value={notificationSound}
          onChange={(e) => onNotificationSoundChange?.(e.target.value)}
          disabled={notificationsMuted}
          style={{
            flex: 1,
            height: 32,
            padding: "0 10px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 7,
            color: "rgba(255,255,255,0.9)",
            fontFamily: "system-ui, sans-serif",
            fontSize: s(12),
            outline: "none",
            opacity: notificationsMuted ? 0.4 : 1,
          }}
        >
          {CHIME_SOUNDS.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>

        <button
          onClick={() => playChime(notificationSound)}
          disabled={notificationsMuted}
          style={{
            height: 32,
            padding: "0 12px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 7,
            color: "rgba(255,255,255,0.8)",
            fontSize: s(12),
            cursor: notificationsMuted ? "not-allowed" : "pointer",
            opacity: notificationsMuted ? 0.4 : 1,
          }}
        >
          Preview
        </button>
      </div>
    </div>

    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 24,
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={notificationsMuted}
        onChange={(e) => onNotificationsMutedChange?.(e.target.checked)}
      />
      <span style={{ fontSize: s(13), color: "rgba(255,255,255,0.8)" }}>
        Mute completion chime
      </span>
    </label>
  </>
)}
```

**Step 3: Pass props from App.jsx**

In `src/App.jsx` around line 2103, pass the four new props to `<Settings>`:

```jsx
<Settings
  // ...existing props...
  developerMode={developerMode}
  onDeveloperModeChange={setDeveloperMode}
  notificationSound={notificationSound}
  onNotificationSoundChange={setNotificationSound}
  notificationsMuted={notificationsMuted}
  onNotificationsMutedChange={setNotificationsMuted}
  onClose={() => setShowSettings(false)}
/>
```

**Step 4: Verify**

Restart dev server, open Settings. Expected:
- A new "NOTIFICATIONS" section appears.
- Dropdown shows seven options, Glass selected.
- Clicking Preview plays the selected sound.
- Toggling Mute disables the dropdown and Preview button (opacity drop, cursor forbidden).
- Quit & relaunch the app: the chosen sound and mute state persist.

**Step 5: Commit**

```bash
git add src/components/Settings.jsx src/App.jsx
git commit -m "feat(tabbar): settings section for completion chime"
```

---

## Task 5: Tab state helpers

**Files:**
- Create: `src/utils/tabs.js`

**Step 1: Write the pure helpers**

Content of `src/utils/tabs.js`:

```js
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
```

**Step 2: Commit**

Pure functions with no side effects; verify by inspection. Commit:

```bash
git add src/utils/tabs.js
git commit -m "feat(tabbar): tab state helpers"
```

---

## Task 6: Pin-on-stream-start and chime-on-stream-end

**Files:**
- Modify: `src/App.jsx` (add streaming-transition watcher)

**Step 1: Add imports**

Near the top of `src/App.jsx` (alongside other utils imports around line 11):

```js
import { pinTabPatch, runEndedPatch, unpinTabPatch, markSeenPatch, withTabPatch, computeTabState, getTabMeta } from "./utils/tabs";
import { playChime } from "./utils/chime";
```

**Step 2: Add a ref and effect that watches streaming transitions**

Place this `useRef` + `useEffect` block inside the `App` component after existing state declarations (e.g. after the `queuedMessages` state around line 720). Make sure it runs after `conversations`/`convoList` are available.

```js
const prevStreamingRef = useRef(new Map());

useEffect(() => {
  const prev = prevStreamingRef.current;
  const next = new Map();

  for (const convo of convoList) {
    const data = getConversation(convo.id);
    const streaming = Boolean(data.isStreaming);
    next.set(convo.id, streaming);

    const wasStreaming = Boolean(prev.get(convo.id));

    if (!wasStreaming && streaming) {
      // Stream START → pin a tab
      setConvoList((p) =>
        p.map((c) => (c.id === convo.id ? withTabPatch(c, pinTabPatch()) : c))
      );
    } else if (wasStreaming && !streaming) {
      // Stream END → stamp runEndedAt + chime if background
      setConvoList((p) =>
        p.map((c) => (c.id === convo.id ? withTabPatch(c, runEndedPatch()) : c))
      );

      const isBackground = convo.id !== active;
      if (isBackground && !notificationsMuted) {
        playChime(notificationSound);
      }
    }
  }

  prevStreamingRef.current = next;
}, [convoList, getConversation, active, notificationSound, notificationsMuted]);
```

Notes for the implementer:
- `setConvoList` inside an effect is fine; the guard is the `wasStreaming !== streaming` edge detection.
- Do NOT move this logic into `useAgent` — that hook is shared across providers and isn't aware of per-conversation notification settings.
- The `convoList` dependency will cause this effect to re-run every render; that's acceptable because the inner loop is O(tabs) and the early return on unchanged state avoids state churn. If perf becomes a concern, memoize a streaming-id set from `conversations` via `useMemo` and depend on that instead.

**Step 3: Smoke verify**

Start dev server. Open two conversations. Send a message in convo A, then switch to convo B.

Expected:
- Convo A's tab logic fires (check `convoList` in React DevTools → `tab.pinned === true`).
- When A's stream ends while you're viewing B, you hear the chime.
- When A's stream ends while you're viewing A, you hear **no** chime.
- Muting in Settings silences the chime on subsequent completions.

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(tabbar): pin tab on stream start, chime on background finish"
```

---

## Task 7: Tab and TabStrip components

**Files:**
- Create: `src/components/Tab.jsx`
- Create: `src/components/TabStrip.jsx`

**Step 1: Write Tab.jsx**

```jsx
import { X } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

const DOT_COLORS = {
  streaming: "rgba(120, 200, 255, 0.9)",
  done: "rgba(255, 190, 120, 0.95)",
  seen: "transparent",
};

export default function Tab({ title, state, active, onSelect, onClose }) {
  const s = useFontScale();
  const dotColor = DOT_COLORS[state] || "transparent";
  const pulse = state === "streaming";

  return (
    <div
      onClick={onSelect}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 26,
        padding: "0 6px 0 10px",
        background: active ? "rgba(255,255,255,0.06)" : "transparent",
        border: "1px solid " + (active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)"),
        borderRadius: 8,
        cursor: "pointer",
        flexShrink: 0,
        maxWidth: 200,
        transition: "background .15s, border-color .15s",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: dotColor,
          flexShrink: 0,
          animation: pulse ? "tabDotPulse 1.4s ease-in-out infinite" : "none",
          transition: "background .25s",
        }}
      />
      <span
        style={{
          fontSize: s(12),
          color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.7)",
          fontFamily: "system-ui, sans-serif",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {title || "Untitled"}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose?.();
        }}
        aria-label="Close tab"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: 4,
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.4)",
          cursor: "pointer",
          flexShrink: 0,
          opacity: active ? 1 : 0,
          transition: "opacity .15s, background .15s, color .15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.08)";
          e.currentTarget.style.color = "rgba(255,255,255,0.85)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "rgba(255,255,255,0.4)";
        }}
      >
        <X size={11} strokeWidth={1.75} />
      </button>
      <style>{`
        @keyframes tabDotPulse {
          0%, 100% { transform: scale(0.8); opacity: 0.7; }
          50%      { transform: scale(1.15); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
```

Also: non-active tabs need to reveal their close button on hover of the tab itself. Add this: in the parent `div`'s `onMouseEnter/Leave`, toggle the child button's opacity via a data-attribute and a sibling selector, OR simplify by wrapping the tab in a component that manages `hover` state with `useState`. Use the `useState` route — simpler and doesn't depend on CSS selectors on inline styles.

Revised `Tab.jsx` top:

```jsx
import { useState } from "react";
import { X } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

// ...DOT_COLORS...

export default function Tab({ title, state, active, onSelect, onClose }) {
  const s = useFontScale();
  const [hover, setHover] = useState(false);
  const dotColor = DOT_COLORS[state] || "transparent";
  const pulse = state === "streaming";
  const showClose = active || hover;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      /* ...rest stays the same, but remove the inline onMouseEnter/Leave background swap — drive background from `hover` state... */
      style={{
        /* ...existing... */
        background: active
          ? "rgba(255,255,255,0.06)"
          : hover
            ? "rgba(255,255,255,0.04)"
            : "transparent",
      }}
    >
      {/* dot */}
      {/* title */}
      <button
        /* ...existing... */
        style={{
          /* ...existing... */
          opacity: showClose ? 1 : 0,
          pointerEvents: showClose ? "auto" : "none",
        }}
      >
        <X size={11} strokeWidth={1.75} />
      </button>
    </div>
  );
}
```

**Step 2: Write TabStrip.jsx**

```jsx
import { useEffect, useRef } from "react";
import Tab from "./Tab";

export default function TabStrip({ tabs, activeId, onSelect, onClose }) {
  const scrollRef = useRef(null);
  const activeRef = useRef(null);

  // Scroll the active tab into view when it changes
  useEffect(() => {
    const el = activeRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeId]);

  return (
    <div
      ref={scrollRef}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        overflowX: "auto",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        flex: 1,
        minWidth: 0,
      }}
      className="tab-strip-scroll"
    >
      {tabs.map((t) => (
        <div key={t.id} ref={t.id === activeId ? activeRef : null}>
          <Tab
            title={t.title}
            state={t.state}
            active={t.id === activeId}
            onSelect={() => onSelect(t.id)}
            onClose={() => onClose(t.id)}
          />
        </div>
      ))}
      <style>{`
        .tab-strip-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/components/Tab.jsx src/components/TabStrip.jsx
git commit -m "feat(tabbar): Tab and TabStrip components"
```

---

## Task 8: Integrate into ChatArea header

**Files:**
- Modify: `src/components/ChatArea.jsx` (header section ~line 274-368)
- Modify: `src/App.jsx` (`handleSelect`, `handleDelete`; pass tab props to ChatArea)

**Step 1: Compute tab list in App.jsx**

Near the `convosForSidebar` memo in `src/App.jsx` (around line 1966), add:

```js
const tabs = useMemo(() => {
  return convoList
    .filter((c) => c.tab?.pinned)
    .map((c) => {
      const data = getConversation(c.id);
      return {
        id: c.id,
        title: c.title || "Untitled",
        state: computeTabState(c, { isStreaming: Boolean(data.isStreaming) }),
      };
    });
}, [convoList, getConversation]);
```

**Step 2: Add close-tab and mark-seen handlers**

Add near `handleDelete`:

```js
const handleCloseTab = useCallback((id) => {
  setConvoList((p) => p.map((c) => (c.id === id ? withTabPatch(c, unpinTabPatch()) : c)));
  // Do NOT cancel the run. Do NOT change `active`.
}, []);
```

In `handleSelect` (around line 980), after `setActive(id);`, insert:

```js
setConvoList((p) => p.map((c) => (c.id === id ? withTabPatch(c, markSeenPatch()) : c)));
```

**Step 3: Pass tab props to ChatArea**

In the `<ChatArea ... />` JSX block around line 2119, add:

```jsx
<ChatArea
  /* ...existing props... */
  tabs={tabs}
  activeTabId={active}
  onSelectTab={handleSelect}
  onCloseTab={handleCloseTab}
/>
```

**Step 4: Modify ChatArea to render tabs**

In `src/components/ChatArea.jsx` line 15, extend the destructured props:

```js
export default function ChatArea({
  convo, onSend, onCancel, onEdit, onToggleSidebar, sidebarOpen, onNew,
  onModelChange, defaultModel, queuedMessages, onToggleTerminal, terminalOpen,
  terminalCount, wallpaper, cwd, onCwdChange, onRefocusTerminal, showNewChatCard,
  onCreateChat, onCancelNewChat, allCwdRoots, projects, defaultPrBranch,
  onControlChange, canControlTarget, developerMode = true,
  tabs = [], activeTabId = null, onSelectTab, onCloseTab,
}) {
```

Add the import at top:

```js
import TabStrip from "./TabStrip";
```

Locate the header row block (around line 274-368). The left-hand `div` contains the title block `{convo && !showNewChatCard && (...)}`. Replace its contents (the `<div style={{ display:"flex", alignItems:"center", gap: 14, WebkitAppRegion:"no-drag" }}>` wrapper) so that:

- If `tabs.length > 0`, render `<TabStrip tabs={tabs} activeId={activeTabId} onSelect={onSelectTab} onClose={onCloseTab} />`.
- Else, keep the existing title/`N MESSAGES` block.
- If current convo has NO tab but tabs exist, show the title block **after** the strip with a subtle divider — this is the "browsing old convo while other runs continue" state.

Concrete replacement for the left-side `<div>` content (the whole `<div style={{ display:"flex", alignItems:"center", gap: 14, WebkitAppRegion:"no-drag" }}>…</div>` block):

```jsx
<div
  style={{
    display: "flex",
    alignItems: "center",
    gap: 12,
    WebkitAppRegion: "no-drag",
    minWidth: 0,
    flex: 1,
  }}
>
  {tabs.length > 0 && (
    <TabStrip tabs={tabs} activeId={activeTabId} onSelect={onSelectTab} onClose={onCloseTab} />
  )}

  {convo && !showNewChatCard && !tabs.some((t) => t.id === convo.id) && (
    <div style={{ animation: "dropIn .2s ease", flexShrink: 0 }}>
      <div style={{
        fontSize: s(13),
        color: "rgba(255,255,255,0.88)",
        fontFamily: "system-ui,sans-serif",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        maxWidth: 300,
      }}>
        {convo.title}
      </div>
      <div style={{
        fontSize: s(9),
        fontFamily: "'JetBrains Mono',monospace",
        color: "rgba(255,255,255,0.3)",
        marginTop: 1,
        letterSpacing: ".08em",
      }}>
        {convo.msgs.length} MESSAGES
      </div>
    </div>
  )}
</div>
```

**Step 5: Tighten the outer wrapper**

The outer wrapper (`<div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", maxWidth: sidebarOpen ? "none" : 640 }}>` around line 283) needs `gap: 12` so the strip doesn't touch the right-side chips; ensure `minWidth: 0` on the left child. Already added above. Also remove `maxWidth: 640` when tabs exist — it clips the strip when the sidebar is closed. Change to:

```jsx
maxWidth: (!sidebarOpen && tabs.length === 0) ? 640 : "none",
```

**Step 6: Smoke-test**

`npm run dev:electron`. Send a message in convo A, create/switch to convo B and send a message there.

Expected:
- Both A and B appear as pill tabs.
- The active one is highlighted; clicking the other switches and highlights it.
- Pulse dot while streaming; turns solid amber when the *other* convo finishes.
- Viewing the finished tab clears the dot.
- Close button appears on active tab and on hover for others; clicking `×` removes the tab **without** cancelling a running stream.
- Right-side chips (GitStatusPill, Branch, Model, Terminal) stay untouched.

**Step 7: Commit**

```bash
git add src/components/ChatArea.jsx src/App.jsx
git commit -m "feat(tabbar): render tab strip in chat header"
```

---

## Task 9: Persist tab fields across restarts + polish

**Files:**
- Modify: `src/App.jsx` (`normalizeConversationState` and state-load handling)

**Step 1: Make sure `tab` survives `normalizeConversationState`**

Verify: `normalizeConversationState` (App.jsx:347) returns `{ ...conversation, ... }`, so extra fields like `tab` pass through automatically. Read the function and confirm no explicit whitelist strips `tab`.

If it does strip it, add `tab: conversation.tab,` to the returned object.

**Step 2: Clamp streaming → done on load**

Conversations persisted mid-stream will reappear as stale "streaming" tabs on relaunch. Fix at state-load time. Find the `setConvoList(restoredConversations);` call around line 832, and change to:

```js
const sanitized = restoredConversations.map((c) => {
  if (!c?.tab?.pinned) return c;
  // Any persisted tab is necessarily not streaming after relaunch.
  // If runEndedAt is missing, stamp it so the dot shows as "done" (unread).
  if (c.tab.runEndedAt == null) {
    return { ...c, tab: { ...c.tab, runEndedAt: Date.now() } };
  }
  return c;
});
setConvoList(sanitized);
```

**Step 3: Guard against chime on initial render**

On initial render, `prevStreamingRef.current` is an empty `Map`, so when `isStreaming` flips from `undefined`→`false` during state load no chime fires — confirmed by the `wasStreaming && !streaming` condition (both false). No change needed.

But: the effect also runs once with an empty `convoList` before load, then again after load. On that second run, `prev` is empty Map, `next` records `isStreaming: false` for every convo. No transition → no side effects. Good.

**Step 4: Smoke test the full flow**

1. Start: no tabs. Header shows today's layout.
2. Send a message in convo A → tab A appears with cyan pulse dot.
3. While A streams, switch to sidebar and click convo B → open it → send a message there. Now two tabs.
4. Wait for A to finish while viewing B. Chime plays once. Tab A's dot turns amber.
5. Click tab A. Dot clears. Tab remains. Go back to B — tab A is quiet.
6. Click `×` on tab A. Tab disappears.
7. Quit and relaunch. Tab B persists. If B had been streaming at quit time, its tab now shows "done" amber dot.
8. Open an old convo that was never worked on this session — title/count block appears, no tab.
9. Mute in Settings. Trigger a background run completion. No chime.

**Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(tabbar): persist tabs across restart"
```

---

## Task 10: End-to-end verification against design success criteria

**Files:** none (smoke test only)

**Step 1: Run through the 6 success criteria from the design doc**

1. ✅ Running two conversations in parallel, both appear as tabs, one-click switch.
2. ✅ Background run finish → one chime + persistent amber dot.
3. ✅ Clicking the dot-bearing tab clears and stays cleared.
4. ✅ Closing a streaming tab does NOT cancel the run (verify: re-open the convo from sidebar; messages still streaming in).
5. ✅ No tabs visible for users who never do parallel work — header identical to today.
6. ✅ Notifications section in Settings with 7 sounds + mute; survives restart.

**Step 2: Merge-readiness checklist**

- `npm run lint` passes.
- Dev mode reload (Cmd-R) preserves tab state from persistence.
- No console errors during the flow above.
- No regressions to the right-side chips row.

**Step 3: Commit any lint fixes, then open PR**

```bash
git add -A
git diff --cached  # review
git commit -m "chore(tabbar): lint/polish" --allow-empty  # only if there are fixes
git push -u origin feat/tabbar
gh-axi pr create ...
```

PR title suggestion: `feat: session tabs for parallel conversations`

---

## Open risks

- **Audio autoplay policy.** Chromium may block `Audio.play()` until the user has interacted with the page. In Electron, the app window is considered interacted once the user clicks anywhere — so in practice this is fine. If chimes silently fail, add a one-time interaction listener during app boot. (`playChime` already logs the rejection.)
- **Many tabs.** No cap in v1. If a user leaves 30 convos pinned, the strip scrolls horizontally. Add a cap only if users complain.
- **Codex provider.** Streaming detection is via `conversations.get(id).isStreaming` which `useAgent` sets for both Claude and Codex streams. Should work uniformly but verify by triggering a Codex run and watching for pin/chime.
