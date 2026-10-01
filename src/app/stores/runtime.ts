/** Installed agent CLIs (`check-cli-installed`) and derived availability. */

import type { CliInstalledSnapshot, ModelProviderId } from "@shared/providers/types";
import { getRuntimeProviderForProvider } from "@shared/providers/types";
import type { ModelDefinition } from "@shared/models/types";
import { createStore } from "../../store/createStore";
import { getApi } from "../lib/api";
import { getModels } from "./models";
import { getRemoteRuntimeConfigForModel } from "../models/runtime";

export interface RuntimeState {
  cliInstalled: CliInstalledSnapshot | null;
  cliChecking: boolean;
}

export const runtimeStore = createStore<RuntimeState>({ cliInstalled: null, cliChecking: false });

const FALLBACK_INSTALLED: CliInstalledSnapshot = { claude: true, codex: true, opencode: false, grok: false, agy: false };

export async function refreshCliInstalled(options: { force?: boolean } = {}): Promise<CliInstalledSnapshot> {
  const api = getApi();
  if (!api || typeof api.checkCliInstalled !== "function") {
    runtimeStore.setState((prev) => ({ ...prev, cliInstalled: FALLBACK_INSTALLED }));
    return FALLBACK_INSTALLED;
  }
  runtimeStore.setState((prev) => ({ ...prev, cliChecking: true }));
  try {
    const result = await api.checkCliInstalled({ force: Boolean(options.force) });
    const next: CliInstalledSnapshot = {
      claude: Boolean(result.claude),
      codex: Boolean(result.codex),
      opencode: Boolean(result.opencode),
      grok: Boolean(result.grok),
      agy: Boolean(result.agy),
    };
    runtimeStore.setState((prev) => ({ ...prev, cliInstalled: next }));
    return next;
  } catch {
    runtimeStore.setState((prev) => ({ ...prev, cliInstalled: FALLBACK_INSTALLED }));
    return FALLBACK_INSTALLED;
  } finally {
    runtimeStore.setState((prev) => (prev.cliChecking ? { ...prev, cliChecking: false } : prev));
  }
}

export interface RuntimeAvailability {
  claude: boolean;
  codex: boolean;
  grok: boolean;
  agy: boolean;
  opencode: boolean;
  multica: boolean;
  remote: boolean;
  opencodeInstalled: boolean;
  anyAvailable: boolean;
}

export function computeRuntimeAvailability(input: {
  cliInstalled: CliInstalledSnapshot | null;
  openCodeInstalled: boolean;
  openCodeModelCount: number;
  multicaModelCount: number;
  remoteModelCount: number;
}): RuntimeAvailability {
  const claude = input.cliInstalled?.claude === true;
  const codex = input.cliInstalled?.codex === true;
  const grok = input.cliInstalled?.grok === true;
  const agy = input.cliInstalled?.agy === true;
  const opencodeInstalled = input.cliInstalled?.opencode === true || input.openCodeInstalled;
  const opencode = opencodeInstalled && input.openCodeModelCount > 0;
  const multica = input.multicaModelCount > 0;
  const remote = input.remoteModelCount > 0;
  return {
    claude,
    codex,
    grok,
    agy,
    opencode,
    multica,
    remote,
    opencodeInstalled,
    anyAvailable: claude || codex || grok || agy || opencode || multica || remote,
  };
}

export function getRuntimeAvailability(): RuntimeAvailability {
  const models = getModels();
  return computeRuntimeAvailability({
    cliInstalled: runtimeStore.getState().cliInstalled,
    openCodeInstalled: models.openCodeInstalled,
    openCodeModelCount: models.openCodeModels.length,
    multicaModelCount: models.multicaModels.length,
    remoteModelCount: models.remoteModels.length,
  });
}

/** False only when we know the CLI for `provider` is missing (unknown = available). */
export function isRuntimeProviderAvailable(provider: ModelProviderId, model: ModelDefinition | null = null): boolean {
  if (model && getRemoteRuntimeConfigForModel(model)) return true;
  if (!runtimeStore.getState().cliInstalled) return true;
  const availability = getRuntimeAvailability();
  const runtimeProvider = getRuntimeProviderForProvider(provider);
  switch (runtimeProvider) {
    case "claude":
      return availability.claude;
    case "codex":
      return availability.codex;
    case "opencode":
      return availability.opencode;
    case "multica":
      return availability.multica;
    case "grok":
      return availability.grok;
    case "agy":
      return availability.agy;
    default: {
      const exhaustive: never = runtimeProvider;
      return Boolean(exhaustive);
    }
  }
}
