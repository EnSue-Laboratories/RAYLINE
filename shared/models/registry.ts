/**
 * Model registry: id resolution, effort resolution and the available-model
 * list. The static catalogue lives in ./catalog, legacy ids in ./legacy-ids,
 * runtime discovery in ./runtime-catalog — all re-exported from here.
 *
 * ── Id scheme (changed 2026-10) ─────────────────────────────────────────────
 * Model ids identify a *model*, not a model+effort pair. Reasoning effort is a
 * separate per-conversation setting (`conversation.effort`, see
 * shared/chat/types.ts) validated against `model.efforts` and defaulting to
 * `model.defaultEffort`. Rationale: with Claude (5 levels) and Codex (up to 6
 * levels) across 12+ models, baking effort into ids would need ~70 entries.
 * Likewise Grok's `--continue` is `conversation.grokContinue`, not an id.
 *
 * Static ids:
 *   Claude: fable, fable-1m, opus, opus-1m, sonnet, haiku
 *   Codex:  gpt-6-astra, gpt-6.1-sol, gpt-6-sol, gpt-6-luna, gpt-5.6-sol,
 *           gpt-5.6-terra, gpt-5.6-luna, gpt-5.5   (Codex ids equal the slug)
 *   Grok:   grok-default (CLI default), grok-4.7, grok-4.6, … (id = slug)
 *   AGY:    agy:default (CLI default)
 * Discovered ids (buildRuntimeModels): static id when the slug is catalogued,
 * else `codex-model:<enc slug>` / `<grok slug>` / `agy:<slug>`.
 *
 * Backward compatibility — persisted ids keep resolving via the legacy table
 * and patterns documented in ./legacy-ids (ours: gpt55-*, gpt54-*, gpt-5.4,
 * claude-*; PR #230: gpt6-astra-med, gpt61-sol-high, codex-model:<slug>:<eff>,
 * grok-47, grok-46-continue, sonnet-1m, …), including inside
 * `remote-ssh:<p>:<legacy id>`. Use `normalizeModelSelection()` (not
 * `normalizeModelId()`) when migrating persisted conversations so the effort
 * / grokContinue encoded in a legacy id is kept.
 *
 * Sources: docs/refactor/cli-models-research.md (Claude Code 2.1.287,
 * Codex 0.153.4 local catalog + docs, fetched 2026-10-01); PR #230.
 */

import {
  DEFAULT_MODEL,
  DEFAULT_MODEL_ID,
  MODELS,
  STATIC_MODELS,
} from "./catalog";
import { buildMulticaFallbackModel, buildOpenCodeFallbackModel, buildProviderUpstreamModel } from "./dynamic-models";
import {
  isMulticaModelId,
  isOpenCodeModelId,
  isProviderUpstreamModelId,
  parseAgyModelId,
  parseCodexRuntimeModelId,
  parseOpenCodeModelId,
  parseProviderUpstreamModelId,
  isGrokModelId,
} from "./ids";
import { getLegacyModelAlias } from "./legacy-ids";
import {
  buildAgyFallbackModel,
  buildCodexFallbackModel,
  buildGrokFallbackModel,
  mergeModelCatalog,
} from "./runtime-catalog";
import {
  EFFORT_LEVELS,
  isClaudeEffortLevel,
  isEffortLevel,
  type BuiltinModelDefinition,
  type ClaudeEffortLevel,
  type EffortLevel,
  type ModelDefinition,
  type ModelSelection,
  type StaticModelDefinition,
} from "./types";

export {
  AGY_MODELS,
  CLAUDE_1M_CONTEXT_WINDOW,
  CLAUDE_200K_CONTEXT_WINDOW,
  CODEX_CONTEXT_WINDOW,
  DEFAULT_MODEL_ID,
  GPT_6_1_SOL_CONTEXT_WINDOW,
  GROK_CONTEXT_WINDOW,
  GROK_MODELS,
  MODELS,
  STATIC_MODELS,
  findStaticCodexModelBySlug,
  findStaticGrokModelBySlug,
  findStaticModel,
} from "./catalog";
export { LEGACY_MODEL_ALIASES, getLegacyModelAlias, legacyEffortFromSuffix } from "./legacy-ids";

/**
 * Map a persisted id to its current id. Drops the effort encoded in legacy
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
  const selection: ModelSelection = {
    id: alias?.id ?? rawId,
    effort: explicit ?? alias?.effort ?? null,
  };
  if (alias?.grokContinue) selection.grokContinue = true;
  return selection;
}

/** Exact built-in Claude/Codex lookup (after legacy normalization); undefined if unknown. */
export function getBuiltinModel(id: string | null | undefined): BuiltinModelDefinition | undefined {
  const normalized = normalizeModelId(id);
  return MODELS.find((m) => m.id === normalized);
}

/** Static lookup incl. Grok / AGY (after legacy normalization); undefined if unknown. */
export function getStaticModel(id: string | null | undefined): StaticModelDefinition | undefined {
  const normalized = normalizeModelId(id);
  return STATIC_MODELS.find((m) => m.id === normalized);
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
 * The model list pickers show (before `visibleModels` filtering): the static
 * catalogue merged with `extraModels` via `mergeModelCatalog`. Extras flagged
 * `runtimeCatalog` (from `buildRuntimeModels`) replace / unlock static
 * entries; the rest (provider upstreams, SSH remotes, OpenCode, Multica) are
 * appended, and a `providerOverride` extra hides its provider's built-ins.
 */
export function getAvailableModels(extraModels?: readonly ModelDefinition[] | null): ModelDefinition[] {
  const extras = extraModels ?? [];
  return mergeModelCatalog(
    STATIC_MODELS,
    extras.filter((m) => m.runtimeCatalog),
    extras.filter((m) => !m.runtimeCatalog),
  );
}

/**
 * Resolve an id to a Claude/Codex definition: provider-upstream ids are
 * synthesized; built-in/legacy ids resolve to the catalogue entry with
 * `effort` set (legacy-encoded effort, else `defaultEffort`); anything else
 * (including Grok / AGY / discovered Codex ids) falls back to the default
 * model — use `getMOrMulticaFallback` for those.
 */
export function getM(id: string | null | undefined): BuiltinModelDefinition {
  const upstream = parseProviderUpstreamModelId(id);
  if (upstream) return buildProviderUpstreamModel(upstream.provider, upstream.modelId);
  const selection = normalizeModelSelection(id);
  const base = MODELS.find((m) => m.id === selection.id) ?? DEFAULT_MODEL;
  return withEffort(base, selection.effort);
}

function withSelection(model: ModelDefinition, selection: ModelSelection): ModelDefinition {
  if ((model.provider === "claude" || model.provider === "codex") && !model.providerOverride) {
    return withEffort(model, selection.effort);
  }
  if (model.provider === "grok" && selection.grokContinue) return { ...model, grokContinue: true };
  return model;
}

/**
 * Resolve an id (current or legacy) against the available models
 * (`getAvailableModels(extraModels)`). The result carries the selection's
 * `effort` (Claude/Codex) and `grokContinue` (Grok). Ids missing from the
 * list keep their identity via placeholders — Multica, OpenCode,
 * `codex-model:`, Grok and `agy:` — so a saved choice is never silently
 * swapped while discovery is pending; other unknown ids fall back to a model
 * of the same provider, then to the first available model.
 */
export function getMOrMulticaFallback(
  id: string | null | undefined,
  extraModels?: readonly ModelDefinition[] | null,
): ModelDefinition {
  const selection = normalizeModelSelection(id);
  const available = getAvailableModels(extraModels);
  const availableHit = available.find((m) => m.id === id || m.id === selection.id);
  if (availableHit) return withSelection(availableHit, selection);
  const baseHit = STATIC_MODELS.find((m) => m.id === selection.id);

  if (isMulticaModelId(id)) return buildMulticaFallbackModel(id);
  if (isOpenCodeModelId(id)) {
    const parsed = parseOpenCodeModelId(id);
    if (parsed) return buildOpenCodeFallbackModel(id, parsed);
  }
  if (isProviderUpstreamModelId(id)) return getM(id);
  if (!baseHit) {
    const codexRef = parseCodexRuntimeModelId(selection.id);
    if (codexRef) return withSelection(buildCodexFallbackModel(selection.id, codexRef.slug, selection.effort), selection);
    const agyRef = parseAgyModelId(selection.id);
    if (agyRef) return buildAgyFallbackModel(selection.id, agyRef);
    if (isGrokModelId(selection.id)) return withSelection(buildGrokFallbackModel(selection.id), selection);
  }
  return (baseHit ? available.find((m) => m.provider === baseHit.provider) : undefined) ?? available[0] ?? getM(id);
}
