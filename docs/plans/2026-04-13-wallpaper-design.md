# Wallpaper & Appearance Settings

## Overview

Allow users to set a custom wallpaper image as the full-app background, replacing the aurora animation. Includes window opacity, backdrop blur, and auto-detected accent color controls. Settings are accessed via a new full-page Appearance settings view (Warp-style).

## Settings UI

- Full-page view replacing the chat area, accessed via gear icon in the sidebar
- Left nav with "Appearance" section (expandable to more categories later)
- Back button to return to chat

### Appearance Controls

- **Wallpaper**: Preview thumbnail of current wallpaper + "Choose Image" button (native file dialog, image types only) + "Remove" button to revert to aurora
- **Window Opacity**: Slider (0-100), controls UI chrome transparency over the wallpaper
- **Window Blur Radius**: Slider (0-64px), controls backdrop blur on UI elements
- **Accent Color**: Auto-extracted dominant color from wallpaper image, with manual override option

## Data Flow & Persistence

Stored in `claudi-state.json`:

```json
{
  "wallpaper": {
    "path": "/Users/.../image.png",
    "opacity": 52,
    "blur": 32,
    "accentColor": "#4a7cb5",
    "accentAutoDetect": true
  }
}
```

- Wallpaper image referenced by file path (Approach A — no copying)
- If file is missing/fails to load, fall back to aurora + grain
- Accent color extracted in renderer via offscreen canvas pixel sampling

## Rendering Architecture

### Background Layer

When wallpaper is set, AuroraCanvas + Grain are hidden. Replaced by a fixed full-viewport div:
- `background-image` via `file://` protocol
- `background-size: cover`, `background-position: center`

When no wallpaper (or image fails to load), aurora + grain remain as default.

### UI Transparency

Sidebar, header bar, input bar, and message area receive:
- `background: rgba(0, 0, 0, opacity%)` instead of current opaque backgrounds
- `backdrop-filter: blur(${blurRadius}px)` for frosted glass effect

### Accent Color Propagation

Dominant color extracted from wallpaper applied to:
- Active sidebar items
- Send button
- Model picker highlights
- Any current red/highlight accent usage

Passed via App-level state so all components can access it.

## IPC

- `select-wallpaper`: Opens native file dialog, returns selected path
- Existing `save-state` / `load-state` handles persistence

## Approach Decisions

- **File path reference** over copying to app data (simpler, fallback to aurora if missing)
- **Cover** fit mode (fills background, may crop edges)
- **Full-app background** (not just chat area)
