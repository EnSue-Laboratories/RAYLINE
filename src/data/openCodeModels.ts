import { useEffect, useMemo } from "react";
import type { OpenCodeModelDefinition } from "@shared/models";
import type { OpenCodeModelEntry, OpenCodeState, OpenCodeStatus } from "@shared/providers/types";
import { createStore, useStore } from "../store/createStore";
import {
  getOpenCodeStore,
  openCodeEntryToModel,
  reloadOpenCodeStore,
  removeOpenCodeModel,
  saveOpenCodeState,
  upsertOpenCodeModel,
  type OpenCodeModelInput,
} from "../opencode/store";
import { createRefresher } from "./createRefresher";

/** `opencode-status` result with every field the UI reads guaranteed present. */
export type OpenCodeStatusView = Pick<
  OpenCodeStatus,
  "installed" | "configured" | "version" | "configPath" | "authPath" | "providers" | "supportedProviders"
> &
  Partial<OpenCodeStatus>;

const EMPTY_STATUS: OpenCodeStatusView = {
  installed: false,
  configured: false,
  version: "",
  configPath: "",
  authPath: "",
  providers: [],
  supportedProviders: [],
};

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? (value as readonly unknown[]).filter((item): item is string => typeof item === "string" && item !== "") : [];
}

export function normalizeOpenCodeStatus(status: unknown): OpenCodeStatusView {
  if (!status || typeof status !== "object") return EMPTY_STATUS;
  const source = status as Partial<OpenCodeStatus>;
  return {
    ...EMPTY_STATUS,
    ...source,
    installed: Boolean(source.installed),
    configured: Boolean(source.configured),
    providers: stringList(source.providers),
    supportedProviders: stringList(source.supportedProviders),
  };
}

interface OpenCodeStatusState {
  status: OpenCodeStatusView;
  loading: boolean;
}

const statusStore = createStore<OpenCodeStatusState>({ status: EMPTY_STATUS, loading: false });

/** Mount-triggered refreshes within this window reuse the last probe. */
const MOUNT_REFRESH_STALE_MS = 5_000;

const refresher = createRefresher(async () => {
  reloadOpenCodeStore();
  // `api` is missing outside Electron and in the Project Manager window.
  const api: Window["api"] | undefined = typeof window !== "undefined" ? window.api : undefined;
  if (!api?.opencodeStatus) return;
  statusStore.setState((prev) => ({ ...prev, loading: true }));
  let status = EMPTY_STATUS;
  try {
    status = normalizeOpenCodeStatus(await api.opencodeStatus());
  } catch {
    status = EMPTY_STATUS;
  }
  statusStore.setState({ status, loading: false });
}, MOUNT_REFRESH_STALE_MS);

/** Re-read saved models and re-probe the OpenCode CLI (shared by every hook instance). */
export function refreshOpenCodeModels(): Promise<void> {
  return refresher.refresh();
}

function notifyOpenCodeChanged(): void {
  window.dispatchEvent(new CustomEvent("opencode-refresh"));
}

function saveModel(entry: OpenCodeModelInput): OpenCodeState {
  const next = upsertOpenCodeModel(entry);
  notifyOpenCodeChanged();
  return next;
}

function removeModel(modelKey: string): OpenCodeState {
  const next = removeOpenCodeModel(modelKey);
  notifyOpenCodeChanged();
  return next;
}

function replaceState(patch: Partial<OpenCodeState>): OpenCodeState {
  const next = saveOpenCodeState(patch);
  notifyOpenCodeChanged();
  return next;
}

export interface UseOpenCodeModelsResult {
  /** Enabled, complete entries as picker models; empty unless the CLI is installed. */
  models: OpenCodeModelDefinition[];
  rawModels: OpenCodeModelEntry[];
  status: OpenCodeStatusView;
  loading: boolean;
  refresh: () => Promise<void>;
  saveModel: (entry: OpenCodeModelInput) => OpenCodeState;
  removeModel: (modelKey: string) => OpenCodeState;
  replaceState: (patch: Partial<OpenCodeState>) => OpenCodeState;
}

/**
 * OpenCode models + CLI status. State is shared across all callers: one
 * status probe serves every mounted instance, and saves update everyone.
 */
export function useOpenCodeModels(): UseOpenCodeModelsResult {
  const state = useStore(getOpenCodeStore(), (s) => s);
  const { status, loading } = useStore(statusStore, (s) => s);

  useEffect(() => {
    void refresher.refreshIfStale();
  }, []);

  useEffect(() => {
    const handleRefresh = () => {
      void refresher.refresh();
    };
    window.addEventListener("opencode-refresh", handleRefresh);
    return () => window.removeEventListener("opencode-refresh", handleRefresh);
  }, []);

  const models = useMemo(() => {
    if (!status.installed) return [];
    return state.models.map(openCodeEntryToModel).filter((model): model is OpenCodeModelDefinition => model !== null);
  }, [state.models, status.installed]);

  return useMemo(
    () => ({
      models,
      rawModels: state.models,
      status,
      loading,
      refresh: refreshOpenCodeModels,
      saveModel,
      removeModel,
      replaceState,
    }),
    [models, state.models, status, loading],
  );
}
