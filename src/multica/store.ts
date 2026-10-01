/**
 * Persist Multica setup across restarts (localStorage `multica.v1`). One
 * server URL per install for v1 (there's no UI to support multiple). The key
 * is versioned so we can migrate later.
 *
 * Safe to import statically: no work happens at import time. The shared
 * `createStore` store is created on first `getMulticaStore()` call and kept in
 * sync by `saveMulticaState` / `clearMulticaState`.
 */

import type { MulticaAgent, MulticaStoreState } from "@shared/providers/types";
import { createStore, type Store } from "../store/createStore";

export type { MulticaAgent, MulticaStoreState } from "@shared/providers/types";

const KEY = "multica.v1";
const LEGACY_PRIVATE_SERVER_URL = "https://srv1309901.tail96f1f.ts.net";

const defaultState = (): MulticaStoreState => ({
  serverUrl: "", // e.g. https://your-multica-server
  email: "",
  token: "", // JWT, 30-day TTL
  tokenIssuedAt: 0,
  workspaceId: "",
  workspaceSlug: "",
  agentsCache: [], // last-known agents for instant model-picker render
  agentsCachedAt: 0,
});

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

export function normalizeMulticaServerUrl(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
}

/** Server payload → agent; null without a string id. Unknown fields are dropped. */
export function normalizeMulticaAgent(value: unknown): MulticaAgent | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) return null;
  return {
    id: value.id,
    name: typeof value.name === "string" ? value.name : "",
    ...(typeof value.runtime_id === "string" ? { runtime_id: value.runtime_id } : {}),
    ...(typeof value.status === "string" ? { status: value.status } : {}),
  };
}

export function normalizeMulticaAgents(value: unknown): MulticaAgent[] {
  if (!Array.isArray(value)) return [];
  const agents: MulticaAgent[] = [];
  for (const item of value as readonly unknown[]) {
    const agent = normalizeMulticaAgent(item);
    if (agent) agents.push(agent);
  }
  return agents;
}

function stringField(source: UnknownRecord, key: keyof MulticaStoreState): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

function numberField(source: UnknownRecord, key: keyof MulticaStoreState): number {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function sanitizeMulticaState(raw: unknown): MulticaStoreState {
  const source: UnknownRecord = isRecord(raw) ? raw : {};
  const next: MulticaStoreState = {
    serverUrl: normalizeMulticaServerUrl(source.serverUrl),
    email: stringField(source, "email"),
    token: stringField(source, "token"),
    tokenIssuedAt: numberField(source, "tokenIssuedAt"),
    workspaceId: stringField(source, "workspaceId"),
    workspaceSlug: stringField(source, "workspaceSlug"),
    agentsCache: normalizeMulticaAgents(source.agentsCache),
    agentsCachedAt: numberField(source, "agentsCachedAt"),
  };

  const onlyLegacyDefault =
    next.serverUrl === LEGACY_PRIVATE_SERVER_URL &&
    !next.email &&
    !next.token &&
    !next.workspaceId &&
    !next.workspaceSlug;
  if (onlyLegacyDefault) {
    next.serverUrl = "";
  }

  if (!next.serverUrl) {
    next.token = "";
    next.tokenIssuedAt = 0;
    next.workspaceId = "";
    next.workspaceSlug = "";
    next.agentsCache = [];
    next.agentsCachedAt = 0;
  }

  return next;
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Fresh read from localStorage. */
export function loadMulticaState(): MulticaStoreState {
  try {
    return sanitizeMulticaState(JSON.parse(getStorage()?.getItem(KEY) || "{}"));
  } catch {
    return defaultState();
  }
}

let store: Store<MulticaStoreState> | null = null;

/** Shared store, created from storage on first use. */
export function getMulticaStore(): Store<MulticaStoreState> {
  store ??= createStore(loadMulticaState());
  return store;
}

/** Merge `patch` into the saved state, persist it, and update the shared store. */
export function saveMulticaState(patch: Partial<MulticaStoreState>): MulticaStoreState {
  const next = sanitizeMulticaState({ ...loadMulticaState(), ...patch });
  getStorage()?.setItem(KEY, JSON.stringify(next));
  getMulticaStore().setState(next);
  return next;
}

export function clearMulticaState(): void {
  getStorage()?.removeItem(KEY);
  getMulticaStore().setState(defaultState());
}

/** True when a token, server and workspace are all configured. */
export function isMulticaConfigured(state: MulticaStoreState): boolean {
  return Boolean(state.token && state.serverUrl && (state.workspaceId || state.workspaceSlug));
}

export function isMulticaAuthenticated(): boolean {
  return isMulticaConfigured(loadMulticaState());
}
