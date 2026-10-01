/**
 * Picker-facing helpers shared by the renderer (model pickers, dispatch) and
 * the main process (planner validation). Ported from PR #230's
 * src/utils/modelOptions.js, src/utils/modelSearch.js and
 * electron/planner-capabilities.json.
 */

import type { ModelProviderId, RuntimeProviderId } from "../providers/types";
import { DEFAULT_MODEL_ID } from "./catalog";
import { normalizeModelId } from "./registry";
import type { EffortLevel, ModelDefinition } from "./types";

// ── Providers ───────────────────────────────────────────────────────────────

/** Setup docs per locally-installed CLI. Providers listed here are hidden when `installed[p] === false`. */
export const MODEL_INSTALL_GUIDES: Readonly<Partial<Record<RuntimeProviderId, string>>> = {
  claude: "https://code.claude.com/docs/en/setup",
  codex: "https://developers.openai.com/codex/cli",
  grok: "https://docs.x.ai/docs/grok-code",
  agy: "https://antigravity.google/docs/cli",
  opencode: "https://opencode.ai/docs/cli/",
};

/** Picker group id: a model provider, or `inherit` (dispatch "use default"). */
export type ModelProviderGroupId = "inherit" | ModelProviderId;

/** Picker group order. */
export const MODEL_PROVIDER_ORDER: readonly ModelProviderGroupId[] = [
  "inherit",
  "claude",
  "codex",
  "grok",
  "agy",
  "remote-claude",
  "remote-codex",
  "opencode",
  "multica",
];

/** Untranslated display names (also matched by `filterModels`). */
export const MODEL_PROVIDER_LABELS: Readonly<Record<ModelProviderId, string>> = {
  claude: "Claude",
  codex: "Codex",
  grok: "Grok",
  agy: "Antigravity",
  opencode: "OpenCode",
  multica: "Multica",
  "remote-claude": "Remote Claude",
  "remote-codex": "Remote Codex",
};

/** `check-cli-installed` result or a subset of it; missing = assume installed. */
export type InstalledProviders = Readonly<Partial<Record<ModelProviderId, boolean>>>;

function hasRemoteRuntime(model: ModelDefinition): boolean {
  return "remoteRuntime" in model && Boolean(model.remoteRuntime);
}

/**
 * Models a picker should list. Drops `hidden` and `unavailable` entries
 * unless their id (after legacy normalization) is in `retainedIds` (the
 * current selection), and drops local-CLI models whose CLI is reported as
 * not installed (SSH remotes are kept).
 */
export function visibleModels<M extends ModelDefinition>(
  models: readonly M[],
  installed: InstalledProviders = {},
  retainedIds: readonly (string | null | undefined)[] = [],
): M[] {
  const retained = new Set<string>();
  for (const id of retainedIds) {
    if (typeof id !== "string" || !id) continue;
    retained.add(id);
    retained.add(normalizeModelId(id));
  }
  return models.filter((model) => {
    const keep = retained.has(model.id);
    if (model.hidden && !keep) return false;
    if (model.unavailable && !keep) return false;
    const guided = Object.prototype.hasOwnProperty.call(MODEL_INSTALL_GUIDES, model.provider);
    return !guided || installed[model.provider] !== false || hasRemoteRuntime(model);
  });
}

/**
 * Picker label: `name` (or `tag` when `short`), plus ` · <effort>` when an
 * effort is given (defaults to the selection-level `model.effort`).
 */
export function modelLabel(
  model: Pick<ModelDefinition, "id" | "name" | "tag" | "effort"> | null | undefined,
  options: { short?: boolean; effort?: EffortLevel | null } = {},
): string {
  if (!model) return "";
  const base = (options.short && model.tag) || model.name || model.id;
  const effort = options.effort === undefined ? model.effort : options.effort;
  return effort ? `${base} · ${effort}` : base;
}

// ── Dispatch planner ────────────────────────────────────────────────────────

/** Providers that can run the dispatch planner (replaces electron/planner-capabilities.json). */
export const PLANNER_PROVIDERS = ["claude", "codex", "opencode"] as const;

export type PlannerProviderId = (typeof PLANNER_PROVIDERS)[number];

export function isPlannerProviderId(value: unknown): value is PlannerProviderId {
  return typeof value === "string" && (PLANNER_PROVIDERS as readonly string[]).includes(value);
}

/** Planner-eligible: local Claude / Codex / OpenCode model that is not `unavailable`. */
export function isPlannerModel(model: ModelDefinition | null | undefined): boolean {
  return Boolean(model && !model.unavailable && !hasRemoteRuntime(model) && isPlannerProviderId(model.provider));
}

/**
 * Planner model id to preselect: `preferred` (legacy-normalized) when it is
 * planner-eligible, else `sonnet`, else the first eligible model, else "".
 */
export function defaultPlannerModel(models: readonly ModelDefinition[], preferred?: string | null): string {
  const eligible = models.filter(isPlannerModel);
  const wanted = typeof preferred === "string" && preferred ? normalizeModelId(preferred) : null;
  return (
    (wanted ? eligible.find((m) => m.id === wanted)?.id : undefined) ??
    eligible.find((m) => m.id === DEFAULT_MODEL_ID)?.id ??
    eligible[0]?.id ??
    ""
  );
}

// ── Search ──────────────────────────────────────────────────────────────────

function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").toLocaleLowerCase();
}

const NON_ALNUM = /[^\p{L}\p{N}]/gu;

/** Text `filterModels` matches against (exported for highlighting/tests). */
export function modelSearchText(model: ModelDefinition): string {
  const providerLabel = (MODEL_PROVIDER_LABELS as Readonly<Record<string, string>>)[model.provider] ?? "";
  return normalizeSearchText(
    [
      model.name,
      model.tag,
      model.provider,
      providerLabel,
      model.cliFlag,
      model.effort,
      ...(model.efforts ?? []),
      model.grokContinue ? "continue project 继续项目" : "",
    ].join(" "),
  );
}

/**
 * Fuzzy picker filter: every whitespace-separated query word must occur in
 * the model's search text, either verbatim or with punctuation removed on
 * both sides (so `61sol` matches "GPT-6.1 Sol" and `grok47` matches
 * `grok-4.7`). Case-, width- and punctuation-insensitive; matches name, tag,
 * provider, CLI slug and supported efforts. Empty query returns all.
 */
export function filterModels<M extends ModelDefinition>(models: readonly M[], query: string | null | undefined): M[] {
  const words = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...models];
  return models.filter((model) => {
    const text = modelSearchText(model);
    const compact = text.replace(NON_ALNUM, "");
    return words.every((word) => {
      const stripped = word.replace(NON_ALNUM, "");
      return text.includes(word) || (stripped.length > 0 && compact.includes(stripped));
    });
  });
}
