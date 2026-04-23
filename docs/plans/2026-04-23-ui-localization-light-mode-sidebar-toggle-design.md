# RayLine UI Localization, Light Mode, and Sidebar Toggle Redesign

**Date:** 2026-04-23
**Status:** Ready for issue creation

## Current findings

The current UI is not set up for incremental localization or theming yet:

- `src/index.css` defines a single dark palette in `:root` with hard-coded dark values.
- Core UI copy is inlined across components such as `src/components/Sidebar.jsx`, `src/components/Settings.jsx`, and `src/components/ChatArea.jsx`.
- Sidebar collapse and expand actions are rendered in two different places:
  - expanded state: `src/components/Sidebar.jsx`
  - collapsed state: `src/components/ChatArea.jsx`
- Those two buttons use different positioning rules, so the control moves when layout state changes.

This means the three requests are related, but they should not ship as one large issue. They should be split so that copy, visual tokens, and layout behavior can evolve independently.

## Recommended issue split

### Issue 1: Introduce UI i18n infrastructure and ship first-pass Chinese localization

**Problem**

RayLine currently hard-codes English UI strings directly inside React components. That makes Chinese localization slow, error-prone, and difficult to review because text changes are mixed with layout logic.

**Goal**

Create a minimal but durable i18n layer, then translate the primary user-facing UI to Simplified Chinese without changing behavior.

**Scope**

- Add a lightweight translation layer for renderer UI
- Add `en-US` as the source locale and `zh-CN` as the first translated locale
- Migrate core surfaces first:
  - sidebar
  - chat header and empty state
  - settings
  - new project / dispatch / terminal surface labels
  - project manager shell labels if feasible in the same pass
- Keep model ids, shell output, Git terms, and provider names untranslated unless there is a clear UX gain

**Suggested implementation**

- Add locale dictionaries under `src/i18n/`
- Add a small `I18nContext` or `useI18n()` hook
- Start by replacing inline text in:
  - `src/components/Sidebar.jsx`
  - `src/components/Settings.jsx`
  - `src/components/ChatArea.jsx`
  - `src/components/EmptyState.jsx`
  - `src/components/NewProjectModal.jsx`
  - `src/components/DispatchCard.jsx`
- Persist user locale in the same app state flow already used by `App.jsx`

**Acceptance criteria**

1. The app can switch between `en-US` and `zh-CN` without restart.
2. Main navigation and settings surfaces display complete Chinese copy with no mixed placeholder English in the migrated scope.
3. No layout breaks occur from longer Chinese labels in the sidebar, settings rows, or header actions.
4. Locale selection persists across relaunch.

**Nice-to-have, not required**

- A future translation audit for GitHub Project Manager subpages
- Locale-aware time formatting

---

### Issue 2: Add a real light theme instead of dark-theme overrides

**Problem**

The current UI is architected as a dark-first interface. Colors are embedded directly in CSS variables and many inline styles assume bright text over dark translucent panels. A "day mode" cannot be added cleanly by patching a few colors.

**Goal**

Introduce theme tokens and a proper light theme that feels native in daytime use, while preserving the current dark theme as the default baseline.

**Scope**

- Add theme state: `dark` and `light`
- Replace dark-only tokens with semantic theme tokens
- Make the main panes, chat surface, sidebar, settings, tooltips, form controls, and terminal chrome visually coherent in light mode
- Preserve wallpaper/opacity features where they still make sense

**Suggested implementation**

- Expand `src/index.css` from a single dark `:root` into semantic tokens, for example:
  - `--color-bg`
  - `--color-panel`
  - `--color-border`
  - `--color-text`
  - `--color-text-muted`
  - `--color-accent`
- Apply theme through `data-theme` on the root app node instead of branching inline colors ad hoc
- Reduce inline hard-coded `rgba(255,255,255,...)` usage in high-traffic components and map them to theme-aware tokens
- Start with these files:
  - `src/index.css`
  - `src/App.jsx`
  - `src/components/Sidebar.jsx`
  - `src/components/ChatArea.jsx`
  - `src/components/Settings.jsx`
  - `src/components/HoverIconButton.jsx`
  - `src/components/TerminalDrawer.jsx`

**Design direction**

Light mode should not be a pure white inversion. A better target is:

- warm-neutral base background
- slightly raised side panels
- softer borders
- darker text with restrained accent color
- preserved depth, but lower blur and glow than dark mode

**Acceptance criteria**

1. Users can switch between dark and light mode in Settings.
2. Theme choice persists across relaunch.
3. Main chat, sidebar, settings, tooltips, and terminal drawer remain legible and visually consistent in both themes.
4. No component relies on white-on-light or dark-on-dark contrast that drops below normal usability.

**Risk**

This issue will surface many hidden style assumptions. Expect some cleanup follow-up after the first light-theme pass.

---

### Issue 3: Unify sidebar toggle into one fixed anchor control

**Problem**

Today the sidebar toggle is implemented as two different controls:

- expanded state toggle in `Sidebar.jsx`
- collapsed state toggle in `ChatArea.jsx`

Because those controls live in different DOM regions and use different coordinates, the toggle shifts both position and interaction context. That increases target acquisition time and makes repeated use harder than it should be.

**Goal**

Adopt a single fixed toggle location, inspired by the stable mode-switch anchor used in Google Antigravity-style layouts: one control, one anchor point, predictable muscle memory.

**Preferred UX direction**

- Keep the toggle in a single, always-visible anchor zone near the top-left chrome area
- The button should remain at one fixed coordinate relative to the window chrome, not relative to sidebar width
- Expanded and collapsed states should reuse the same hit target, icon container, hover treatment, and tooltip behavior
- Avoid both horizontal drift and vertical drift

**Suggested implementation**

- Extract a shared chrome control component, for example `SidebarToggleButton` or `ChromeRail`
- Render it once at app-shell level from `App.jsx`
- Remove duplicated toggle rendering from:
  - `src/components/Sidebar.jsx`
  - `src/components/ChatArea.jsx`
- Keep state ownership in `App.jsx`, but move positioning rules into one place
- Reuse `src/windowChrome.js` constants, but redefine them around a single anchor model instead of separate expanded/collapsed layouts

**Behavior details**

- Hit target should be at least 32x32
- Hover and active states should remain stable in both themes
- Tooltip text should be localized once Issue 1 lands
- The nearby "new chat" affordance can stay adjacent, but it should not replace the toggle's anchor

**Acceptance criteria**

1. The sidebar toggle stays in one fixed position whether the sidebar is open or closed.
2. The control does not jump when switching conversations, opening settings, or resizing within the supported layout range.
3. Keyboard focus and hover affordance remain consistent in both states.
4. The interaction feels easier to repeat because muscle memory is based on one stable target.

**Optional follow-up**

- Add a compact command rail for `toggle sidebar`, `new chat`, and `terminal`
- Add a keyboard shortcut hint in the tooltip

## Recommended implementation order

1. **Issue 3 first**
   Fixing the sidebar toggle anchor is the smallest high-value UX win and has the least coupling.
2. **Issue 1 second**
   Introduce i18n before broad visual polish so labels and layout constraints become explicit.
3. **Issue 2 third**
   Light mode is broader and will benefit from the earlier cleanup of structure and copy.

## Local development notes

The repository is now available locally at:

- `/Users/vicki/service/RAYLINE`

Relevant dev flow from the repo:

- install dependencies: `npm install`
- run renderer + Electron: `npm run dev:electron`
- if `node-pty` or Electron native modules need refresh: `npm run rebuild`

## Suggested next step

Create three GitHub issues from the sections above, then start local development with Issue 3. It has the cleanest implementation boundary and gives immediate UX feedback before the larger i18n and light-mode passes.
