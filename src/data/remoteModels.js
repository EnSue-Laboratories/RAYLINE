import { MODELS } from "./models";

export const REMOTE_PROVIDER_BY_PROVIDER = {
  "remote-claude": "claude",
  "remote-codex": "codex",
};

const SSH_COMMAND_PATTERN = /^\s*ssh(?:\s|$)/i;

function normalizeSshCommand(value) {
  return typeof value === "string" ? value.trim().slice(0, 2000) : "";
}

export function isRemoteModelProvider(provider) {
  return Object.prototype.hasOwnProperty.call(REMOTE_PROVIDER_BY_PROVIDER, provider);
}

export function getRuntimeProviderForProvider(provider) {
  return REMOTE_PROVIDER_BY_PROVIDER[provider] || provider;
}

export function getRuntimeProviderForModel(model) {
  return model?.runtimeProvider || getRuntimeProviderForProvider(model?.provider);
}

export function getRemoteRuntimeConfig(model) {
  const runtime = model?.remoteRuntime;
  if (!runtime || runtime.type !== "ssh") return undefined;
  const sshCommand = normalizeSshCommand(runtime.sshCommand);
  if (!SSH_COMMAND_PATTERN.test(sshCommand)) return undefined;
  return {
    type: "ssh",
    sshCommand,
    provider: runtime.provider || getRuntimeProviderForModel(model),
    commandPath: typeof runtime.commandPath === "string" ? runtime.commandPath.trim() : "",
  };
}

function getRemoteProviderAvailability(runtime, provider, sshCommand) {
  if (!runtime || runtime.connected !== true) return null;
  if (normalizeSshCommand(runtime.sshCommand) !== sshCommand) return null;
  if (runtime[provider] !== true) return null;
  return {
    commandPath: typeof runtime[`${provider}Path`] === "string" ? runtime[`${provider}Path`].trim() : "",
  };
}

export function buildRemoteModels(sshCommand, runtime = null) {
  const normalized = normalizeSshCommand(sshCommand);
  if (!SSH_COMMAND_PATTERN.test(normalized)) return [];

  return MODELS
    .filter((model) => model.provider === "claude" || model.provider === "codex")
    .map((model) => {
      const availability = getRemoteProviderAvailability(runtime, model.provider, normalized);
      return availability ? { model, availability } : null;
    })
    .filter(Boolean)
    .map((model) => {
      const provider = `remote-${model.model.provider}`;
      return {
        ...model.model,
        id: `remote-ssh:${model.model.provider}:${model.model.id}`,
        name: `Remote ${model.model.name}`,
        tag: `SSH ${model.model.tag}`,
        provider,
        runtimeProvider: model.model.provider,
        remoteRuntime: {
          type: "ssh",
          sshCommand: normalized,
          provider: model.model.provider,
          commandPath: model.availability.commandPath,
        },
      };
    });
}
