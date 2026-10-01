import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROVIDER_UPSTREAM_CODEX_CONTEXT_WINDOW, PROVIDER_UPSTREAM_CLAUDE_CONTEXT_WINDOW } from "@shared/models";
import { createMemoryStorage } from "../../data/__tests__/memoryStorage";
import {
  buildProviderUpstreamModels,
  clearProviderUpstreamConfig,
  getProviderUpstreamConfig,
  getProviderUpstreamsStore,
  loadProviderUpstreamsState,
  normalizeProviderConfig,
  parseModelList,
  sanitizeProviderUpstreamsState,
  saveProviderUpstreamConfig,
} from "../store";

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: createMemoryStorage() });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provider upstream config", () => {
  it("parses model lists", () => {
    expect(parseModelList(" a, b\n\nc ,")).toEqual(["a", "b", "c"]);
  });

  it("normalizes legacy shapes and infers enabled", () => {
    expect(normalizeProviderConfig({ baseUrl: " http://x ", models: ["m1", " m2 "] })).toEqual({
      enabled: true,
      baseURL: "http://x",
      apiKey: "",
      modelListText: "m1\nm2",
    });
    expect(normalizeProviderConfig({ enabled: false, model: "m" }).enabled).toBe(false);
    expect(normalizeProviderConfig(null).enabled).toBe(false);
  });

  it("migrates the old profile list", () => {
    const state = sanitizeProviderUpstreamsState({
      profiles: [
        { id: "1", provider: "codex", baseURL: "http://a", model: "x" },
        { id: "2", provider: "codex", baseURL: "http://b", model: "y" },
      ],
      activeByProvider: { codex: "2" },
    });
    expect(state.providers.codex).toMatchObject({ enabled: true, baseURL: "http://b", modelListText: "y" });
    expect(state.providers.claude.enabled).toBe(false);
  });

  it("returns an active config only when enabled and non-empty", () => {
    const state = sanitizeProviderUpstreamsState({
      providers: { claude: { enabled: true, modelListText: "a,b" }, codex: { enabled: true } },
    });
    expect(getProviderUpstreamConfig("CLAUDE", state)).toEqual({ provider: "claude", baseURL: "", apiKey: "", modelList: ["a", "b"] });
    expect(getProviderUpstreamConfig("codex", state)).toBeNull();
    expect(getProviderUpstreamConfig("opencode", state)).toBeNull();
  });
});

describe("override models", () => {
  it("uses the registry context windows (no hardcoded 1_050_000)", () => {
    const state = sanitizeProviderUpstreamsState({
      providers: { claude: { modelListText: "c1" }, codex: { modelListText: "org/x-1" } },
    });
    const models = buildProviderUpstreamModels(state);
    expect(models.map((m) => [m.id, m.contextWindow, m.tag])).toEqual([
      ["provider-upstream:claude:c1", PROVIDER_UPSTREAM_CLAUDE_CONTEXT_WINDOW, "C1"],
      ["provider-upstream:codex:org/x-1", PROVIDER_UPSTREAM_CODEX_CONTEXT_WINDOW, "X-1"],
    ]);
    expect(models.every((m) => m.providerOverride)).toBe(true);
  });
});

describe("persistence + shared store", () => {
  it("saves, clears and syncs the shared store", () => {
    saveProviderUpstreamConfig("codex", { enabled: true, baseURL: "http://z", modelListText: "m" });
    expect(loadProviderUpstreamsState().providers.codex).toMatchObject({ enabled: true, baseURL: "http://z" });
    expect(getProviderUpstreamsStore().getState()).toEqual(loadProviderUpstreamsState());
    clearProviderUpstreamConfig("codex");
    expect(getProviderUpstreamsStore().getState().providers.codex.enabled).toBe(false);
    expect(saveProviderUpstreamConfig("bogus", { enabled: true })).toEqual(loadProviderUpstreamsState());
  });
});
