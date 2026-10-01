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
 * Union of every reasoning-effort level any supported CLI accepts.
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

export type ModelDefinition =
  | ClaudeModelDefinition
  | CodexModelDefinition
  | OpenCodeModelDefinition
  | MulticaModelDefinition
  | RemoteModelDefinition;

/** Built-in catalogue entries only. */
export type BuiltinModelDefinition = ClaudeModelDefinition | CodexModelDefinition;

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

/** Legacy id → current id (+ the effort the old id encoded). */
export interface LegacyModelAlias {
  id: string;
  effort?: EffortLevel;
}

/** A model id paired with an explicit effort choice. */
export interface ModelSelection {
  id: string;
  /** null = use the model's `defaultEffort` (i.e. do not pass a flag). */
  effort: EffortLevel | null;
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
}
