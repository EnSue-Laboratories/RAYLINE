/**
 * Builders for models that are not in the built-in catalogue: provider-
 * upstream overrides, user-configured OpenCode models, Multica agents and
 * SSH-remote copies of built-in models. Pure functions — the renderer stores
 * (localStorage) and React hooks in src/ feed their state in.
 */

import type {
  MulticaAgent,
  MulticaStoreState,
  OpenCodeModelEntry,
  ProviderUpstreamConfig,
  RemoteRuntimeConfig,
  RemoteSshRuntimeState,
  UpstreamProviderId,
} from "../providers/types";
import {
  buildMulticaModelId,
  buildOpenCodeModelId,
  buildProviderUpstreamModelId,
  buildRemoteModelId,
  modelTag,
} from "./ids";
import type {
  BuiltinModelDefinition,
  ClaudeModelDefinition,
  CodexModelDefinition,
  MulticaModelDefinition,
  OpenCodeModelDefinition,
  OpenCodeModelRef,
  RemoteModelDefinition,
} from "./types";

/** Context window assumed for arbitrary Claude-compatible upstream models. */
export const PROVIDER_UPSTREAM_CLAUDE_CONTEXT_WINDOW = 200_000;
/**
 * Context window assumed for arbitrary Codex-compatible upstream models.
 * (Was 1_050_000; Codex reports `context_window` = 272000 for every model.)
 */
export const PROVIDER_UPSTREAM_CODEX_CONTEXT_WINDOW = 272_000;

// ── provider upstream ───────────────────────────────────────────────────────

/**
 * A model served by a user-configured upstream. Effort is left unset because
 * arbitrary backends may reject the flag.
 */
export function buildProviderUpstreamModel(
  provider: UpstreamProviderId,
  modelId: string,
): ClaudeModelDefinition | CodexModelDefinition {
  const base = {
    id: buildProviderUpstreamModelId(provider, modelId),
    name: modelId,
    tag: modelTag(modelId),
    cliFlag: modelId,
    providerOverride: true,
    efforts: [],
    defaultEffort: null,
  } as const;
  return provider === "codex"
    ? { ...base, provider: "codex", contextWindow: PROVIDER_UPSTREAM_CODEX_CONTEXT_WINDOW }
    : { ...base, provider: "claude", contextWindow: PROVIDER_UPSTREAM_CLAUDE_CONTEXT_WINDOW };
}

/** One model per entry in each active upstream's `modelList`. */
export function buildProviderUpstreamModels(
  configs: readonly (ProviderUpstreamConfig | null | undefined)[],
): (ClaudeModelDefinition | CodexModelDefinition)[] {
  const models: (ClaudeModelDefinition | CodexModelDefinition)[] = [];
  for (const config of configs) {
    if (!config) continue;
    for (const modelId of config.modelList) {
      models.push(buildProviderUpstreamModel(config.provider, modelId));
    }
  }
  return models;
}

// ── OpenCode ────────────────────────────────────────────────────────────────

/** Persisted OpenCode entry → model; null when disabled or incomplete. */
export function openCodeEntryToModel(entry: OpenCodeModelEntry | null | undefined): OpenCodeModelDefinition | null {
  const providerId = entry?.providerId.trim() ?? "";
  const modelId = entry?.modelId.trim() ?? "";
  if (!entry || !providerId || !modelId) return null;
  if (!entry.enabled) return null;

  const label = entry.label.trim() || `${providerId}/${modelId}`;
  return {
    id: buildOpenCodeModelId(providerId, modelId),
    name: label,
    tag: label.toUpperCase(),
    provider: "opencode",
    cliFlag: `${providerId}/${modelId}`,
    providerId,
    modelId,
    apiKey: entry.apiKey.trim(),
    baseURL: entry.baseURL.trim(),
    thinking: entry.thinking,
  };
}

/** Placeholder for an `opencode:` id that is not (or no longer) configured. */
export function buildOpenCodeFallbackModel(id: string, ref: OpenCodeModelRef): OpenCodeModelDefinition {
  return {
    id,
    name: `OpenCode ${ref.providerId}/${ref.modelId}`,
    tag: "OPENCODE",
    provider: "opencode",
    cliFlag: ref.cliFlag,
    providerId: ref.providerId,
    modelId: ref.modelId,
  };
}

// ── Multica ─────────────────────────────────────────────────────────────────

export function multicaAgentToModel(
  agent: MulticaAgent,
  state: Pick<MulticaStoreState, "workspaceId" | "workspaceSlug">,
): MulticaModelDefinition {
  return {
    id: buildMulticaModelId(agent.id),
    name: agent.name,
    tag: (agent.name || "agent").toUpperCase(),
    provider: "multica",
    agentId: agent.id,
    workspaceId: state.workspaceId,
    workspaceSlug: state.workspaceSlug,
    ...(agent.runtime_id !== undefined ? { runtimeId: agent.runtime_id } : {}),
    ...(agent.status !== undefined ? { status: agent.status } : {}),
  };
}

/** Placeholder for a `multica:` id whose agent is not in the current list. */
export function buildMulticaFallbackModel(id: string): MulticaModelDefinition {
  return { id, name: "Multica agent", tag: "MULTICA", provider: "multica" };
}

// ── SSH remote ──────────────────────────────────────────────────────────────

const SSH_COMMAND_PATTERN = /^\s*ssh(?:\s|$)/i;

export function normalizeSshCommand(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 2000) : "";
}

export function isSshCommand(value: unknown): boolean {
  return SSH_COMMAND_PATTERN.test(normalizeSshCommand(value));
}

/**
 * SSH-hosted copies of the built-in Claude/Codex models, limited to the CLIs
 * the last `remote-runtime-check` found on the host.
 */
export function buildRemoteModels(
  sshCommand: string,
  runtime: RemoteSshRuntimeState | null | undefined,
  baseModels: readonly BuiltinModelDefinition[],
): RemoteModelDefinition[] {
  const normalized = normalizeSshCommand(sshCommand);
  if (!SSH_COMMAND_PATTERN.test(normalized)) return [];
  if (!runtime || !runtime.connected) return [];
  if (normalizeSshCommand(runtime.sshCommand) !== normalized) return [];

  const models: RemoteModelDefinition[] = [];
  for (const model of baseModels) {
    if (model.providerOverride) continue;
    const provider = model.provider;
    const available = provider === "claude" ? runtime.claude : runtime.codex;
    if (!available) continue;
    const commandPath = (provider === "claude" ? runtime.claudePath : runtime.codexPath).trim();
    const remoteRuntime: RemoteRuntimeConfig = {
      type: "ssh",
      sshCommand: normalized,
      provider,
      commandPath,
    };
    models.push({
      ...model,
      id: buildRemoteModelId(provider, model.id),
      name: `Remote ${model.name}`,
      tag: `SSH ${model.tag}`,
      provider: provider === "claude" ? "remote-claude" : "remote-codex",
      runtimeProvider: provider,
      remoteRuntime,
      baseModelId: model.id,
    });
  }
  return models;
}

/** `remoteRuntime` to send with `agent-start` for a remote model, if valid. */
export function getRemoteRuntimeConfig(model: Pick<RemoteModelDefinition, "remoteRuntime" | "runtimeProvider">): RemoteRuntimeConfig | undefined {
  const runtime = model.remoteRuntime;
  if (runtime.type !== "ssh") return undefined;
  const sshCommand = normalizeSshCommand(runtime.sshCommand);
  if (!SSH_COMMAND_PATTERN.test(sshCommand)) return undefined;
  return {
    type: "ssh",
    sshCommand,
    provider: runtime.provider ?? model.runtimeProvider,
    commandPath: (runtime.commandPath ?? "").trim(),
  };
}
