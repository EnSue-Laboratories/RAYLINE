/**
 * Remembers the reasoning effort last picked for each model, so new chats and
 * model switches come back with the user's preferred level instead of the
 * model default. Pure helpers; persisted as `effortByModel` in app settings.
 */

import { normalizeModelId } from "@shared/models/registry";
import { isEffortLevel, type EffortLevel, type ModelDefinition } from "@shared/models/types";

export type EffortByModel = Readonly<Record<string, EffortLevel>>;

const MAX_ENTRIES = 64;

/** Remembered effort for `modelId`, only if that model still supports it. */
export function rememberedEffort(
  memory: EffortByModel,
  modelId: string,
  model: Pick<ModelDefinition, "efforts"> | null | undefined,
): EffortLevel | null {
  const effort = memory[normalizeModelId(modelId)];
  if (!effort) return null;
  return model?.efforts?.some((level) => level === effort) ? effort : null;
}

/** Record a pick; `null` (model default) forgets the entry. Returns `memory` when unchanged. */
export function rememberEffort(memory: EffortByModel, modelId: string, effort: EffortLevel | null): EffortByModel {
  const key = normalizeModelId(modelId);
  if (!key) return memory;
  if (effort === null) {
    if (!(key in memory)) return memory;
    const next = { ...memory };
    delete next[key];
    return next;
  }
  if (memory[key] === effort) return memory;
  const entries = Object.entries({ ...memory, [key]: effort });
  // Keep the map bounded (oldest insertion order first).
  return Object.fromEntries(entries.slice(Math.max(0, entries.length - MAX_ENTRIES)));
}

/** Validate a persisted map (drops unknown levels / non-string keys). */
export function normalizeEffortByModel(value: unknown): EffortByModel {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, EffortLevel> = {};
  for (const [key, effort] of Object.entries(value)) {
    const id = normalizeModelId(key);
    if (id && isEffortLevel(effort)) out[id] = effort;
  }
  return out;
}
