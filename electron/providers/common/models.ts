/**
 * Resolves the `model` / `effort` an `agent-start` request carries against
 * the shared model registry. Pure.
 *
 * `AgentStartRequest.model` is a CLI flag (`ModelDefinition.cliFlag`), but
 * older renderers / persisted dispatch rows may still send a legacy RayLine
 * id (`gpt54-high`, `claude-opus`, `gpt-5.4`). Those are normalized through
 * the registry so the CLI always receives a current slug, and an effort
 * encoded in a legacy id is kept as the fallback effort.
 */

import {
  MODELS,
  getBuiltinModel,
  isEffortLevel,
  normalizeModelSelection,
  resolveEffort,
  type ClaudeModelDefinition,
  type CodexModelDefinition,
  type EffortLevel,
} from "@shared/models";

type CliProvider = "claude" | "codex";
type DefinitionFor<P extends CliProvider> = P extends "claude" ? ClaudeModelDefinition : CodexModelDefinition;

export interface ResolvedCliModel<P extends CliProvider> {
  /** Value for `--model` / `-m`; null = let the CLI pick its default. */
  cliFlag: string | null;
  /** Registry entry when the model is a known built-in. */
  definition: DefinitionFor<P> | null;
  /** Effort encoded in a legacy id (e.g. `gpt55-high`), if any. */
  legacyEffort: EffortLevel | null;
}

function isProviderModel<P extends CliProvider>(
  model: (typeof MODELS)[number] | undefined,
  provider: P,
): model is DefinitionFor<P> {
  return model?.provider === provider;
}

export function resolveCliModel<P extends CliProvider>(provider: P, requested: string | null | undefined): ResolvedCliModel<P> {
  const raw = typeof requested === "string" ? requested.trim() : "";
  if (!raw) return { cliFlag: null, definition: null, legacyEffort: null };

  const byFlag = MODELS.find((m) => m.provider === provider && m.cliFlag === raw);
  if (isProviderModel(byFlag, provider)) return { cliFlag: byFlag.cliFlag, definition: byFlag, legacyEffort: null };

  const selection = normalizeModelSelection(raw);
  const byId = getBuiltinModel(selection.id);
  if (isProviderModel(byId, provider)) {
    return { cliFlag: byId.cliFlag, definition: byId, legacyEffort: selection.effort };
  }

  // Unknown to the registry (provider-upstream model, full API model name…):
  // pass it through untouched.
  return { cliFlag: raw, definition: null, legacyEffort: null };
}

export interface RunEffortInput {
  definition: Pick<ClaudeModelDefinition | CodexModelDefinition, "efforts" | "defaultEffort"> | null;
  requested: unknown;
  legacyEffort?: EffortLevel | null;
  /** A provider upstream (custom base URL) is active: never send effort. */
  upstreamActive?: boolean;
  /**
   * What to do when the model is unknown to the registry: `omit` (Claude —
   * aliases are fixed) or `passthrough` the requested level (Codex — a slug
   * discovered by the installed CLI may support it; the CLI validates).
   */
  unknownModel?: "omit" | "passthrough";
}

/**
 * Effort flag to send, or null to omit it (CLI / config default applies).
 * Only sent when the user chose one (explicitly or via a legacy id) and the
 * registry says the model accepts effort (clamped by `resolveEffort`);
 * unknown models follow `unknownModel`. Arbitrary upstream backends never
 * get it.
 */
export function resolveRunEffort({ definition, requested, legacyEffort, upstreamActive, unknownModel = "omit" }: RunEffortInput): EffortLevel | null {
  if (upstreamActive) return null;
  const chosen = isEffortLevel(requested) ? requested : (legacyEffort ?? null);
  if (!chosen) return null;
  if (!definition) return unknownModel === "passthrough" ? chosen : null;
  return resolveEffort(definition, chosen);
}
