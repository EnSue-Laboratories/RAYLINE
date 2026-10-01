/**
 * Pure view-model for the model picker: which models are visible, how they
 * are grouped, searched, badged and gated. No React, no DOM.
 *
 * TODO(shared-models): `MODEL_INSTALL_GUIDES`, `MODEL_PROVIDER_ORDER`,
 * `filterModels` and `isPlannerModel` mirror #230's src/utils/modelOptions /
 * modelSearch, which are moving into @shared/models; import them from there
 * once that lands and delete the local copies.
 */

import {
  getBuiltinModel,
  isModelRetired,
  isModelSupportedByCli,
  normalizeModelId,
  resolveEffort,
  type EffortLevel,
  type ModelDefinition,
} from "@shared/models";
import type { CliInstalledSnapshot } from "@shared/providers/types";

/** Providers whose local CLI can be missing (keys of `check-cli-installed`). */
export type InstallableProvider = "claude" | "codex" | "opencode";
export type InstalledMap = Partial<Pick<CliInstalledSnapshot, InstallableProvider>>;
export type CliVersions = NonNullable<CliInstalledSnapshot["versions"]>;

export const MODEL_INSTALL_GUIDES: Readonly<Record<InstallableProvider, string>> = {
  claude: "https://code.claude.com/docs/en/setup",
  codex: "https://developers.openai.com/codex/cli",
  opencode: "https://opencode.ai/docs/cli/",
};

export const INSTALL_GUIDE_NAMES: Readonly<Record<InstallableProvider, string>> = {
  claude: "Claude Code",
  codex: "Codex CLI",
  opencode: "OpenCode",
};

/** Synthetic group for Dispatch's "inherit the default model" option. */
export const INHERIT_GROUP = "inherit";

export const MODEL_PROVIDER_ORDER: readonly string[] = [
  INHERIT_GROUP,
  "claude",
  "codex",
  "grok",
  "agy",
  "remote-claude",
  "remote-codex",
  "opencode",
  "multica",
];

/** Local runtimes the dispatch planner can drive. */
const PLANNER_PROVIDERS: ReadonlySet<string> = new Set(["claude", "codex", "opencode"]);

export function isInstallableProvider(provider: string): provider is InstallableProvider {
  return provider === "claude" || provider === "codex" || provider === "opencode";
}

export function isPlannerModel(model: ModelDefinition | null | undefined): boolean {
  return Boolean(model && !("remoteRuntime" in model) && PLANNER_PROVIDERS.has(model.provider));
}

/** Version of the local CLI that runs `model`, when main reported one. */
export function cliVersionFor(model: ModelDefinition, versions: CliVersions | undefined): string | null {
  if (!versions || !isInstallableProvider(model.provider)) return null;
  return versions[model.provider] ?? null;
}

export interface VisibilityContext {
  installed: InstalledMap;
  /** Saved choices stay listed even when retired or their CLI is missing. */
  retainedIds: readonly string[];
  nowMs: number;
}

/**
 * Hides retired models and models whose local CLI is known to be missing,
 * unless they are a retained (saved) choice. SSH-remote models never depend
 * on the local install.
 */
export function visibleModels(models: readonly ModelDefinition[], ctx: VisibilityContext): ModelDefinition[] {
  const retained = new Set(ctx.retainedIds.map((id) => normalizeModelId(id)));
  return models.filter((model) => {
    if (retained.has(model.id)) return true;
    if (isModelRetired(model, ctx.nowMs)) return false;
    if (isInstallableProvider(model.provider) && ctx.installed[model.provider] === false) return false;
    return true;
  });
}

const normalizeSearch = (value: string): string => value.normalize("NFKC").toLocaleLowerCase();
const compact = (value: string): string => value.replace(/[^\p{L}\p{N}]/gu, "");

function searchText(model: ModelDefinition): string {
  return normalizeSearch(
    [model.name, model.tag, model.provider, model.cliFlag ?? "", (model.efforts ?? []).join(" "), model.description ?? ""].join(" "),
  );
}

/**
 * Every whitespace-separated word must match, either literally or with
 * punctuation removed (so "gpt6astra" finds "GPT-6 Astra" and "luna max" finds
 * Luna because it supports `max`).
 */
export function filterModels<M extends ModelDefinition>(models: readonly M[], query: string): M[] {
  const words = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...models];
  return models.filter((model) => {
    const text = searchText(model);
    const squashed = compact(text);
    return words.every((word) => {
      const bare = compact(word);
      return text.includes(word) || (bare.length > 0 && squashed.includes(bare));
    });
  });
}

// ── Badges / gating ─────────────────────────────────────────────────────────

export type ModelBadge =
  | { kind: "legacy" }
  | { kind: "retiring"; date: string; successorName: string | null }
  | { kind: "retired"; successorName: string | null }
  | { kind: "needs-cli"; minVersion: string; /** false = version unknown, hint only */ verified: boolean };

export interface BadgeContext {
  nowMs: number;
  cliVersion: string | null;
}

function successorName(model: ModelDefinition): string | null {
  if (!model.successorId) return null;
  return getBuiltinModel(model.successorId)?.name ?? model.successorId;
}

export function getModelBadges(model: ModelDefinition, ctx: BadgeContext): ModelBadge[] {
  const badges: ModelBadge[] = [];
  if (model.retiresOn) {
    badges.push(
      isModelRetired(model, ctx.nowMs)
        ? { kind: "retired", successorName: successorName(model) }
        : { kind: "retiring", date: model.retiresOn, successorName: successorName(model) },
    );
  } else if (model.lifecycle === "legacy") {
    badges.push({ kind: "legacy" });
  }
  if (model.minCliVersion) {
    if (!ctx.cliVersion) badges.push({ kind: "needs-cli", minVersion: model.minCliVersion, verified: false });
    else if (!isModelSupportedByCli(model, ctx.cliVersion)) badges.push({ kind: "needs-cli", minVersion: model.minCliVersion, verified: true });
  }
  return badges;
}

export type DisabledReason = "cli-outdated" | "planner";

export function getDisabledReason(
  model: ModelDefinition,
  purpose: "chat" | "planner",
  cliVersion: string | null,
): DisabledReason | null {
  if (model.minCliVersion && cliVersion && !isModelSupportedByCli(model, cliVersion)) return "cli-outdated";
  if (purpose === "planner" && !isPlannerModel(model)) return "planner";
  return null;
}

// ── Grouping ────────────────────────────────────────────────────────────────

export interface ModelGroup<M> {
  provider: string;
  models: M[];
}

/** Groups by provider in MODEL_PROVIDER_ORDER, unknown providers last (stable). */
export function groupByProvider<M extends { provider: string }>(models: readonly M[]): ModelGroup<M>[] {
  const order = [...new Set([...MODEL_PROVIDER_ORDER, ...models.map((model) => model.provider)])];
  return order
    .map((provider) => ({ provider, models: models.filter((model) => model.provider === provider) }))
    .filter((group) => group.models.length > 0);
}

export function providerGroupLabel(provider: string, inheritLabel: string): string {
  if (provider === INHERIT_GROUP) return inheritLabel;
  if (provider.startsWith("remote-")) return `SSH / ${provider.slice("remote-".length).toUpperCase()}`;
  return provider.toUpperCase();
}

// ── Effort ──────────────────────────────────────────────────────────────────

export function getEffortOptions(model: Pick<ModelDefinition, "efforts"> | null | undefined): readonly EffortLevel[] {
  return model?.efforts ?? [];
}

/** Effort that will actually be sent: explicit choice clamped to the model, else its default. */
export function displayedEffort(
  model: Pick<ModelDefinition, "efforts" | "defaultEffort" | "effort">,
  effort: EffortLevel | null | undefined,
): EffortLevel | null {
  return resolveEffort(model, effort ?? model.effort ?? undefined);
}

// ── Keyboard ────────────────────────────────────────────────────────────────

/** Next active id among enabled options, wrapping at both ends. */
export function moveActiveId(ids: readonly string[], activeId: string | null, delta: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const index = activeId === null ? -1 : ids.indexOf(activeId);
  if (index === -1) return delta === 1 ? (ids[0] ?? null) : (ids[ids.length - 1] ?? null);
  return ids[(index + delta + ids.length) % ids.length] ?? null;
}

// ── Menu placement ──────────────────────────────────────────────────────────

export interface AnchorRect {
  top: number;
  bottom: number;
  right: number;
}

export interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

const MENU_WIDTH = 380;
const EDGE = 8;
const GAP = 6;

/** Right-aligned under the trigger, flipped above when there is more room there. */
export function computeMenuPosition(rect: AnchorRect, viewportWidth: number, viewportHeight: number): MenuPosition {
  const width = Math.min(MENU_WIDTH, Math.max(0, viewportWidth - EDGE * 2));
  const below = viewportHeight - rect.bottom - 14;
  const above = rect.top - 14;
  const up = below < 220 && above > below;
  const maxHeight = Math.min(420, Math.max(80, up ? above : below), viewportHeight - EDGE * 2);
  return {
    width,
    maxHeight,
    left: Math.max(EDGE, Math.min(rect.right - width, viewportWidth - width - EDGE)),
    top: Math.max(EDGE, up ? rect.top - maxHeight - GAP : Math.min(rect.bottom + GAP, viewportHeight - maxHeight - EDGE)),
  };
}
