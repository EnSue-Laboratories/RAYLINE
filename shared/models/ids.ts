/**
 * Model-id prefix helpers. Pure string functions with no catalogue
 * dependency, so both the registry and the dynamic-model builders can use
 * them without import cycles.
 *
 * Id namespaces:
 *  - built-in:           `sonnet`, `opus-1m`, `gpt-6-astra`, ...
 *  - provider upstream:  `provider-upstream:<claude|codex>:<modelId>`
 *  - OpenCode:           `opencode:<providerId>/<modelId>`
 *  - Multica:            `multica:<agentId>`
 *  - SSH remote:         `remote-ssh:<claude|codex>:<builtinId>`
 */

import type { OpenCodeModelRef, ProviderUpstreamModelRef, RemoteModelRef } from "./types";

export const PROVIDER_UPSTREAM_PREFIX = "provider-upstream:";
export const OPENCODE_PREFIX = "opencode:";
export const MULTICA_PREFIX = "multica:";
export const REMOTE_SSH_PREFIX = "remote-ssh:";

/** Uppercase badge derived from a raw model id (`org/foo-1.5` → `FOO-1.5`). */
export function modelTag(modelId: string | null | undefined): string {
  const raw = String(modelId ?? "");
  const compact = raw.split("/").pop() || raw;
  return (compact || "model").replace(/[^a-z0-9._-]+/gi, " ").trim().toUpperCase() || "MODEL";
}

// ── provider-upstream ───────────────────────────────────────────────────────

export function isProviderUpstreamModelId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith(PROVIDER_UPSTREAM_PREFIX);
}

export function buildProviderUpstreamModelId(provider: ProviderUpstreamModelRef["provider"], modelId: string): string {
  return `${PROVIDER_UPSTREAM_PREFIX}${provider}:${modelId}`;
}

export function parseProviderUpstreamModelId(id: unknown): ProviderUpstreamModelRef | null {
  if (!isProviderUpstreamModelId(id)) return null;
  const value = id.slice(PROVIDER_UPSTREAM_PREFIX.length);
  const splitIndex = value.indexOf(":");
  if (splitIndex <= 0 || splitIndex >= value.length - 1) return null;
  const provider = value.slice(0, splitIndex);
  const modelId = value.slice(splitIndex + 1);
  if (provider !== "claude" && provider !== "codex") return null;
  return { provider, modelId };
}

// ── Multica ─────────────────────────────────────────────────────────────────

export function isMulticaModelId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith(MULTICA_PREFIX);
}

export function buildMulticaModelId(agentId: string): string {
  return `${MULTICA_PREFIX}${agentId}`;
}

/** `multica:<agentId>` → `<agentId>`; "" when the id is not a Multica id. */
export function getMulticaAgentIdFromModelId(id: unknown): string {
  const parts = (typeof id === "string" ? id : "").split(":");
  return parts.length === 2 && parts[0] === "multica" && parts[1] ? parts[1] : "";
}

// ── OpenCode ────────────────────────────────────────────────────────────────

export function isOpenCodeModelId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith(OPENCODE_PREFIX);
}

export function buildOpenCodeModelId(providerId: string, modelId: string): string {
  return `${OPENCODE_PREFIX}${providerId}/${modelId}`;
}

export function parseOpenCodeModelId(id: unknown): OpenCodeModelRef | null {
  if (!isOpenCodeModelId(id)) return null;
  const value = id.slice(OPENCODE_PREFIX.length).trim();
  const slashIndex = value.indexOf("/");
  if (slashIndex <= 0 || slashIndex >= value.length - 1) return null;
  return {
    providerId: value.slice(0, slashIndex),
    modelId: value.slice(slashIndex + 1),
    cliFlag: value,
  };
}

// ── SSH remote ──────────────────────────────────────────────────────────────

export function isRemoteModelId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith(REMOTE_SSH_PREFIX);
}

export function buildRemoteModelId(provider: RemoteModelRef["provider"], baseModelId: string): string {
  return `${REMOTE_SSH_PREFIX}${provider}:${baseModelId}`;
}

export function parseRemoteModelId(id: unknown): RemoteModelRef | null {
  if (!isRemoteModelId(id)) return null;
  const value = id.slice(REMOTE_SSH_PREFIX.length);
  const splitIndex = value.indexOf(":");
  if (splitIndex <= 0 || splitIndex >= value.length - 1) return null;
  const provider = value.slice(0, splitIndex);
  const baseModelId = value.slice(splitIndex + 1);
  if (provider !== "claude" && provider !== "codex") return null;
  return { provider, baseModelId };
}
