# Wallpaper & Appearance Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to set custom wallpaper images as the full-app background with opacity, blur, and auto-detected accent color controls, accessed via a Warp-style settings panel.

**Architecture:** New `Settings` component renders as a full-page view (replacing chat area when open). Wallpaper state lives in App.jsx alongside existing state, persisted via the existing `save-state`/`load-state` IPC. A new `select-wallpaper` IPC handler opens a native file dialog. Accent color extraction uses an offscreen canvas in the renderer.

**Tech Stack:** React 19, Electron 41 IPC, Canvas API for color extraction, inline styles (matching existing codebase)

---

### Task 1: Add `select-wallpaper` IPC handler

**Files:**
- Modify: `electron/main.cjs:108-114` (near existing `folder-pick` handler)
- Modify: `electron/preload.cjs:26` (near existing `pickFolder`)

**Step 1: Add IPC handler in main process**

In `electron/main.cjs`, after the `folder-pick` handler (line ~114), add:

```javascript
// IPC: wallpaper image picker
ipcMain.handle("select-wallpaper", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"] }],
  });
  return result.canceled ? null : result.filePaths[0];
});
```

**Step 2: Expose in preload**

In `electron/preload.cjs`, after `pickFolder` (line ~26), add:

```javascript
selectWallpaper: () => ipcRenderer.invoke("select-wallpaper"),
```

**Step 3: Commit**

```bash
git add electron/main.cjs electron/preload.cjs
git commit -m "feat: add select-wallpaper IPC handler for native file dialog"
```

---

### Task 2: Add wallpaper state to App.jsx

**Files:**
- Modify: `src/App.jsx:20-25` (state declarations)
- Modify: `src/App.jsx:30-41` (load state)
- Modify: `src/App.jsx:45-52` (save state)

**Step 1: Add wallpaper state**

After `const [stateLoaded, setStateLoaded] = useState(false);` (line 25), add:

```javascript
const [wallpaper, setWallpaper] = useState(null); // { path, opacity, blur, accentColor, accentAutoDetect }
const [showSettings, setShowSettings] = useState(false);
```

**Step 2: Load wallpaper from persisted state**

In the `loadState` effect (line ~32-38), after `if (state.defaultModel) setDefaultModel(state.defaultModel);`, add:

```javascript
if (state.wallpaper) setWallpaper(state.wallpaper);
```

**Step 3: Save wallpaper in persist effect**

In the save effect (line ~50), change the `saveState` call to include wallpaper:

```javascript
window.api.saveState({ convos: convoList, active, cwd, defaultModel, wallpaper });
```

Also add `wallpaper` to the dependency array on line ~52:

```javascript
}, [convoList, active, cwd, defaultModel, wallpaper, stateLoaded]);
```

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add wallpaper state with persistence in App.jsx"
```

---

### Task 3: Create the Settings component

**Files:**
- Create: `src/components/Settings.jsx`

**Step 1: Create Settings component**

Create `src/components/Settings.jsx` with a full-page Warp-style layout:

```jsx
import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Image, X } from "lucide-react";

function extractDominantColor(imagePath) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 50;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        // Skip very dark and very bright pixels
        const brightness = data[i] + data[i + 1] + data[i + 2];
        if (brightness > 60 && brightness < 700) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
      }
      if (count === 0) { resolve("#6366f1"); return; }
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      // Boost saturation slightly for a more vivid accent
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 30) { resolve("#6366f1"); return; } // Too gray, use default
      resolve(`#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`);
    };
    img.onerror = () => resolve("#6366f1");
    img.src = imagePath.startsWith("file://") ? imagePath : `file://${imagePath}`;
  });
}

export default function Settings({ wallpaper, onWallpaperChange, onClose }) {
  const [localWallpaper, setLocalWallpaper] = useState(wallpaper || {
    path: null,
    opacity: 50,
    blur: 32,
    accentColor: null,
    accentAutoDetect: true,
  });
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileTimeout = useRef(null);

  // Generate preview URL from path
  useEffect(() => {
    if (localWallpaper.path) {
      setPreviewUrl(`file://${localWallpaper.path}`);
    } else {
      setPreviewUrl(null);
    }
  }, [localWallpaper.path]);

  // Propagate changes up with debounce
  useEffect(() => {
    clearTimeout(fileTimeout.current);
    fileTimeout.current = setTimeout(() => {
      onWallpaperChange(localWallpaper.path ? localWallpaper : null);
    }, 150);
  }, [localWallpaper]);

  const handleChooseImage = async () => {
    if (!window.api?.selectWallpaper) return;
    const filePath = await window.api.selectWallpaper();
    if (!filePath) return;

    let accentColor = localWallpaper.accentColor;
    if (localWallpaper.accentAutoDetect) {
      accentColor = await extractDominantColor(filePath);
    }
    setLocalWallpaper((prev) => ({ ...prev, path: filePath, accentColor }));
  };

  const handleRemove = () => {
    setLocalWallpaper({ path: null, opacity: 50, blur: 32, accentColor: null, accentAutoDetect: true });
  };

  const handleOpacityChange = (e) => {
    setLocalWallpaper((prev) => ({ ...prev, opacity: Number(e.target.value) }));
  };

  const handleBlurChange = (e) => {
    setLocalWallpaper((prev) => ({ ...prev, blur: Number(e.target.value) }));
  };

  const handleAccentChange = (e) => {
    setLocalWallpaper((prev) => ({ ...prev, accentColor: e.target.value, accentAutoDetect: false }));
  };

  const handleAutoDetectToggle = useCallback(async () => {
    const newAuto = !localWallpaper.accentAutoDetect;
    if (newAuto && localWallpaper.path) {
      const color = await extractDominantColor(localWallpaper.path);
      setLocalWallpaper((prev) => ({ ...prev, accentAutoDetect: true, accentColor: color }));
    } else {
      setLocalWallpaper((prev) => ({ ...prev, accentAutoDetect: newAuto }));
    }
  }, [localWallpaper.accentAutoDetect, localWallpaper.path]);

  const sliderTrack = (value, max) => ({
    background: `linear-gradient(to right, ${localWallpaper.accentColor || "rgba(255,255,255,0.5)"} 0%, ${localWallpaper.accentColor || "rgba(255,255,255,0.5)"} ${(value / max) * 100}%, rgba(255,255,255,0.08) ${(value / max) * 100}%, rgba(255,255,255,0.08) 100%)`,
  });

  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
      position: "relative",
      zIndex: 10,
    }}>
      {/* Drag region */}
      <div style={{ height: 52, WebkitAppRegion: "drag", flexShrink: 0 }} />

      {/* Header */}
      <div style={{
        padding: "0 24px 20px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        WebkitAppRegion: "no-drag",
      }}>
        <button
          onClick={onClose}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
            transition: "all .2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>
        <span style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.88)",
          fontFamily: "system-ui,sans-serif",
        }}>Settings</span>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "0 28px 40px",
        display: "flex",
        justifyContent: "center",
      }}>
        <div style={{ maxWidth: 520, width: "100%" }}>

          {/* Appearance section header */}
          <div style={{
            fontSize: 11,
            fontFamily: "'JetBrains Mono',monospace",
            color: "rgba(255,255,255,0.25)",
            letterSpacing: ".12em",
            marginBottom: 20,
          }}>APPEARANCE</div>

          {/* Wallpaper */}
          <div style={{ marginBottom: 32 }}>
            <div style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.8)",
              fontFamily: "system-ui,sans-serif",
              marginBottom: 4,
            }}>Wallpaper</div>
            <div style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.3)",
              fontFamily: "system-ui,sans-serif",
              marginBottom: 14,
            }}>Set a custom background image for the app</div>

            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {/* Preview */}
              <div
                onClick={handleChooseImage}
                style={{
                  width: 120,
                  height: 72,
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.08)",
                  overflow: "hidden",
                  cursor: "pointer",
                  background: previewUrl ? `url(${previewUrl}) center/cover` : "rgba(255,255,255,0.03)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "border-color .2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              >
                {!previewUrl && <Image size={20} strokeWidth={1} style={{ color: "rgba(255,255,255,0.15)" }} />}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  onClick={handleChooseImage}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 7,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.7)",
                    fontSize: 12,
                    fontFamily: "system-ui,sans-serif",
                    cursor: "pointer",
                    transition: "all .2s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                >Choose Image</button>
                {localWallpaper.path && (
                  <button
                    onClick={handleRemove}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 7,
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.35)",
                      fontSize: 12,
                      fontFamily: "system-ui,sans-serif",
                      cursor: "pointer",
                      transition: "all .2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(200,80,80,0.7)"; e.currentTarget.style.borderColor = "rgba(200,80,80,0.3)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.35)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
                  >Remove</button>
                )}
              </div>
            </div>

            {localWallpaper.path && (
              <div style={{
                marginTop: 6,
                fontSize: 10,
                fontFamily: "'JetBrains Mono',monospace",
                color: "rgba(255,255,255,0.15)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {localWallpaper.path.split("/").slice(-2).join("/")}
              </div>
            )}
          </div>

          {/* Window Opacity */}
          <div style={{ marginBottom: 28 }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}>
              <div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontFamily: "system-ui,sans-serif" }}>
                  Window Opacity: {localWallpaper.opacity}
                </div>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={localWallpaper.opacity}
              onChange={handleOpacityChange}
              style={{
                width: "100%",
                height: 4,
                appearance: "none",
                borderRadius: 2,
                outline: "none",
                cursor: "pointer",
                ...sliderTrack(localWallpaper.opacity, 100),
              }}
            />
          </div>

          {/* Window Blur */}
          <div style={{ marginBottom: 28 }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}>
              <div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontFamily: "system-ui,sans-serif" }}>
                  Window Blur Radius: {localWallpaper.blur}
                </div>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={64}
              value={localWallpaper.blur}
              onChange={handleBlurChange}
              style={{
                width: "100%",
                height: 4,
                appearance: "none",
                borderRadius: 2,
                outline: "none",
                cursor: "pointer",
                ...sliderTrack(localWallpaper.blur, 64),
              }}
            />
          </div>

          {/* Accent Color */}
          <div style={{ marginBottom: 28 }}>
            <div style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.8)",
              fontFamily: "system-ui,sans-serif",
              marginBottom: 4,
            }}>Accent Color</div>
            <div style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.3)",
              fontFamily: "system-ui,sans-serif",
              marginBottom: 12,
            }}>
              {localWallpaper.accentAutoDetect ? "Auto-detected from wallpaper" : "Manually set"}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="color"
                value={localWallpaper.accentColor || "#6366f1"}
                onChange={handleAccentChange}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "transparent",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
              <span style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono',monospace",
                color: "rgba(255,255,255,0.4)",
              }}>{localWallpaper.accentColor || "#6366f1"}</span>

              <button
                onClick={handleAutoDetectToggle}
                style={{
                  marginLeft: "auto",
                  padding: "5px 10px",
                  borderRadius: 6,
                  background: localWallpaper.accentAutoDetect ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                  border: "1px solid " + (localWallpaper.accentAutoDetect ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"),
                  color: localWallpaper.accentAutoDetect ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)",
                  fontSize: 11,
                  fontFamily: "system-ui,sans-serif",
                  cursor: "pointer",
                  transition: "all .2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = localWallpaper.accentAutoDetect ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)"; }}
              >Auto-detect</button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/Settings.jsx
git commit -m "feat: create Settings component with wallpaper, opacity, blur, accent controls"
```

---

### Task 4: Add settings gear icon to Sidebar

**Files:**
- Modify: `src/components/Sidebar.jsx:2` (imports)
- Modify: `src/components/Sidebar.jsx:237-275` (footer section)

**Step 1: Add Settings icon import**

Change line 2 import to include `Settings` icon:

```javascript
import { Plus, Search, Trash2, X, FolderOpen, Settings as SettingsIcon } from "lucide-react";
```

**Step 2: Add `onOpenSettings` prop**

Change the component signature (line 5) to accept the new prop:

```javascript
export default function Sidebar({ convos, active, onSelect, onNew, onDelete, onToggleSidebar, cwd, onPickFolder, onOpenSettings }) {
```

**Step 3: Add gear icon button in the footer**

In the footer section (around line ~237-272), add a settings button next to the folder button. Replace the footer div content to add the gear icon between the folder picker and chat count:

After the `<button onClick={onPickFolder} ...>` closing tag and before the `<span>` with chat count, add:

```jsx
<button
  onClick={onOpenSettings}
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: 5,
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "rgba(255,255,255,0.28)",
    transition: "color .2s",
    padding: 0,
  }}
  onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
  onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.28)"; }}
>
  <SettingsIcon size={12} strokeWidth={1.5} />
</button>
```

**Step 4: Commit**

```bash
git add src/components/Sidebar.jsx
git commit -m "feat: add settings gear icon to sidebar footer"
```

---

### Task 5: Wire Settings into App.jsx render

**Files:**
- Modify: `src/App.jsx:1-9` (imports)
- Modify: `src/App.jsx:366-431` (render section)

**Step 1: Import Settings component**

After the existing imports (line ~8), add:

```javascript
import Settings from "./components/Settings";
```

**Step 2: Update render to conditionally show Settings or ChatArea**

In the render section, replace the `{/* Main chat area */}` block (lines ~399-413) with a conditional:

```jsx
{/* Main content: Settings or Chat */}
{showSettings ? (
  <Settings
    wallpaper={wallpaper}
    onWallpaperChange={setWallpaper}
    onClose={() => setShowSettings(false)}
  />
) : (
  <ChatArea
    convo={convo}
    onSend={handleSend}
    onCancel={handleCancel}
    onEdit={handleEdit}
    onToggleSidebar={() => setSidebarOpen((o) => !o)}
    sidebarOpen={sidebarOpen}
    onModelChange={handleModelChange}
    defaultModel={defaultModel}
    queuedMessages={queuedMessages}
    onToggleTerminal={() => terminal.setDrawerOpen((o) => !o)}
    terminalOpen={terminal.drawerOpen}
    terminalCount={terminal.sessions.length}
  />
)}
```

**Step 3: Pass `onOpenSettings` to Sidebar**

Add the prop to the `<Sidebar>` component (around line ~387):

```jsx
onOpenSettings={() => setShowSettings(true)}
```

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire Settings component into App with conditional rendering"
```

---

### Task 6: Render wallpaper background and apply transparency

**Files:**
- Modify: `src/App.jsx:366-370` (render, background layers)
- Modify: `src/App.jsx:372-386` (sidebar background styles)

**Step 1: Conditionally render wallpaper or aurora+grain**

In the render, replace lines 368-369 (`<AuroraCanvas />` and `<Grain />`) with:

```jsx
{wallpaper?.path ? (
  <div style={{
    position: "fixed",
    inset: 0,
    zIndex: 0,
    backgroundImage: `url(file://${wallpaper.path})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  }} />
) : (
  <>
    <AuroraCanvas />
    <Grain />
  </>
)}
```

**Step 2: Make sidebar background respect wallpaper opacity and blur**

Change the sidebar wrapper's inline styles (around line ~381-384) to use wallpaper settings:

```javascript
background: `rgba(0,0,0,${wallpaper?.path ? (wallpaper.opacity / 100) : 0.65})`,
backdropFilter: `blur(${wallpaper?.path ? wallpaper.blur : 56}px) saturate(1.1)`,
```

**Step 3: Pass wallpaper to ChatArea for its UI transparency**

Add `wallpaper` prop to `ChatArea`:

```jsx
<ChatArea
  ...existing props...
  wallpaper={wallpaper}
/>
```

**Step 4: Apply transparency to ChatArea elements**

In `src/components/ChatArea.jsx`, add `wallpaper` to the component props (line 9).

Update the input bar container (around line ~421-432) to use wallpaper blur/opacity:

The input bar's backdrop styles should respect wallpaper:

```javascript
backdropFilter: `blur(${wallpaper?.path ? wallpaper.blur : 20}px)`,
```

The slash command palette (around line ~381-388) similarly:

```javascript
background: wallpaper?.path ? `rgba(0,0,0,${(wallpaper.opacity / 100) * 0.95})` : "rgba(24,24,24,0.95)",
backdropFilter: `blur(${wallpaper?.path ? wallpaper.blur : 20}px)`,
```

**Step 5: Commit**

```bash
git add src/App.jsx src/components/ChatArea.jsx
git commit -m "feat: render wallpaper background and apply opacity/blur to UI chrome"
```

---

### Task 7: Add slider styling to index.css

**Files:**
- Modify: `src/index.css` (after existing styles)

**Step 1: Add range input styling**

At the end of `src/index.css`, add slider thumb styling:

```css
/* ── Range slider ── */
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 2px;
  outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}
/* ── Color input ── */
input[type="color"] {
  -webkit-appearance: none;
  border: none;
  padding: 0;
}
input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
input[type="color"]::-webkit-color-swatch {
  border: none;
  border-radius: 6px;
}
```

**Step 2: Commit**

```bash
git add src/index.css
git commit -m "style: add range slider and color input styling"
```

---

### Task 8: Test the full flow

**Step 1: Start the dev server**

```bash
cd /Users/kira-chan/Downloads/Ensue-Chat && npm run dev
```

**Step 2: Verify the flow**

1. Click the gear icon in the sidebar footer — settings panel should appear
2. Click "Choose Image" — native file dialog should open filtered to images
3. Select an image — preview thumbnail should show, aurora should be replaced by the wallpaper
4. Adjust opacity slider — sidebar and UI chrome transparency should change
5. Adjust blur slider — backdrop blur intensity should change
6. Accent color should auto-detect from the image
7. Click the color picker to manually override accent color
8. Click "Remove" — wallpaper clears, aurora returns
9. Click back arrow — returns to chat view
10. Reload the app — wallpaper settings should persist

**Step 3: Fix any issues found**

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete wallpaper and appearance settings"
```
