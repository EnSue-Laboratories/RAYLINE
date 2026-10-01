/**
 * User-configured OpenCode models, persisted in localStorage
 * (`rayline.opencode.v1`). The `load*` / `save*` functions keep their
 * original contract (read / write storage and return the sanitized state);
 * `getOpenCodeStore()` additionally exposes the state as a shared
 * `createStore` store that every save keeps in sync, so hooks in every
 * component see the same snapshot without re-reading storage.
 */

import type { OpenCodeModelEntry, OpenCodeState } from "@shared/providers/types";
import { createStore, type Store } from "../store/createStore";

export { openCodeEntryToModel } from "@shared/models";
export type { OpenCodeModelEntry, OpenCodeState } from "@shared/providers/types";

const STORAGE_KEY = "rayline.opencode.v1";

/** Loose input accepted by `upsertOpenCodeModel` (legacy `provider`/`model` aliases included). */
export interface OpenCodeModelInput {
  providerId?: string;
  provider?: string;
  modelId?: string;
  model?: string;
  label?: string;
  apiKey?: string;
  baseURL?: string;
  enabled?: boolean;
  thinking?: boolean;
  addedAt?: number;
  updatedAt?: number;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Reasoning-capable model families default to `thinking: true`. */
export function inferThinkingDefault(providerId: string, modelId: string): boolean {
  const value = `${providerId}/${modelId}`.toLowerCase();
  return (
    /deepseek.*(?:r1|reasoner|v4|v3[._-]?[12])/.test(value) ||
    /(?:^|[/:._-])r1(?:$|[/:._-])/.test(value) ||
    value.includes("reasoning") ||
    value.includes("thinking") ||
    value.includes("qwq") ||
    value.includes("qwen3") ||
    value.includes("glm-4.6")
  );
}

export function sanitizeOpenCodeModel(entry: unknown): OpenCodeModelEntry | null {
  if (!isRecord(entry)) return null;
  const providerId = safeString(entry.providerId || entry.provider);
  const modelId = safeString(entry.modelId || entry.model);
  if (!providerId || !modelId) return null;
  const now = Date.now();

  return {
    id: `${providerId}/${modelId}`,
    providerId,
    modelId,
    label: safeString(entry.label),
    apiKey: safeString(entry.apiKey),
    baseURL: safeString(entry.baseURL),
    enabled: typeof entry.enabled === "boolean" ? entry.enabled : true,
    thinking: typeof entry.thinking === "boolean" ? entry.thinking : inferThinkingDefault(providerId, modelId),
    addedAt: finiteOr(entry.addedAt, now),
    updatedAt: finiteOr(entry.updatedAt, now),
  };
}

/** Drop invalid entries and duplicate ids (first wins). */
export function sanitizeOpenCodeState(state: unknown): OpenCodeState {
  const seen = new Set<string>();
  const models: OpenCodeModelEntry[] = [];
  const rawModels: unknown = isRecord(state) ? state.models : undefined;

  for (const raw of Array.isArray(rawModels) ? (rawModels as readonly unknown[]) : []) {
    const model = sanitizeOpenCodeModel(raw);
    if (!model || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push(model);
  }

  return { models };
}

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Fresh read from localStorage (does not touch the shared store). */
export function loadOpenCodeState(): OpenCodeState {
  const storage = getStorage();
  if (!storage) return { models: [] };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { models: [] };
    return sanitizeOpenCodeState(JSON.parse(raw));
  } catch {
    return { models: [] };
  }
}

let store: Store<OpenCodeState> | null = null;

/** Shared store, created (from storage) on first use so importing has no side effects. */
export function getOpenCodeStore(): Store<OpenCodeState> {
  store ??= createStore(loadOpenCodeState());
  return store;
}

/** Re-read storage (e.g. after another window changed it) into the shared store. */
export function reloadOpenCodeStore(): OpenCodeState {
  const next = loadOpenCodeState();
  const current = getOpenCodeStore();
  if (JSON.stringify(current.getState()) !== JSON.stringify(next)) current.setState(next);
  return current.getState();
}

export function saveOpenCodeState(patch?: Partial<OpenCodeState> | null): OpenCodeState {
  const next = sanitizeOpenCodeState({ ...loadOpenCodeState(), ...patch });
  getStorage()?.setItem(STORAGE_KEY, JSON.stringify(next));
  getOpenCodeStore().setState(next);
  return next;
}

/** Insert or replace (by `${providerId}/${modelId}`); keeps the original `addedAt`. */
export function upsertOpenCodeModel(entry: OpenCodeModelInput): OpenCodeState {
  const current = loadOpenCodeState();
  const incoming = sanitizeOpenCodeModel({ ...entry, updatedAt: Date.now() });
  if (!incoming) return current;

  const existing = current.models.find((model) => model.id === incoming.id);
  const nextModel: OpenCodeModelEntry = {
    ...existing,
    ...incoming,
    addedAt: existing?.addedAt || incoming.addedAt || Date.now(),
    updatedAt: Date.now(),
  };
  const models = existing
    ? current.models.map((model) => (model.id === incoming.id ? nextModel : model))
    : [nextModel, ...current.models];

  return saveOpenCodeState({ models });
}

export function removeOpenCodeModel(modelKey: string): OpenCodeState {
  const current = loadOpenCodeState();
  return saveOpenCodeState({
    models: current.models.filter((model) => model.id !== modelKey),
  });
}
