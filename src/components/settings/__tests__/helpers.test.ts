import { describe, expect, it } from "vitest";
import type { OpenCodeModelEntry } from "@shared/providers/types";
import type { Appearance, AppearanceProfile } from "@shared/state/types";
import type { Translator } from "../../../i18n";
import {
  buildOpenCodeProviderOptions,
  clearOpenCodeDraft,
  EMPTY_UPSTREAM_CONFIG,
  filterOpenCodeProviderOptions,
  getMulticaStatusKey,
  getUpstreamStatus,
  INITIAL_OPENCODE_DRAFT,
  isOpenCodeReady,
  mergeUpstreamDrafts,
  moveHighlight,
  normalizeUpstreamDrafts,
  openCodeDraftFromModel,
  openCodeDuplicateDraft,
  remoteSshResultToStatus,
  resetAppearanceProfile,
  resolveOpenCodeApiKey,
  toOpenCodeProviderConfig,
  updateAppearanceProfile,
  validateOpenCodeDraft,
  wallpaperPathHint,
} from "../helpers";
import { sliderPct } from "../styles";
import { applyUpdaterStatus, beginUpdateCheck, INITIAL_UPDATER_STATE } from "../updater";

const t: Translator = (key, vars) => (vars ? `${key}(${Object.values(vars).map(String).join(",")})` : key);

function entry(overrides: Partial<OpenCodeModelEntry> = {}): OpenCodeModelEntry {
  return {
    id: "openrouter/foo",
    providerId: "openrouter",
    modelId: "foo",
    label: "Foo",
    apiKey: "sk-model",
    baseURL: "",
    enabled: true,
    thinking: false,
    addedAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("provider upstream drafts", () => {
  it("fills missing providers and fields with empty config", () => {
    const drafts = normalizeUpstreamDrafts({ claude: { baseURL: "https://x" } });
    expect(drafts.claude).toEqual({ ...EMPTY_UPSTREAM_CONFIG, baseURL: "https://x" });
    expect(drafts.codex).toEqual(EMPTY_UPSTREAM_CONFIG);
    expect(normalizeUpstreamDrafts(null).codex).toEqual(EMPTY_UPSTREAM_CONFIG);
  });

  it("keeps dirty drafts when the store re-syncs", () => {
    const prev = normalizeUpstreamDrafts({ claude: { apiKey: "typing" } });
    const merged = mergeUpstreamDrafts(prev, { claude: { apiKey: "stored" }, codex: { apiKey: "c" } }, { claude: true });
    expect(merged.claude.apiKey).toBe("typing");
    expect(merged.codex.apiKey).toBe("c");
  });

  it("derives status from enabled + configured", () => {
    expect(getUpstreamStatus({ ...EMPTY_UPSTREAM_CONFIG }).statusKey).toBe("settings.upstreamUsingDefault");
    expect(getUpstreamStatus({ ...EMPTY_UPSTREAM_CONFIG, enabled: true }).statusKey).toBe("settings.upstreamEnabledNoConfig");
    expect(getUpstreamStatus({ ...EMPTY_UPSTREAM_CONFIG, apiKey: "k" }).statusKey).toBe("settings.upstreamSavedDisabled");
    const active = getUpstreamStatus({ ...EMPTY_UPSTREAM_CONFIG, enabled: true, modelListText: " m " });
    expect(active).toMatchObject({ activeOverride: true, configured: true, statusKey: "settings.upstreamConfigured" });
    expect(getUpstreamStatus({ ...EMPTY_UPSTREAM_CONFIG, baseURL: "   " }).configured).toBe(false);
  });
});

describe("multica status", () => {
  it("walks not-configured → server → authenticated → connected", () => {
    const base = { token: "", serverUrl: "", workspaceId: "", workspaceSlug: "" };
    expect(getMulticaStatusKey(base)).toBe("settings.multicaNotConfigured");
    expect(getMulticaStatusKey({ ...base, serverUrl: "https://m" })).toBe("settings.multicaServerConfigured");
    expect(getMulticaStatusKey({ ...base, serverUrl: "https://m", token: "t" })).toBe("settings.multicaAuthenticatedNoWorkspace");
    expect(getMulticaStatusKey({ ...base, serverUrl: "https://m", token: "t", workspaceSlug: "w" })).toBe("settings.multicaConnected");
  });
});

describe("remote SSH status", () => {
  it("lists detected runtimes or warns when none", () => {
    expect(remoteSshResultToStatus({ ok: true, claude: true, codex: true }, t)).toEqual({
      kind: "success",
      text: "settings.remoteSshConnected(Claude Code, Codex)",
    });
    expect(remoteSshResultToStatus({ ok: true }, t).kind).toBe("warning");
  });

  it("maps known error codes and appends unknown errors", () => {
    expect(remoteSshResultToStatus({ ok: false, error: "required" }, t).text).toBe("settings.remoteSshCommandRequired");
    expect(remoteSshResultToStatus({ ok: false, error: "invalid" }, t).text).toBe("settings.remoteSshCommandInvalid");
    expect(remoteSshResultToStatus({ ok: false, error: "boom" }, t).text).toBe("settings.remoteSshFailed boom");
    expect(remoteSshResultToStatus(undefined, t)).toEqual({ kind: "error", text: "settings.remoteSshFailed" });
  });
});

describe("OpenCode form", () => {
  it("validates required fields and duplicate collisions", () => {
    expect(validateOpenCodeDraft({ ...INITIAL_OPENCODE_DRAFT, modelId: " " }, "")).toEqual({
      ok: false,
      errorKey: "settings.opencodeMissingModel",
    });
    expect(validateOpenCodeDraft({ ...INITIAL_OPENCODE_DRAFT, modelId: "foo" }, "openrouter/foo")).toEqual({
      ok: false,
      errorKey: "settings.opencodeDuplicateConflict",
    });
    expect(validateOpenCodeDraft({ ...INITIAL_OPENCODE_DRAFT, providerId: " a ", modelId: " b " }, "")).toEqual({
      ok: true,
      providerId: "a",
      modelId: "b",
      modelKey: "a/b",
    });
  });

  it("never echoes a stored key into the edit form, but keeps it on save", () => {
    const model = entry();
    const draft = openCodeDraftFromModel(model);
    expect(draft.apiKey).toBe("");
    expect(resolveOpenCodeApiKey(draft, model.id, [model], model.id)).toBe("sk-model");
    expect(resolveOpenCodeApiKey(draft, "", [model], model.id)).toBe("");
    expect(resolveOpenCodeApiKey({ ...draft, apiKey: "new" }, model.id, [model], model.id)).toBe("new");
  });

  it("duplicates with a (copy) label and provider-config fallbacks", () => {
    const copy = openCodeDuplicateDraft(entry({ apiKey: "", baseURL: "" }), { apiKey: "sk-provider", baseURL: "https://p" });
    expect(copy).toMatchObject({ label: "Foo (copy)", apiKey: "sk-provider", baseURL: "https://p" });
    expect(openCodeDuplicateDraft(entry({ label: "" }), { apiKey: "", baseURL: "" }).label).toBe("");
  });

  it("narrows malformed provider config results", () => {
    expect(toOpenCodeProviderConfig(null)).toEqual({ apiKey: "", baseURL: "" });
    expect(toOpenCodeProviderConfig({ apiKey: 3, baseURL: "u" })).toEqual({ apiKey: "", baseURL: "u" });
  });

  it("clears the draft but remembers the provider", () => {
    expect(clearOpenCodeDraft({ ...INITIAL_OPENCODE_DRAFT, providerId: "anthropic", modelId: "x", thinking: true })).toEqual({
      ...INITIAL_OPENCODE_DRAFT,
      providerId: "anthropic",
    });
  });

  it("builds a sorted, de-duplicated provider list and filters it", () => {
    const options = buildOpenCodeProviderOptions(["zai", " openai "], ["openai", ""]);
    expect(options).toEqual(["openai", "openrouter", "zai"]);
    expect(filterOpenCodeProviderOptions(options, "OPEN")).toEqual(["openai", "openrouter"]);
    const many = Array.from({ length: 20 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    expect(filterOpenCodeProviderOptions(many, "")).toHaveLength(12);
  });

  it("clamps combobox highlight movement", () => {
    expect(moveHighlight(0, -1, 3)).toBe(0);
    expect(moveHighlight(2, 1, 3)).toBe(2);
    expect(moveHighlight(1, 1, 3)).toBe(2);
    expect(moveHighlight(4, 1, 0)).toBe(0);
  });

  it("is ready when configured or any model carries credentials", () => {
    expect(isOpenCodeReady(false, [])).toBe(false);
    expect(isOpenCodeReady(false, [{ apiKey: "", baseURL: "https://x" }])).toBe(true);
    expect(isOpenCodeReady(true, [])).toBe(true);
  });
});

describe("appearance profile edits", () => {
  const profile: AppearanceProfile = {
    palette: {
      background: "#000000",
      pane: "#000000",
      surface: "#111111",
      surfaceStrong: "#222222",
      border: "#FFFFFF",
      accent: "#FFFFFF",
      success: "#00FF00",
      danger: "#FF0000",
      warning: "#FFFF00",
      text: "#FFFFFF",
    },
    typography: { uiFont: "a", contentFont: "b", monoFont: "c" },
  };
  const appearance: Appearance = { version: 3, profiles: { dark: profile, light: profile } };

  it("updates one key of one theme without mutating the input", () => {
    const next = updateAppearanceProfile(appearance, "dark", { section: "palette", key: "accent", value: "#123456" });
    expect(next.profiles.dark.palette.accent).toBe("#123456");
    expect(next.profiles.light.palette.accent).toBe("#FFFFFF");
    expect(appearance.profiles.dark.palette.accent).toBe("#FFFFFF");
    const font = updateAppearanceProfile(appearance, "light", { section: "typography", key: "monoFont", value: "Menlo" });
    expect(font.profiles.light.typography.monoFont).toBe("Menlo");
  });

  it("resets a single theme to defaults", () => {
    const defaults: Appearance = { version: 3, profiles: { dark: { ...profile, typography: { ...profile.typography, uiFont: "d" } }, light: profile } };
    expect(resetAppearanceProfile(appearance, "dark", defaults).profiles.dark.typography.uiFont).toBe("d");
  });
});

describe("misc", () => {
  it("shows the last two wallpaper path segments", () => {
    expect(wallpaperPathHint("/Users/me/Pictures/bg.png")).toBe("Pictures/bg.png");
    expect(wallpaperPathHint("C:\\pics\\bg.png")).toBe("pics/bg.png");
    expect(wallpaperPathHint(null)).toBeNull();
  });

  it("clamps slider percentages", () => {
    expect(sliderPct(16, 0, 32)).toBe(50);
    expect(sliderPct(100, 30, 100)).toBe(100);
    expect(sliderPct(-5, 0, 10)).toBe(0);
    expect(sliderPct(5, 5, 5)).toBe(0);
  });
});

describe("updater state", () => {
  it("keeps version / percent / error sticky across phases", () => {
    let state = applyUpdaterStatus(INITIAL_UPDATER_STATE, { phase: "available", version: "1.2.3" });
    state = applyUpdaterStatus(state, { phase: "downloading", percent: 40 });
    expect(state).toMatchObject({ phase: "downloading", version: "1.2.3", percent: 40 });
    state = applyUpdaterStatus(state, { phase: "error", error: "net" });
    expect(state.error).toBe("net");
    expect(beginUpdateCheck(state).error).toBeNull();
    expect(applyUpdaterStatus(state, { phase: "idle" }).phase).toBe("idle");
  });
});
