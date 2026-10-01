import { describe, expect, it } from "vitest";
import { describeError, multicaSetupTitle, normalizeMulticaWorkspaces } from "../multicaSetup";
import { getPrimaryAction, primaryActionLabel, providerStatusLabel } from "../runtimeSetup";

describe("runtime setup actions", () => {
  const codex = { id: "codex" } as const;
  const opencode = { id: "opencode" } as const;

  it("installs missing runtimes and signs in to installed ones", () => {
    expect(getPrimaryAction(codex, null)).toBe("install");
    expect(getPrimaryAction(codex, { installed: { codex: true } })).toBe("signin");
    expect(primaryActionLabel("install", codex)).toBe("Install and sign in");
    expect(primaryActionLabel("install", opencode)).toBe("Install");
    expect(providerStatusLabel(codex, { installed: { codex: false } })).toBe("Not installed");
  });

  it("asks installed OpenCode for a provider until one is configured", () => {
    const state = { installed: { opencode: true }, opencodeConfigured: false };
    expect(getPrimaryAction(opencode, state)).toBe("configure");
    expect(providerStatusLabel(opencode, state)).toBe("Installed, needs provider");
    expect(getPrimaryAction(opencode, { ...state, opencodeConfigured: true })).toBe("signin");
  });
});

describe("multica setup", () => {
  it("accepts both workspace list shapes", () => {
    const ws = { id: "1", slug: "one" };
    expect(normalizeMulticaWorkspaces([ws])).toEqual([ws]);
    expect(normalizeMulticaWorkspaces({ workspaces: [ws] })).toEqual([ws]);
    expect(normalizeMulticaWorkspaces({})).toEqual([]);
    expect(normalizeMulticaWorkspaces(null)).toEqual([]);
  });

  it("describes unknown errors", () => {
    expect(describeError(new Error("nope"))).toBe("nope");
    expect(describeError({ message: "ipc" })).toBe("ipc");
    expect(describeError("raw")).toBe("raw");
  });

  it("titles each step", () => {
    expect(multicaSetupTitle("verify")).toBe("Verify email");
  });
});
