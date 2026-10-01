/**
 * Legacy model-id compatibility. Every id RayLine (or the PR #230 fork) ever
 * persisted maps to a current id plus, where the old id encoded one, an
 * effort / Grok `--continue` option. Re-exported by registry.ts.
 *
 * Exact aliases (LEGACY_MODEL_ALIASES):
 *   gpt55-med|high|xhigh        → gpt-5.5     + medium|high|xhigh
 *   gpt54-med|high|xhigh        → gpt-6-astra + medium|high|xhigh
 *   gpt-5.4                     → gpt-6-astra (gpt-5.4 left Codex 2026-08-31)
 *   claude-opus / claude-sonnet → opus / sonnet (demo ids)
 *   sonnet-1m (PR #230)         → sonnet (`sonnet[1m]` is a no-op on Sonnet 5.5)
 *   grok-47, grok-46, …         → grok-4.7, grok-4.6, … (PR #230 compact ids)
 *   grok-46-continue            → grok-4.6 + grokContinue
 *   codex-model:gpt-6.1-sol:none → gpt-6.1-sol + medium
 *
 * Pattern aliases (PR #230 `codexModelId()` output):
 *   gpt<M><m?>-<family>-<eff>   e.g. gpt6-astra-med, gpt56-sol-low,
 *                               gpt61-sol-high → gpt-6-astra / gpt-5.6-sol /
 *                               gpt-6.1-sol + effort
 *   gpt<M><m>-<eff>             e.g. gpt55-low → gpt-5.5 + low
 *   codex-model:<enc slug>:<eff> → static Codex id when the slug is in the
 *                               catalogue, else `codex-model:<enc slug>`; + effort
 *   codex-model:<enc slug>      → static Codex id once the slug is catalogued
 * Effort suffixes: `med` → medium; `none` → the model's default effort (PR
 * #230 used it as a compatibility-cache placeholder); `minimal` → low.
 * Unchanged: `grok-default`, `grok-build-latest`, `agy:<slug>`, `agy:default`.
 */

import { GPT_6_ASTRA_ID, findStaticCodexModelBySlug } from "./catalog";
import {
  buildCodexRuntimeModelId,
  buildRemoteModelId,
  parseCodexRuntimeModelId,
  parseRemoteModelId,
} from "./ids";
import { isEffortLevel, type EffortLevel, type LegacyModelAlias } from "./types";

/** Persisted ids that no longer exist → current id (+ encoded effort / option). */
export const LEGACY_MODEL_ALIASES: Readonly<Record<string, LegacyModelAlias>> = {
  "gpt55-med": { id: "gpt-5.5", effort: "medium" },
  "gpt55-high": { id: "gpt-5.5", effort: "high" },
  "gpt55-xhigh": { id: "gpt-5.5", effort: "xhigh" },
  "gpt54-med": { id: GPT_6_ASTRA_ID, effort: "medium" },
  "gpt54-high": { id: GPT_6_ASTRA_ID, effort: "high" },
  "gpt54-xhigh": { id: GPT_6_ASTRA_ID, effort: "xhigh" },
  "gpt-5.4": { id: GPT_6_ASTRA_ID },
  "claude-opus": { id: "opus" },
  "claude-sonnet": { id: "sonnet" },
  // PR #230
  "sonnet-1m": { id: "sonnet" },
  "codex-model:gpt-6.1-sol:none": { id: "gpt-6.1-sol", effort: "medium" },
  "grok-47": { id: "grok-4.7" },
  "grok-46": { id: "grok-4.6" },
  "grok-46-continue": { id: "grok-4.6", grokContinue: true },
  "grok-46-direct": { id: "grok-4.6-direct" },
  "grok-46-public": { id: "grok-4.6-public" },
  "grok-45": { id: "grok-4.5" },
  "grok-43": { id: "grok-4.3" },
  "grok-420-0309-reasoning": { id: "grok-4.20-0309-reasoning" },
  "grok-420-0309-non-reasoning": { id: "grok-4.20-0309-non-reasoning" },
  "grok-build-01": { id: "grok-build-0.1" },
  "grok-420-reasoning": { id: "grok-4.20-reasoning" },
};

const EFFORT_SUFFIX = "low|med|medium|high|xhigh|max|ultra|none|minimal";
/** `gpt6-astra-med`, `gpt56-sol-low`, `gpt61-sol-high` */
const FAMILY_ID_PATTERN = new RegExp(`^gpt(\\d)(\\d?)-(astra|sol|luna|terra)-(${EFFORT_SUFFIX})$`);
/** `gpt55-low`, `gpt54-max` */
const PLAIN_ID_PATTERN = new RegExp(`^gpt(\\d)(\\d)-(${EFFORT_SUFFIX})$`);

function lookupExactAlias(id: string): LegacyModelAlias | null {
  return Object.prototype.hasOwnProperty.call(LEGACY_MODEL_ALIASES, id) ? LEGACY_MODEL_ALIASES[id] ?? null : null;
}

/**
 * PR #230 effort suffix → EffortLevel. `none` resolves to the model's
 * default (null when the model is unknown); unknown suffixes → null.
 */
export function legacyEffortFromSuffix(suffix: string | null | undefined, slug?: string): EffortLevel | null {
  if (!suffix) return null;
  if (suffix === "med") return "medium";
  if (suffix === "minimal") return "low";
  if (suffix === "none") return (slug ? findStaticCodexModelBySlug(slug)?.defaultEffort : null) ?? null;
  return isEffortLevel(suffix) ? suffix : null;
}

/** Current id for a Codex slug: exact alias (gpt-5.4), static id, or `codex-model:`. */
function codexIdForSlug(slug: string): { id: string; effort?: EffortLevel } {
  const alias = lookupExactAlias(slug);
  if (alias) return alias;
  return { id: findStaticCodexModelBySlug(slug)?.id ?? buildCodexRuntimeModelId(slug) };
}

function withEffort(alias: { id: string; effort?: EffortLevel }, effort: EffortLevel | null): LegacyModelAlias {
  const resolved = effort ?? alias.effort ?? null;
  return resolved ? { id: alias.id, effort: resolved } : { id: alias.id };
}

function parseCodexModelAlias(id: string): LegacyModelAlias | null {
  const ref = parseCodexRuntimeModelId(id);
  if (!ref) return null;
  const target = codexIdForSlug(ref.slug);
  const effort = legacyEffortFromSuffix(ref.effort, ref.slug);
  // `codex-model:<slug>` that is still uncatalogued is a current id, not legacy.
  if (target.id === id && !effort) return null;
  return withEffort(target, effort);
}

function parsePatternAlias(id: string): LegacyModelAlias | null {
  const family = FAMILY_ID_PATTERN.exec(id);
  if (family) {
    const [, major = "", minor = "", name = "", suffix = ""] = family;
    const slug = `gpt-${major}${minor ? `.${minor}` : ""}-${name}`;
    return withEffort(codexIdForSlug(slug), legacyEffortFromSuffix(suffix, slug));
  }
  const plain = PLAIN_ID_PATTERN.exec(id);
  if (plain) {
    const [, major = "", minor = "", suffix = ""] = plain;
    const slug = `gpt-${major}.${minor}`;
    return withEffort(codexIdForSlug(slug), legacyEffortFromSuffix(suffix, slug));
  }
  return parseCodexModelAlias(id);
}

/** Legacy alias for a bare (non-`remote-ssh:`) id, or null. */
function resolveLegacyAlias(id: string): LegacyModelAlias | null {
  return lookupExactAlias(id) ?? parsePatternAlias(id);
}

/** Legacy alias for `id` (handles `remote-ssh:` wrappers), or null. */
export function getLegacyModelAlias(id: string): LegacyModelAlias | null {
  const remote = parseRemoteModelId(id);
  if (remote) {
    const inner = resolveLegacyAlias(remote.baseModelId);
    return inner ? { ...inner, id: buildRemoteModelId(remote.provider, inner.id) } : null;
  }
  return resolveLegacyAlias(id);
}
