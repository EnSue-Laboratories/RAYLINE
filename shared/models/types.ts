/**
 * Model registry types.
 *
 * `ModelDefinition` is a discriminated union keyed by `provider`. Every member
 * extends `ModelDefinitionBase`, which declares the commonly-read fields as
 * optional so code holding an un-narrowed `ModelDefinition` can still read
 * e.g. `model.cliFlag` / `model.contextWindow` (typed `T | undefined`).
 * Narrow on `provider` to get the required versions.
 *
 * Reasoning effort is NOT part of a model id (see registry.ts header). Each
 * model advertises the efforts it accepts (`efforts`) and the CLI default
 * (`defaultEffort`); the chosen effort is a separate per-conversation setting.
 */

import type {
  OpenCodeRuntimeConfig,
  RemoteModelProviderId,
  RemoteRuntimeConfig,
  RemoteRuntimeProviderId,
} from "../providers/types";

/**
 * Union of every reasoning-effort level a supported CLI accepts.
 *  - Claude Code: `--effort low|medium|high|xhigh|max` (also `ultracode`,
 *    which RayLine does not expose).
 *  - Codex: `-c model_reasoning_effort="low|medium|high|xhigh|max|ultra"`.
 */
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max" | "ultra";

/** Levels accepted by `claude --effort`. */
export type ClaudeEffortLevel = Exclude<EffortLevel, "ultra">;

/** Levels accepted by Codex `model_reasoning_effort`. */
export type CodexEffortLevel = EffortLevel;

/** All levels, weakest → strongest. */
export const EFFORT_LEVELS: readonly EffortLevel[] = ["low", "medium", "high", "xhigh", "max", "ultra"];

export const CLAUDE_EFFORT_LEVELS: readonly ClaudeEffortLevel[] = ["low", "medium", "high", "xhigh", "max"];

export function isEffortLevel(value: unknown): value is EffortLevel {
  return typeof value === "string" && (EFFORT_LEVELS as readonly string[]).includes(value);
}

export function isClaudeEffortLevel(value: unknown): value is ClaudeEffortLevel {
  return typeof value === "string" && (CLAUDE_EFFORT_LEVELS as readonly string[]).includes(value);
}

/** Lifecycle marker shown in the picker. */
export type ModelLifecycle = "current" | "legacy";

export interface ModelDefinitionBase {
  /** Stable id persisted in conversations / settings. */
  id: string;
  /** Display name. */
  name: string;
  /** Short uppercase badge. */
  tag: string;

  /** Value passed to the CLI's model flag (`--model` / `-m`). */
  cliFlag?: string;
  /** Usable context window in tokens (drives the "% full" footer). */
  contextWindow?: number;
  /** Reasoning efforts this model accepts; empty = effort not supported. */
  efforts?: readonly EffortLevel[];
  /** CLI default effort, or null when the model has no effort control. */
  defaultEffort?: EffortLevel | null;
  /**
   * Effective effort for this particular selection. Only set on objects
   * returned by `getM` / `getMOrMulticaFallback` (from a legacy effort-
   * suffixed id or the model default); catalogue entries never carry it.
   */
  effort?: EffortLevel;
  /** OpenCode: run with thinking enabled. */
  thinking?: boolean;
  /** True for provider-upstream models that replace the built-in list. */
  providerOverride?: boolean;
  /** Minimum CLI version that knows this model (semver, no "v"). */
  minCliVersion?: string;
  lifecycle?: ModelLifecycle;
  /** ISO date (YYYY-MM-DD) after which the vendor retires the model. */
  retiresOn?: string;
  /** Suggested replacement once `retiresOn` has passed. */
  successorId?: string;
  /** Optional one-line description for pickers. */
  description?: string;

  /**
   * Kept only so persisted selections keep resolving (CLI aliases, retired
   * variants). `visibleModels` hides it unless it is the current selection.
   * (PR #230 called this `legacy: true`; our `lifecycle: "legacy"` instead
   * means "still selectable, being retired".)
   */
  hidden?: boolean;
  /**
   * The installed CLI's runtime catalog does not list this model (set by
   * `mergeModelCatalog` on static Grok entries). Shown only when selected,
   * disabled in pickers.
   */
  unavailable?: boolean;
  /** Built by `buildRuntimeModels` from the installed CLIs' catalogs. */
  runtimeCatalog?: boolean;
  /**
   * Grok only, selection-level like `effort`: set by `getMOrMulticaFallback`
   * when the persisted id was PR #230's `grok-46-continue`. Send it as
   * `AgentStartRequest.grokContinue`.
   */
  grokContinue?: boolean;
}

export interface ClaudeModelDefinition extends ModelDefinitionBase {
  provider: "claude";
  cliFlag: string;
  contextWindow: number;
  efforts: readonly ClaudeEffortLevel[];
  defaultEffort: ClaudeEffortLevel | null;
  effort?: ClaudeEffortLevel;
}

export interface CodexModelDefinition extends ModelDefinitionBase {
  provider: "codex";
  cliFlag: string;
  contextWindow: number;
  efforts: readonly CodexEffortLevel[];
  defaultEffort: CodexEffortLevel | null;
}

/** User-configured OpenCode model (`opencode:<providerId>/<modelId>`). */
export interface OpenCodeModelDefinition extends ModelDefinitionBase {
  provider: "opencode";
  /** `<providerId>/<modelId>` */
  cliFlag: string;
  providerId: string;
  modelId: string;
  apiKey?: string;
  baseURL?: string;
}

/** Multica remote agent (`multica:<agentId>`). */
export interface MulticaModelDefinition extends ModelDefinitionBase {
  provider: "multica";
  agentId?: string;
  workspaceId?: string;
  workspaceSlug?: string;
  runtimeId?: string;
  /** Agent presence reported by Multica (updated from `agent:status`). */
  status?: string;
}

/** SSH-hosted copy of a built-in Claude/Codex model (`remote-ssh:<provider>:<id>`). */
export interface RemoteModelDefinition extends ModelDefinitionBase {
  provider: RemoteModelProviderId;
  runtimeProvider: RemoteRuntimeProviderId;
  remoteRuntime: RemoteRuntimeConfig;
  /** Id of the built-in model this wraps. */
  baseModelId: string;
  cliFlag: string;
  contextWindow: number;
  efforts: readonly EffortLevel[];
  defaultEffort: EffortLevel | null;
}

/**
 * xAI Grok Build CLI model. Id = CLI slug (`grok-4.7`), except the
 * CLI-default entry `grok-default` whose `cliFlag` is "" (omit `--model`).
 * Grok exposes no reasoning-effort control.
 */
export interface GrokModelDefinition extends ModelDefinitionBase {
  provider: "grok";
  /** `--model` value; "" = let the CLI choose (no flag). */
  cliFlag: string;
  efforts: readonly EffortLevel[];
  defaultEffort: null;
}

/**
 * Google Antigravity CLI model (`agy:<slug>`; `agy:default` = CLI default
 * with `cliFlag` ""). Dynamic entries come from `agy models` discovery;
 * context windows are unknown (left unset).
 */
export interface AgyModelDefinition extends ModelDefinitionBase {
  provider: "agy";
  /** `--model` value; "" = let the CLI choose (no flag). */
  cliFlag: string;
  efforts: readonly EffortLevel[];
  defaultEffort: null;
}

export type ModelDefinition =
  | ClaudeModelDefinition
  | CodexModelDefinition
  | OpenCodeModelDefinition
  | MulticaModelDefinition
  | RemoteModelDefinition
  | GrokModelDefinition
  | AgyModelDefinition;

/**
 * Built-in Claude/Codex catalogue entries (`MODELS`). Kept to Claude/Codex
 * because SSH remotes, provider upstreams and `getM` only apply to them.
 */
export type BuiltinModelDefinition = ClaudeModelDefinition | CodexModelDefinition;

/** Every static (non-discovered) entry: `STATIC_MODELS`. */
export type StaticModelDefinition = BuiltinModelDefinition | GrokModelDefinition | AgyModelDefinition;

// ── Runtime model catalog (`model-catalog` IPC) ─────────────────────────────

/** A reasoning level as Codex's models cache spells it (string or `{ effort }`). */
export interface CodexCatalogReasoningLevel {
  effort?: string;
}

/**
 * One model from `$CODEX_HOME/models_cache.json` (only these metadata fields
 * cross IPC). Values are whatever the CLI wrote — not yet validated against
 * `EffortLevel`; `buildRuntimeModels` does that.
 */
export interface CodexCatalogRecord {
  slug: string;
  display_name?: string;
  context_window?: number;
  default_reasoning_level?: string;
  supported_reasoning_levels?: readonly (string | CodexCatalogReasoningLevel | null)[];
  /** "hide" entries are dropped. */
  visibility?: string;
}

/** One row of `agy models` (`<slug>\t<display name>`). */
export interface AgyCatalogRecord {
  slug: string;
  name: string;
}

/**
 * `model-catalog` result: what the installed CLIs report right now. Empty
 * arrays mean "not installed / discovery failed", never "no models".
 */
export interface RuntimeModelCatalog {
  codex: CodexCatalogRecord[];
  /** Slugs listed by `grok models` (`grok-4.7`, …). */
  grok: string[];
  agy: AgyCatalogRecord[];
}

/** Parsed `provider-upstream:<provider>:<modelId>` id. */
export interface ProviderUpstreamModelRef {
  provider: "claude" | "codex";
  modelId: string;
}

/** Parsed `opencode:<providerId>/<modelId>` id. */
export interface OpenCodeModelRef {
  providerId: string;
  modelId: string;
  /** `<providerId>/<modelId>` */
  cliFlag: string;
}

/** Parsed `remote-ssh:<provider>:<baseModelId>` id. */
export interface RemoteModelRef {
  provider: RemoteRuntimeProviderId;
  baseModelId: string;
}

/** Legacy id → current id (+ the effort / Grok option the old id encoded). */
export interface LegacyModelAlias {
  id: string;
  effort?: EffortLevel;
  /** PR #230 `grok-46-continue`. */
  grokContinue?: boolean;
}

/** A model id paired with an explicit effort choice. */
export interface ModelSelection {
  id: string;
  /** null = use the model's `defaultEffort` (i.e. do not pass a flag). */
  effort: EffortLevel | null;
  /** Present (true) only when a legacy id encoded Grok's `--continue`. */
  grokContinue?: boolean;
}

/** Payload shape the Dispatch card sends for planner / target models. */
export interface DispatchModelPayload {
  id: string;
  name: string;
  tag?: string;
  provider: string;
  cliFlag?: string;
  effort?: EffortLevel;
  thinking?: boolean;
  openCodeConfig?: OpenCodeRuntimeConfig;
  /** Set for SSH-hosted models; main rejects these as planner models. */
  remoteRuntime?: RemoteRuntimeConfig;
}
