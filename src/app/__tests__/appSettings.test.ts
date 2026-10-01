import { describe, expect, it } from "vitest";
import { createDefaultSettings, settingsFromPersisted, toPersistedSettings } from "../../store/appSettings";
import { normalizeProjectsMeta } from "../conversation/paths";

describe("app settings persistence", () => {
  it("normalizes persisted values and migrates legacy fields", () => {
    const next = settingsFromPersisted(
      {
        defaultModel: "gpt54-high",
        appBlur: 99,
        appOpacity: 5,
        sidebarActiveOpacity: -3,
        language: "zh",
        remoteSshCommand: "ssh host",
        remoteSshRuntime: { sshCommand: "ssh host", connected: true, claude: true, codex: false, claudePath: " /bin/claude ", codexPath: "", checkedAt: 7 },
        projects: { "/r/.worktrees/x": { name: "x" } },
        wallpaper: { path: "/w.png", imgBlur: 50, imgOpacity: 80 },
      },
      createDefaultSettings(),
      normalizeProjectsMeta,
    );
    expect(next).toMatchObject({
      defaultModel: "gpt-6-astra",
      appBlur: 20,
      appOpacity: 30,
      sidebarActiveOpacity: 0,
      locale: "zh-CN",
      remoteSshCommand: "ssh host",
      projects: { "/r": { name: "r", manual: false } },
    });
    expect(next.remoteSshRuntime.claudePath).toBe("/bin/claude");
    expect(next.wallpaper).toMatchObject({ path: "/w.png", imgBlur: 32, imgOpacity: 80 });
  });

  it("persists the wallpaper without its data URL", () => {
    const settings = { ...createDefaultSettings(), wallpaper: { path: "/w.png", dataUrl: "data:big", imgBlur: 3, imgOpacity: 100 } };
    expect(toPersistedSettings(settings).wallpaper).toEqual({ path: "/w.png", imgBlur: 3, imgOpacity: 100 });
  });
});
