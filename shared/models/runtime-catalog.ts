/**
 * Runtime model discovery (PR #230 `model-catalog`), as pure functions:
 *
 *  - main process: `parseCodexModelsCache` (models_cache.json),
 *    `parseGrokModelsOutput` (`grok models`), `parseAgyModelsOutput`
 *    (`agy models`) → `RuntimeModelCatalog`, returned by `model-catalog`.
 *  - renderer: `normalizeRuntimeModelCatalog` (IPC result) →
 *    `buildRuntimeModels` → `mergeModelCatalog(STATIC_MODELS, runtime, extras)`
 *    (or simply `getAvailableModels([...runtime, ...extras])`).
 *
 * One ModelDefinition per model; efforts are a list on the model, never
 * separate ids.
 */

import { CODEX_CONTEXT_WINDOW, STATIC_MODELS, findStaticCodexModelBySlug, findStaticGrokModelBySlug } from "./catalog";
import {
  buildAgyModelId,
  buildCodexRuntimeModelId,
  isAgySlug,
  isCodexSlug,
  isGrokSlug,
  modelTag,
  type AgyModelRef,
} from "./ids";
import {
  EFFORT_LEVELS,
  isEffortLevel,
  type AgyCatalogRecord,
  type AgyModelDefinition,
  type CodexCatalogRecord,
  type CodexEffortLevel,
  type CodexModelDefinition,
  type EffortLevel,
  type GrokModelDefinition,
  type ModelDefinition,
  type RuntimeModelCatalog,
} from "./types";

export const EMPTY_RUNTIME_MODEL_CATALOG: RuntimeModelCatalog = Object.freeze({ codex: [], grok: [], agy: [] });

/** AGY display names are clipped to this many characters. */
export const AGY_MODEL_NAME_MAX_LENGTH = 160;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reasoningLevelName(level: unknown): string | null {
  if (typeof level === "string") return level;
  if (isRecord(level) && typeof level.effort === "string") return level.effort;
  return null;
}

// ── Parsing (main process) ──────────────────────────────────────────────────

/**
 * One Codex cache entry → the metadata-only record that crosses IPC (drops
 * instructions, keys, …). null for malformed or `visibility: "hide"` entries.
 */
export function parseCodexCatalogRecord(value: unknown): CodexCatalogRecord | null {
  if (!isRecord(value) || !isCodexSlug(value.slug) || value.visibility === "hide") return null;
  const record: CodexCatalogRecord = {
    slug: value.slug,
    display_name: typeof value.display_name === "string" ? value.display_name : value.slug,
  };
  if (typeof value.context_window === "number" && Number.isFinite(value.context_window) && value.context_window > 0) {
    record.context_window = value.context_window;
  }
  if (typeof value.default_reasoning_level === "string") record.default_reasoning_level = value.default_reasoning_level;
  if (Array.isArray(value.supported_reasoning_levels)) {
    record.supported_reasoning_levels = value.supported_reasoning_levels
      .map(reasoningLevelName)
      .filter((level): level is string => level !== null);
  }
  return record;
}

/** `models_cache.json` contents (already JSON-parsed) → records; [] on a shape error. */
export function parseCodexModelsCache(data: unknown): CodexCatalogRecord[] {
  if (!isRecord(data) || !Array.isArray(data.models)) return [];
  const records: CodexCatalogRecord[] = [];
  for (const entry of data.models) {
    const record = parseCodexCatalogRecord(entry);
    if (record) records.push(record);
  }
  return records;
}

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const GROK_ROW_PATTERN = /^\s*[*-]\s+(grok-[a-z0-9._-]+)(?:\s|$)/i;

/**
 * `grok models` stdout → unique slugs. Accepts `* slug (default)` / `- slug`
 * rows; ignores warnings, headers and ANSI colour codes.
 */
export function parseGrokModelsOutput(stdout: string | null | undefined): string[] {
  const text = (stdout ?? "").replace(ANSI_PATTERN, "");
  const slugs = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const slug = GROK_ROW_PATTERN.exec(line)?.[1];
    if (slug) slugs.add(slug);
  }
  return [...slugs];
}

const AGY_ROW_PATTERN = /^([a-z0-9][a-z0-9._-]*)\t(.+)$/i;

/** `agy models` stdout (`<slug>\t<name>` rows) → records, de-duplicated by slug (last wins). */
export function parseAgyModelsOutput(stdout: string | null | undefined): AgyCatalogRecord[] {
  const bySlug = new Map<string, AgyCatalogRecord>();
  for (const line of (stdout ?? "").split(/\r?\n/)) {
    const match = AGY_ROW_PATTERN.exec(line.trim());
    const slug = match?.[1];
    const name = match?.[2]?.trim().slice(0, AGY_MODEL_NAME_MAX_LENGTH);
    if (slug && name) bySlug.set(slug, { slug, name });
  }
  return [...bySlug.values()];
}

function parseAgyCatalogRecord(value: unknown): AgyCatalogRecord | null {
  if (!isRecord(value) || !isAgySlug(value.slug)) return null;
  const name = typeof value.name === "string" ? value.name.trim().slice(0, AGY_MODEL_NAME_MAX_LENGTH) : "";
  return { slug: value.slug, name: name || value.slug };
}

/** Untrusted value (IPC result, cache file) → a well-formed catalog. Never throws. */
export function normalizeRuntimeModelCatalog(value: unknown): RuntimeModelCatalog {
  if (!isRecord(value)) return { codex: [], grok: [], agy: [] };
  const codex = Array.isArray(value.codex)
    ? value.codex.map(parseCodexCatalogRecord).filter((r): r is CodexCatalogRecord => r !== null)
    : [];
  const grok = Array.isArray(value.grok) ? [...new Set(value.grok.filter(isGrokSlug))] : [];
  const agy = Array.isArray(value.agy)
    ? value.agy.map(parseAgyCatalogRecord).filter((r): r is AgyCatalogRecord => r !== null)
    : [];
  return { codex, grok, agy };
}

export function isRuntimeModelCatalog(value: unknown): value is RuntimeModelCatalog {
  return isRecord(value) && Array.isArray(value.codex) && Array.isArray(value.grok) && Array.isArray(value.agy);
}

// ── Model builders ──────────────────────────────────────────────────────────

function sortEfforts(efforts: Iterable<EffortLevel>): CodexEffortLevel[] {
  const set = new Set(efforts);
  return EFFORT_LEVELS.filter((level) => set.has(level));
}

/**
 * Codex record → model. Efforts come from the record unless it advertises
 * none of our levels (e.g. a compatibility cache that reports only `none`),
 * in which case a static entry's verified levels are kept. Context window:
 * record → static → 272K.
 */
export function buildCodexRuntimeModel(record: CodexCatalogRecord): CodexModelDefinition | null {
  if (!isCodexSlug(record.slug) || record.visibility === "hide") return null;
  const known = findStaticCodexModelBySlug(record.slug);
  const advertised = sortEfforts(
    (record.supported_reasoning_levels ?? []).map(reasoningLevelName).filter(isEffortLevel),
  );
  const efforts: readonly CodexEffortLevel[] = advertised.length > 0 ? advertised : known?.efforts ?? [];
  const requestedDefault = advertised.length > 0 ? record.default_reasoning_level : known?.defaultEffort;
  const defaultEffort: CodexEffortLevel | null = isEffortLevel(requestedDefault) && efforts.includes(requestedDefault)
    ? requestedDefault
    : known?.defaultEffort && efforts.includes(known.defaultEffort)
      ? known.defaultEffort
      : efforts.includes("medium")
        ? "medium"
        : efforts[0] ?? null;
  const displayName = record.display_name && record.display_name !== record.slug ? record.display_name : null;
  const name = known?.name ?? displayName ?? record.slug;
  const contextWindow = typeof record.context_window === "number" && Number.isFinite(record.context_window) && record.context_window > 0
    ? record.context_window
    : known?.contextWindow ?? CODEX_CONTEXT_WINDOW;

  const model: CodexModelDefinition = {
    id: known?.id ?? buildCodexRuntimeModelId(record.slug),
    name,
    tag: known?.tag ?? name,
    provider: "codex",
    cliFlag: record.slug,
    contextWindow,
    efforts,
    defaultEffort,
    lifecycle: known?.lifecycle ?? "current",
    runtimeCatalog: true,
  };
  // The installed CLI lists it, so `minCliVersion` is moot.
  if (known?.retiresOn) model.retiresOn = known.retiresOn;
  if (known?.successorId) model.successorId = known.successorId;
  if (known?.description) model.description = known.description;
  return model;
}

/** Discovered Grok slug → model (static entry with `hidden` cleared, or a bare one). */
export function buildGrokRuntimeModel(slug: string): GrokModelDefinition | null {
  if (!isGrokSlug(slug)) return null;
  const known = findStaticGrokModelBySlug(slug);
  if (known) {
    const model: GrokModelDefinition = { ...known, lifecycle: "current", runtimeCatalog: true };
    delete model.hidden;
    return model;
  }
  return {
    id: slug,
    name: slug,
    tag: modelTag(slug),
    provider: "grok",
    cliFlag: slug,
    efforts: [],
    defaultEffort: null,
    lifecycle: "current",
    runtimeCatalog: true,
  };
}

/** Discovered AGY row → model. Context window is unknown, so it is left unset. */
export function buildAgyRuntimeModel(record: AgyCatalogRecord): AgyModelDefinition | null {
  if (!isAgySlug(record.slug)) return null;
  const name = record.name.trim() || record.slug;
  return {
    id: buildAgyModelId(record.slug),
    name,
    tag: `AGY ${name}`,
    provider: "agy",
    cliFlag: record.slug,
    efforts: [],
    defaultEffort: null,
    lifecycle: "current",
    runtimeCatalog: true,
  };
}

/**
 * Discovered models, all flagged `runtimeCatalog: true`, in order Codex →
 * Grok → AGY. Duplicate ids keep the first entry. A Codex slug whose id
 * would collide with a static non-Codex id is dropped.
 */
export function buildRuntimeModels(catalog: Partial<RuntimeModelCatalog> | null | undefined): ModelDefinition[] {
  const models: ModelDefinition[] = [];
  const seen = new Set<string>();
  const push = (model: ModelDefinition | null): void => {
    if (!model || seen.has(model.id)) return;
    const clash = STATIC_MODELS.find((m) => m.id === model.id);
    if (clash && clash.provider !== model.provider) return;
    seen.add(model.id);
    models.push(model);
  };
  for (const record of catalog?.codex ?? []) push(buildCodexRuntimeModel(record));
  for (const slug of catalog?.grok ?? []) push(buildGrokRuntimeModel(slug));
  for (const record of catalog?.agy ?? []) push(buildAgyRuntimeModel(record));
  return models;
}

// ── Merge ───────────────────────────────────────────────────────────────────

function slugKey(model: Pick<ModelDefinition, "provider" | "cliFlag">): string {
  return `${model.provider}:${model.cliFlag ?? ""}`;
}

/**
 * Port of PR #230 `getAvailableModels`:
 *  1. providers with a `providerOverride` extra (custom upstream) drop their
 *     baseline and runtime entries;
 *  2. a runtime entry replaces the baseline entry with the same
 *     provider + CLI slug;
 *  3. baseline Grok entries with a slug are marked `unavailable` unless the
 *     runtime catalog lists that slug (`grok-default` never is);
 *  4. ids are de-duplicated: a later entry replaces an earlier one but keeps
 *     its position.
 * Result order: baseline, runtime, extras.
 *
 * @param baseline usually `STATIC_MODELS`
 * @param runtime  `buildRuntimeModels(catalog)`
 * @param extras   provider-upstream overrides, SSH remotes, OpenCode, Multica…
 */
export function mergeModelCatalog(
  baseline: readonly ModelDefinition[],
  runtime: readonly ModelDefinition[],
  extras: readonly ModelDefinition[] = [],
): ModelDefinition[] {
  const overridden = new Set<string>(extras.filter((m) => m.providerOverride).map((m) => m.provider));
  const runtimeKept = runtime.filter((m) => !overridden.has(m.provider));
  const runtimeSlugs = new Set(runtimeKept.map(slugKey));

  const baselineKept: ModelDefinition[] = [];
  for (const model of baseline) {
    if (overridden.has(model.provider) || runtimeSlugs.has(slugKey(model))) continue;
    baselineKept.push(model.provider === "grok" && model.cliFlag ? { ...model, unavailable: true } : model);
  }

  const byId = new Map<string, ModelDefinition>();
  for (const model of [...baselineKept, ...runtimeKept, ...extras]) byId.set(model.id, model);
  return [...byId.values()];
}

// ── Placeholders for ids not in the current catalog ─────────────────────────

/**
 * A persisted `codex-model:` id whose slug is not (yet) discovered. Keeps
 * the saved model instead of silently switching to another one; `effort`
 * (from a legacy id) becomes its only advertised level.
 */
export function buildCodexFallbackModel(id: string, slug: string, effort: EffortLevel | null): CodexModelDefinition {
  return {
    id,
    name: slug,
    tag: slug,
    provider: "codex",
    cliFlag: slug,
    contextWindow: CODEX_CONTEXT_WINDOW,
    efforts: effort ? [effort] : [],
    defaultEffort: effort,
  };
}

/** A persisted Grok id that neither the static list nor discovery knows. */
export function buildGrokFallbackModel(id: string): GrokModelDefinition {
  return { id, name: id, tag: modelTag(id), provider: "grok", cliFlag: id, efforts: [], defaultEffort: null };
}

/** A persisted `agy:` id that discovery has not (yet) reported. */
export function buildAgyFallbackModel(id: string, ref: AgyModelRef): AgyModelDefinition {
  return {
    id,
    name: ref.slug,
    tag: `AGY ${ref.slug}`,
    provider: "agy",
    cliFlag: ref.cliFlag,
    efforts: [],
    defaultEffort: null,
  };
}
