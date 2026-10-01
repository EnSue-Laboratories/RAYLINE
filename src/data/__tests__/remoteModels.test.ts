import { describe, expect, it } from "vitest";
import { MODELS } from "@shared/models";
import type { RemoteSshRuntimeState } from "@shared/providers/types";
import {
  buildRemoteModels,
  getRemoteRuntimeConfig,
  getRuntimeProviderForModel,
  getRuntimeProviderForProvider,
  isRemoteModelProvider,
} from "../remoteModels";

const runtime: RemoteSshRuntimeState = {
  sshCommand: "ssh dev@box",
  connected: true,
  claude: true,
  codex: false,
  claudePath: " /usr/bin/claude ",
  codexPath: "",
  checkedAt: 1,
};

describe("remote models", () => {
  it("builds SSH copies for CLIs found on the host", () => {
    const models = buildRemoteModels(" ssh dev@box ", runtime);
    const claudeCount = MODELS.filter((m) => m.provider === "claude").length;
    expect(models).toHaveLength(claudeCount);
    const first = models[0];
    expect(first?.id).toBe(`remote-ssh:claude:${MODELS[0]?.id}`);
    expect(first?.provider).toBe("remote-claude");
    expect(first?.remoteRuntime).toEqual({ type: "ssh", sshCommand: "ssh dev@box", provider: "claude", commandPath: "/usr/bin/claude" });
  });

  it("builds nothing for non-ssh commands, disconnected or mismatched runtimes", () => {
    expect(buildRemoteModels("mosh box", runtime)).toEqual([]);
    expect(buildRemoteModels("ssh dev@box", { ...runtime, connected: false })).toEqual([]);
    expect(buildRemoteModels("ssh other", runtime)).toEqual([]);
    expect(buildRemoteModels("ssh dev@box")).toEqual([]);
  });

  it("maps providers and runtime configs", () => {
    const [remote] = buildRemoteModels("ssh dev@box", runtime);
    expect(getRuntimeProviderForModel(remote)).toBe("claude");
    expect(getRemoteRuntimeConfig(remote)?.sshCommand).toBe("ssh dev@box");
    expect(getRemoteRuntimeConfig(MODELS[0])).toBeUndefined();
    expect(getRemoteRuntimeConfig(null)).toBeUndefined();
    expect(getRuntimeProviderForProvider("remote-codex")).toBe("codex");
    expect(getRuntimeProviderForProvider("opencode")).toBe("opencode");
    expect(getRuntimeProviderForProvider(undefined)).toBeUndefined();
    expect(getRuntimeProviderForModel(undefined)).toBeUndefined();
    expect(isRemoteModelProvider("remote-claude")).toBe(true);
    expect(isRemoteModelProvider("claude")).toBe(false);
  });
});
