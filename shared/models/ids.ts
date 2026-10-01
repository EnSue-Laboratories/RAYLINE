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
 *  - Grok:               `<slug>` (`grok-4.7`), `grok-default` = CLI default
 *  - Antigravity:        `agy:<slug>`, `agy:default` = CLI default
 *  - Codex (discovered): `codex-model:<encodeURIComponent(slug)>` for slugs
 *                        that are not in the static catalogue (static Codex
 *                        ids equal the slug). PR #230's
 *                        `codex-model:<slug>:<effort>` is a legacy form.
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

// ── Grok ────────────────────────────────────────────────────────────────────

/** Grok entry that omits `--model` and lets the CLI pick its default. */
export const GROK_DEFAULT_MODEL_ID = "grok-default";

const GROK_SLUG_PATTERN = /^grok-[a-z0-9._-]+$/i;

/** Valid `grok models` slug (`grok-4.7`, `grok-build-0.1`). */
export function isGrokSlug(value: unknown): value is string {
  return typeof value === "string" && GROK_SLUG_PATTERN.test(value);
}

/** Grok ids are the slug itself (plus `grok-default`). */
export function isGrokModelId(id: unknown): id is string {
  return isGrokSlug(id);
}

// ── Antigravity (agy) ───────────────────────────────────────────────────────

export const AGY_PREFIX = "agy:";
/** AGY entry that omits `--model` and lets the CLI pick its default. */
export const AGY_DEFAULT_MODEL_ID = "agy:default";

const AGY_SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

/** Valid `agy models` slug. */
export function isAgySlug(value: unknown): value is string {
  return typeof value === "string" && AGY_SLUG_PATTERN.test(value);
}

export function isAgyModelId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith(AGY_PREFIX) && isAgySlug(id.slice(AGY_PREFIX.length));
}

export function buildAgyModelId(slug: string): string {
  return `${AGY_PREFIX}${slug}`;
}

/** Parsed `agy:<slug>`; `cliFlag` is "" for `agy:default`. */
export interface AgyModelRef {
  slug: string;
  cliFlag: string;
}

export function parseAgyModelId(id: unknown): AgyModelRef | null {
  if (!isAgyModelId(id)) return null;
  const slug = id.slice(AGY_PREFIX.length);
  return { slug, cliFlag: id === AGY_DEFAULT_MODEL_ID ? "" : slug };
}

// ── Codex runtime-catalog models ────────────────────────────────────────────

export const CODEX_MODEL_PREFIX = "codex-model:";

/** Plausible Codex slug: non-empty, ≤ 200 chars, no whitespace / control chars. */
export function isCodexSlug(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && !/[\s\u0000-\u001f\u007f]/.test(value);
}

export function isCodexRuntimeModelId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith(CODEX_MODEL_PREFIX);
}

/** Id for a discovered Codex slug that has no static catalogue entry. */
export function buildCodexRuntimeModelId(slug: string): string {
  return `${CODEX_MODEL_PREFIX}${encodeURIComponent(slug)}`;
}

/**
 * Parsed `codex-model:<slug>` or legacy `codex-model:<slug>:<effort>`.
 * `effort` is the raw (unvalidated) PR #230 suffix, or null.
 */
export interface CodexRuntimeModelRef {
  slug: string;
  effort: string | null;
}

export function parseCodexRuntimeModelId(id: unknown): CodexRuntimeModelRef | null {
  if (!isCodexRuntimeModelId(id)) return null;
  const parts = id.slice(CODEX_MODEL_PREFIX.length).split(":");
  if (parts.length < 1 || parts.length > 2) return null;
  const [encoded = "", effort] = parts;
  let slug: string;
  try {
    slug = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  if (!isCodexSlug(slug)) return null;
  return { slug, effort: effort ? effort : null };
}
