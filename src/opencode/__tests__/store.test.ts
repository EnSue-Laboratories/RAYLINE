import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStorage } from "../../data/__tests__/memoryStorage";
import {
  getOpenCodeStore,
  inferThinkingDefault,
  loadOpenCodeState,
  openCodeEntryToModel,
  removeOpenCodeModel,
  sanitizeOpenCodeState,
  upsertOpenCodeModel,
} from "../store";

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: createMemoryStorage() });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sanitizeOpenCodeState", () => {
  it("drops invalid and duplicate entries and accepts legacy aliases", () => {
    const state = sanitizeOpenCodeState({
      models: [
        { provider: " openrouter ", model: "deepseek-r1", label: " R1 " },
        { providerId: "openrouter", modelId: "deepseek-r1" },
        { providerId: "x" },
        "junk",
      ],
    });
    expect(state.models).toHaveLength(1);
    expect(state.models[0]).toMatchObject({
      id: "openrouter/deepseek-r1",
      label: "R1",
      enabled: true,
      thinking: true,
    });
    expect(sanitizeOpenCodeState(null)).toEqual({ models: [] });
  });

  it("infers thinking for reasoning model families", () => {
    expect(inferThinkingDefault("deepseek", "deepseek-reasoner")).toBe(true);
    expect(inferThinkingDefault("qwen", "qwen3-coder")).toBe(true);
    expect(inferThinkingDefault("openai", "gpt-4o")).toBe(false);
  });
});

describe("persistence + shared store", () => {
  it("upserts (keeping addedAt), removes, and keeps the store in sync", () => {
    const store = getOpenCodeStore();
    upsertOpenCodeModel({ providerId: "p", modelId: "m", label: "one", addedAt: 5 });
    const added = loadOpenCodeState().models[0];
    expect(added?.addedAt).toBe(5);
    expect(store.getState().models).toEqual(loadOpenCodeState().models);

    upsertOpenCodeModel({ providerId: "p", modelId: "m", label: "two" });
    expect(loadOpenCodeState().models).toHaveLength(1);
    expect(loadOpenCodeState().models[0]).toMatchObject({ label: "two", addedAt: 5 });

    removeOpenCodeModel("p/m");
    expect(loadOpenCodeState().models).toEqual([]);
    expect(store.getState().models).toEqual([]);
  });

  it("maps enabled entries to picker models", () => {
    const [entry] = sanitizeOpenCodeState({ models: [{ providerId: "p", modelId: "m" }] }).models;
    expect(entry && openCodeEntryToModel(entry)).toMatchObject({ id: "opencode:p/m", provider: "opencode", cliFlag: "p/m" });
    expect(entry && openCodeEntryToModel({ ...entry, enabled: false })).toBeNull();
  });
});
