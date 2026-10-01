/**
 * Picker-specific view logic layered on @shared/models' `visibleModels` /
 * `filterModels`: retirement + CLI-version gating, badges, grouping, effort
 * display, keyboard movement and menu placement. No React, no DOM.
 */

import {
  getBuiltinModel,
  isModelRetired,
  filterModels,
  isModelSupportedByCli,
  isPlannerModel,
  MODEL_PROVIDER_ORDER,
  normalizeModelId,
  resolveEffort,
  visibleModels,
  type EffortLevel,
  type InstalledProviders,
  type ModelDefinition,
  type ModelProviderGroupId,
} from "@shared/models";
import type { CliInstalledSnapshot } from "@shared/providers/types";

export type CliVersions = NonNullable<CliInstalledSnapshot["versions"]>;
type VersionedProvider = keyof CliVersions;

function isVersionedProvider(provider: string): provider is VersionedProvider {
  return provider === "claude" || provider === "codex" || provider === "opencode" || provider === "grok" || provider === "agy";
}

/** Version of the local CLI that runs `model`, when main reported one (never for SSH remotes). */
export function cliVersionFor(model: ModelDefinition, versions: CliVersions | undefined): string | null {
  if (!versions || !isVersionedProvider(model.provider)) return null;
  return versions[model.provider] ?? null;
}

/**
 * Drops models whose `retiresOn` has passed unless they are a saved choice.
 * Applied on top of `visibleModels` (hidden / unavailable / not installed).
 */
export function dropRetired<M extends ModelDefinition>(models: readonly M[], retainedIds: readonly (string | null | undefined)[], nowMs: number): M[] {
  const retained = new Set<string>();
  for (const id of retainedIds) if (id) retained.add(normalizeModelId(id));
  return models.filter((model) => retained.has(model.id) || !isModelRetired(model, nowMs));
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

export type DisabledReason = "unavailable" | "cli-outdated" | "planner";

export function getDisabledReason(
  model: ModelDefinition,
  purpose: PickerPurpose,
  cliVersion: string | null,
): DisabledReason | null {
  if (model.unavailable) return "unavailable";
  if (model.minCliVersion && cliVersion && !isModelSupportedByCli(model, cliVersion)) return "cli-outdated";
  if (purpose === "planner" && !isPlannerModel(model)) return "planner";
  return null;
}

// ── Options ─────────────────────────────────────────────────────────────────

export type PickerPurpose = "chat" | "planner";

export interface PickerOption {
  /** Model id ("" for Dispatch's inherit option). */
  id: string;
  /** Group key: the model provider, or INHERIT_GROUP. */
  provider: string;
  model: ModelDefinition;
  badges: ModelBadge[];
  disabled: DisabledReason | null;
}

export interface PickerOptionsContext {
  installed: InstalledProviders;
  versions: CliVersions | undefined;
  /** Saved choices stay listed (and keep their identity) even when hidden, retired or unavailable. */
  retainedIds: readonly (string | null | undefined)[];
  nowMs: number;
  query: string;
  purpose: PickerPurpose;
}

/** visibleModels → drop retired → fuzzy filter → badges / disabled state. */
export function buildPickerOptions(models: readonly ModelDefinition[], ctx: PickerOptionsContext): PickerOption[] {
  const visible = dropRetired(visibleModels(models, ctx.installed, ctx.retainedIds), ctx.retainedIds, ctx.nowMs);
  return filterModels(visible, ctx.query).map((model) => {
    const cliVersion = cliVersionFor(model, ctx.versions);
    return {
      id: model.id,
      provider: model.provider,
      model,
      badges: getModelBadges(model, { nowMs: ctx.nowMs, cliVersion }),
      disabled: getDisabledReason(model, ctx.purpose, cliVersion),
    };
  });
}

/**
 * Dispatch's "inherit the default model" option (id ""), or null when the
 * query filters it out.
 */
export function filterInheritOption(
  inherited: ModelDefinition,
  label: string,
  query: string,
  purpose: PickerPurpose = "chat",
): PickerOption | null {
  const model: ModelDefinition = { ...inherited, id: "", name: label };
  if (filterModels([model], query).length === 0) return null;
  return { id: "", provider: INHERIT_GROUP, model, badges: [], disabled: getDisabledReason(inherited, purpose, null) };
}

// ── Grouping ────────────────────────────────────────────────────────────────

export interface ModelGroup<M> {
  provider: string;
  models: M[];
}

/** Groups by provider in MODEL_PROVIDER_ORDER, unknown providers last (stable). */
export function groupByProvider<M extends { provider: string }>(models: readonly M[]): ModelGroup<M>[] {
  const order = [...new Set<string>([...MODEL_PROVIDER_ORDER, ...models.map((model) => model.provider)])];
  return order
    .map((provider) => ({ provider, models: models.filter((model) => model.provider === provider) }))
    .filter((group) => group.models.length > 0);
}

/** Synthetic group for Dispatch's "inherit the default model" option. */
export const INHERIT_GROUP: ModelProviderGroupId = "inherit";

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

/** DOM id of an option row (aria-activedescendant / scrollIntoView). */
export function optionDomId(menuId: string, optionId: string): string {
  return `${menuId}-opt-${optionId || "inherit"}`;
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
