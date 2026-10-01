import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStorage } from "../../data/__tests__/memoryStorage";
import {
  clearMulticaState,
  getMulticaStore,
  isMulticaAuthenticated,
  loadMulticaState,
  normalizeMulticaAgents,
  normalizeMulticaServerUrl,
  sanitizeMulticaState,
  saveMulticaState,
} from "../store";

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("multica store", () => {
  it("normalizes server urls", () => {
    expect(normalizeMulticaServerUrl(" https://x.dev/// ")).toBe("https://x.dev");
    expect(normalizeMulticaServerUrl(3)).toBe("");
  });

  it("clears credentials without a server and drops the legacy default server", () => {
    expect(sanitizeMulticaState({ token: "t", workspaceId: "w", agentsCache: [{ id: "a" }] })).toMatchObject({
      token: "",
      workspaceId: "",
      agentsCache: [],
    });
    expect(sanitizeMulticaState({ serverUrl: "https://srv1309901.tail96f1f.ts.net" }).serverUrl).toBe("");
  });

  it("keeps only well-formed agents", () => {
    expect(normalizeMulticaAgents([{ id: "a", name: "A", status: "online", extra: 1 }, { name: "no id" }, null])).toEqual([
      { id: "a", name: "A", status: "online" },
    ]);
    expect(normalizeMulticaAgents("nope")).toEqual([]);
  });

  it("is importable and usable without side effects; saves sync the shared store", () => {
    expect(isMulticaAuthenticated()).toBe(false);
    const saved = saveMulticaState({ serverUrl: "https://m.dev/", token: "t", workspaceSlug: "ws" });
    expect(saved.serverUrl).toBe("https://m.dev");
    expect(isMulticaAuthenticated()).toBe(true);
    expect(getMulticaStore().getState()).toEqual(loadMulticaState());
    clearMulticaState();
    expect(isMulticaAuthenticated()).toBe(false);
    expect(getMulticaStore().getState().token).toBe("");
  });
});
