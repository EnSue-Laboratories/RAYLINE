/**
 * Built-in model catalogue + id resolution.
 *
 * ── Id scheme (changed 2026-10) ─────────────────────────────────────────────
 * Model ids identify a *model*, not a model+effort pair. Reasoning effort is a
 * separate per-conversation setting (`conversation.effort`, see
 * shared/chat/types.ts) validated against `model.efforts` and defaulting to
 * `model.defaultEffort`. Rationale: with Claude (5 levels) and Codex (up to 6
 * levels) across 12 models, baking effort into ids would need ~60 entries.
 *
 * Built-in ids:
 *   Claude: fable, fable-1m, opus, opus-1m, sonnet, haiku
 *   Codex:  gpt-6-astra, gpt-6.1-sol, gpt-5.6-sol, gpt-5.6-terra,
 *           gpt-5.6-luna, gpt-5.5   (Codex ids equal the CLI slug)
 *
 * Backward compatibility — persisted ids keep resolving via LEGACY_MODEL_ALIASES:
 *   gpt55-med | gpt55-high | gpt55-xhigh → gpt-5.5 + effort medium|high|xhigh
 *   gpt54-med | gpt54-high | gpt54-xhigh → gpt-6-astra + effort medium|high|xhigh
 *                                           (gpt-5.4 left Codex on 2026-08-31)
 *   gpt-5.4                              → gpt-6-astra
 *   claude-opus / claude-sonnet (demo ids) → opus / sonnet
 *   haiku                                → haiku (live again: Haiku 4.5; it was
 *                                           previously aliased to `sonnet`)
 *   opus, opus-1m, sonnet                → unchanged
 *   remote-ssh:<p>:<legacy id>           → remote-ssh:<p>:<current id>
 * Use `normalizeModelSelection()` (not `normalizeModelId()`) when migrating
 * persisted conversations so the effort encoded in a legacy id is kept.
 *
 * Sources: docs/refactor/cli-models-research.md (Claude Code 2.1.287,
 * Codex 0.153.4 local catalog + docs, fetched 2026-10-01).
 */

import { buildMulticaFallbackModel, buildOpenCodeFallbackModel, buildProviderUpstreamModel } from "./dynamic-models";
import {
  buildRemoteModelId,
  isMulticaModelId,
  isOpenCodeModelId,
  isProviderUpstreamModelId,
  parseOpenCodeModelId,
  parseProviderUpstreamModelId,
  parseRemoteModelId,
} from "./ids";
import {
  CLAUDE_EFFORT_LEVELS,
  EFFORT_LEVELS,
  isClaudeEffortLevel,
  isEffortLevel,
  type BuiltinModelDefinition,
  type ClaudeEffortLevel,
  type ClaudeModelDefinition,
  type CodexEffortLevel,
  type CodexModelDefinition,
  type EffortLevel,
  type LegacyModelAlias,
  type ModelDefinition,
  type ModelSelection,
} from "./types";

export const DEFAULT_MODEL_ID = "sonnet";

/** Codex reports `context_window` = 272000 for every current model. */
export const CODEX_CONTEXT_WINDOW = 272_000;
export const CLAUDE_1M_CONTEXT_WINDOW = 1_000_000;
export const CLAUDE_200K_CONTEXT_WINDOW = 200_000;

const CODEX_LOW_TO_ULTRA: readonly CodexEffortLevel[] = ["low", "medium", "high", "xhigh", "max", "ultra"];
const CODEX_LOW_TO_MAX: readonly CodexEffortLevel[] = ["low", "medium", "high", "xhigh", "max"];
const CODEX_LOW_TO_XHIGH: readonly CodexEffortLevel[] = ["low", "medium", "high", "xhigh"];

// ── Claude (aliases resolved by Claude Code; effort via `--effort`) ─────────
// Context windows: platform docs list Fable 5.1, Opus 5.5 and Sonnet 5.5 as
// 1M. The Claude Code model-config page claims Opus 5.5 is 200K without
// `[1m]` (disputed, unresolved) — we follow the research doc and treat it as
// 1M. The `[1m]` variants are kept so users can force the 1M alias.

const SONNET: ClaudeModelDefinition = {
  id: "sonnet",
  name: "Claude Sonnet",
  tag: "SONNET",
  provider: "claude",
  cliFlag: "sonnet",
  // Sonnet 5.5 is natively 1M; `sonnet[1m]` is a no-op so there is no -1m entry.
  contextWindow: CLAUDE_1M_CONTEXT_WINDOW,
  efforts: CLAUDE_EFFORT_LEVELS,
  defaultEffort: "high",
  lifecycle: "current",
};

const CLAUDE_MODELS: readonly ClaudeModelDefinition[] = [
  {
    id: "fable",
    name: "Claude Fable",
    tag: "FABLE",
    provider: "claude",
    cliFlag: "fable",
    contextWindow: CLAUDE_1M_CONTEXT_WINDOW,
    efforts: CLAUDE_EFFORT_LEVELS,
    defaultEffort: "high",
    lifecycle: "current",
  },
  {
    id: "fable-1m",
    name: "Claude Fable (1M)",
    tag: "FABLE 1M",
    provider: "claude",
    cliFlag: "fable[1m]",
    contextWindow: CLAUDE_1M_CONTEXT_WINDOW,
    efforts: CLAUDE_EFFORT_LEVELS,
    defaultEffort: "high",
    lifecycle: "current",
  },
  {
    id: "opus",
    name: "Claude Opus",
    tag: "OPUS",
    provider: "claude",
    cliFlag: "opus",
    contextWindow: CLAUDE_1M_CONTEXT_WINDOW,
    efforts: CLAUDE_EFFORT_LEVELS,
    defaultEffort: "medium",
    lifecycle: "current",
  },
  {
    id: "opus-1m",
    name: "Claude Opus (1M)",
    tag: "OPUS 1M",
    provider: "claude",
    cliFlag: "opus[1m]",
    contextWindow: CLAUDE_1M_CONTEXT_WINDOW,
    efforts: CLAUDE_EFFORT_LEVELS,
    defaultEffort: "medium",
    lifecycle: "current",
  },
  SONNET,
  {
    id: "haiku",
    name: "Claude Haiku",
    tag: "HAIKU",
    provider: "claude",
    cliFlag: "haiku",
    // Haiku 4.5: 200K, no effort control. Retirement "not sooner than 2026-10-15".
    contextWindow: CLAUDE_200K_CONTEXT_WINDOW,
    efforts: [],
    defaultEffort: null,
    lifecycle: "current",
  },
];

// ── Codex (`-m <slug>`, effort via `-c model_reasoning_effort="…"`) ─────────

const GPT_6_ASTRA: CodexModelDefinition = {
  id: "gpt-6-astra",
  name: "GPT-6 Astra",
  tag: "GPT-6 Astra",
  provider: "codex",
  cliFlag: "gpt-6-astra",
  contextWindow: CODEX_CONTEXT_WINDOW,
  efforts: CODEX_LOW_TO_ULTRA,
  defaultEffort: "medium",
  lifecycle: "current",
};

const CODEX_MODELS: readonly CodexModelDefinition[] = [
  GPT_6_ASTRA,
  {
    id: "gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    tag: "GPT-6.1 Sol",
    provider: "codex",
    cliFlag: "gpt-6.1-sol",
    contextWindow: CODEX_CONTEXT_WINDOW,
    // Not in the local 0.153.4 catalog, so efforts/default are assumed to
    // match the Sol family (gpt-5.6-sol: low…ultra) — unverified.
    efforts: CODEX_LOW_TO_ULTRA,
    defaultEffort: "medium",
    minCliVersion: "0.159.1",
    lifecycle: "current",
  },
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    tag: "GPT-5.6 Sol",
    provider: "codex",
    cliFlag: "gpt-5.6-sol",
    contextWindow: CODEX_CONTEXT_WINDOW,
    efforts: CODEX_LOW_TO_ULTRA,
    defaultEffort: "low",
    lifecycle: "current",
  },
  {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    tag: "GPT-5.6 Terra",
    provider: "codex",
    cliFlag: "gpt-5.6-terra",
    contextWindow: CODEX_CONTEXT_WINDOW,
    efforts: CODEX_LOW_TO_ULTRA,
    defaultEffort: "medium",
    lifecycle: "current",
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    tag: "GPT-5.6 Luna",
    provider: "codex",
    cliFlag: "gpt-5.6-luna",
    contextWindow: CODEX_CONTEXT_WINDOW,
    efforts: CODEX_LOW_TO_MAX,
    defaultEffort: "medium",
    lifecycle: "current",
  },
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    tag: "GPT-5.5",
    provider: "codex",
    cliFlag: "gpt-5.5",
    contextWindow: CODEX_CONTEXT_WINDOW,
    efforts: CODEX_LOW_TO_XHIGH,
    defaultEffort: "medium",
    lifecycle: "legacy",
    retiresOn: "2026-10-14",
    successorId: "gpt-6-astra",
  },
];

/** Built-in catalogue, in picker order. */
export const MODELS: readonly BuiltinModelDefinition[] = [...CLAUDE_MODELS, ...CODEX_MODELS];

const DEFAULT_MODEL: BuiltinModelDefinition = SONNET;

/** Persisted ids that no longer exist → current id (+ encoded effort). */
export const LEGACY_MODEL_ALIASES: Readonly<Record<string, LegacyModelAlias>> = {
  "gpt55-med": { id: "gpt-5.5", effort: "medium" },
  "gpt55-high": { id: "gpt-5.5", effort: "high" },
  "gpt55-xhigh": { id: "gpt-5.5", effort: "xhigh" },
  "gpt54-med": { id: GPT_6_ASTRA.id, effort: "medium" },
  "gpt54-high": { id: GPT_6_ASTRA.id, effort: "high" },
  "gpt54-xhigh": { id: GPT_6_ASTRA.id, effort: "xhigh" },
  "gpt-5.4": { id: GPT_6_ASTRA.id },
  "claude-opus": { id: "opus" },
  "claude-sonnet": { id: "sonnet" },
};

function lookupLegacyAlias(id: string): LegacyModelAlias | null {
  return Object.prototype.hasOwnProperty.call(LEGACY_MODEL_ALIASES, id) ? LEGACY_MODEL_ALIASES[id] ?? null : null;
}

/** Legacy alias for `id` (handles `remote-ssh:` wrappers), or null. */
export function getLegacyModelAlias(id: string): LegacyModelAlias | null {
  const remote = parseRemoteModelId(id);
  if (remote) {
    const inner = lookupLegacyAlias(remote.baseModelId);
    return inner ? { ...inner, id: buildRemoteModelId(remote.provider, inner.id) } : null;
  }
  return lookupLegacyAlias(id);
}

/**
 * Map a persisted id to its current id. Drops any effort encoded in legacy
 * ids — use `normalizeModelSelection` when the effort matters.
 */
export function normalizeModelId(id: string): string;
export function normalizeModelId(id: string | null | undefined): string | null | undefined;
export function normalizeModelId(id: string | null | undefined): string | null | undefined {
  if (typeof id !== "string") return id;
  return getLegacyModelAlias(id)?.id ?? id;
}

/**
 * Normalize a persisted (id, effort) pair. Explicit `effort` wins; otherwise
 * the effort encoded in a legacy id (e.g. `gpt55-high`) is returned. The
 * effort is validated as an `EffortLevel` but not yet clamped to the model —
 * use `resolveEffort` for that.
 */
export function normalizeModelSelection(id: string | null | undefined, effort?: unknown): ModelSelection {
  const rawId = typeof id === "string" && id ? id : DEFAULT_MODEL_ID;
  const alias = getLegacyModelAlias(rawId);
  const explicit = isEffortLevel(effort) ? effort : null;
  return {
    id: alias?.id ?? rawId,
    effort: explicit ?? alias?.effort ?? null,
  };
}

/** Exact built-in lookup (after legacy normalization); undefined if unknown. */
export function getBuiltinModel(id: string | null | undefined): BuiltinModelDefinition | undefined {
  const normalized = normalizeModelId(id);
  return MODELS.find((m) => m.id === normalized);
}

// ── Effort ──────────────────────────────────────────────────────────────────

export function getAllowedEfforts(model: Pick<ModelDefinition, "efforts">): readonly EffortLevel[] {
  return model.efforts ?? [];
}

function effortRank(effort: EffortLevel): number {
  return EFFORT_LEVELS.indexOf(effort);
}

/**
 * Effort to actually send for `model`:
 *  - `requested` if the model accepts it;
 *  - else the strongest accepted level not above `requested` (or the weakest
 *    accepted level when `requested` is below all of them);
 *  - else (no/invalid request) `model.defaultEffort`;
 *  - null when the model has no effort control.
 */
export function resolveEffort(
  model: Pick<ModelDefinition, "efforts" | "defaultEffort">,
  requested?: unknown,
): EffortLevel | null {
  const allowed = getAllowedEfforts(model);
  if (allowed.length === 0) return null;
  const fallback = model.defaultEffort && allowed.includes(model.defaultEffort) ? model.defaultEffort : null;
  if (!isEffortLevel(requested)) return fallback;
  if (allowed.includes(requested)) return requested;
  const rank = effortRank(requested);
  let best: EffortLevel | null = null;
  for (const level of allowed) {
    if (effortRank(level) <= rank && (best === null || effortRank(level) > effortRank(best))) best = level;
  }
  if (best) return best;
  let lowest: EffortLevel | null = null;
  for (const level of allowed) {
    if (lowest === null || effortRank(level) < effortRank(lowest)) lowest = level;
  }
  return lowest ?? fallback;
}

function withEffort(model: BuiltinModelDefinition, effort: EffortLevel | null): BuiltinModelDefinition {
  const resolved = resolveEffort(model, effort);
  if (resolved === null) return model;
  if (model.provider === "claude") {
    const claudeEffort: ClaudeEffortLevel | null = isClaudeEffortLevel(resolved) ? resolved : null;
    return claudeEffort ? { ...model, effort: claudeEffort } : model;
  }
  return { ...model, effort: resolved };
}

// ── CLI version gating / retirement ─────────────────────────────────────────

/** Compare dotted numeric versions ("0.159.1"); non-numeric parts count as 0. */
export function compareCliVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, "").split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** True when `cliVersion` is unknown or satisfies `model.minCliVersion`. */
export function isModelSupportedByCli(model: Pick<ModelDefinition, "minCliVersion">, cliVersion: string | null | undefined): boolean {
  if (!model.minCliVersion || !cliVersion) return true;
  return compareCliVersions(cliVersion, model.minCliVersion) >= 0;
}

/** True once `model.retiresOn` (YYYY-MM-DD, UTC) has passed. */
export function isModelRetired(model: Pick<ModelDefinition, "retiresOn">, nowMs: number): boolean {
  if (!model.retiresOn) return false;
  const retiresAt = Date.parse(`${model.retiresOn}T00:00:00Z`);
  return Number.isFinite(retiresAt) && nowMs >= retiresAt;
}

// ── Resolution ──────────────────────────────────────────────────────────────

/**
 * Built-ins minus any provider replaced by a provider-upstream override,
 * followed by `extraModels` (remote, upstream, OpenCode, Multica...).
 */
export function getAvailableModels(extraModels?: readonly ModelDefinition[] | null): ModelDefinition[] {
  const extras = extraModels ?? [];
  const overrides = new Set<string>(
    extras.filter((m) => m.providerOverride && m.provider).map((m) => m.provider),
  );
  return [...MODELS.filter((m) => !overrides.has(m.provider)), ...extras];
}

/**
 * Resolve an id to a Claude/Codex definition: provider-upstream ids are
 * synthesized; built-in/legacy ids resolve to the catalogue entry with
 * `effort` set (legacy-encoded effort, else `defaultEffort`); anything else
 * falls back to the default model.
 */
export function getM(id: string | null | undefined): BuiltinModelDefinition {
  const upstream = parseProviderUpstreamModelId(id);
  if (upstream) return buildProviderUpstreamModel(upstream.provider, upstream.modelId);
  const selection = normalizeModelSelection(id);
  const base = MODELS.find((m) => m.id === selection.id) ?? DEFAULT_MODEL;
  return withEffort(base, selection.effort);
}

/**
 * Resolve an id against the available (built-in + dynamic) models. Unknown
 * Multica/OpenCode ids get placeholder models; unknown built-in ids fall back
 * to another model of the same provider, then to the first available model.
 */
export function getMOrMulticaFallback(
  id: string | null | undefined,
  extraModels?: readonly ModelDefinition[] | null,
): ModelDefinition {
  const selection = normalizeModelSelection(id);
  const available = getAvailableModels(extraModels);
  const availableHit = available.find((m) => m.id === id || m.id === selection.id);
  if (availableHit) {
    if ((availableHit.provider === "claude" || availableHit.provider === "codex") && !availableHit.providerOverride) {
      return withEffort(availableHit, selection.effort);
    }
    return availableHit;
  }
  const baseHit = MODELS.find((m) => m.id === selection.id);

  if (isMulticaModelId(id)) return buildMulticaFallbackModel(id);
  if (isOpenCodeModelId(id)) {
    const parsed = parseOpenCodeModelId(id);
    if (parsed) return buildOpenCodeFallbackModel(id, parsed);
  }
  if (isProviderUpstreamModelId(id)) return getM(id);
  return (baseHit ? available.find((m) => m.provider === baseHit.provider) : undefined) ?? available[0] ?? getM(id);
}
