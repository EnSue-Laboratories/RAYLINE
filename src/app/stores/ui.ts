/** Ephemeral (non-persisted) shell UI state. */

import type { EffortLevel } from "@shared/models/types";
import { createStore, useStore } from "../../store/createStore";

export interface UiState {
  stateLoaded: boolean;
  sidebarOpen: boolean;
  showSettings: boolean;
  showNewChatCard: boolean;
  /**
   * Project preset for the new-chat card: undefined = derive from context,
   * null = drafts, string = that project (project-row "new chat").
   */
  newChatProject: string | null | undefined;
  /** Effort picked while no conversation is active; applied to the next new chat. */
  newChatEffort: EffortLevel | null;
  showDispatchCard: boolean;
  showMulticaSetup: boolean;
  showNewProject: boolean;
  sidebarTerminalOpen: boolean;
  hasUpdate: boolean;
  /** `process.platform` from main (null until `system-info` resolves). */
  platform: string | null;
  draftsPath: string | null;
}

export const uiStore = createStore<UiState>({
  stateLoaded: false,
  sidebarOpen: true,
  showSettings: false,
  showNewChatCard: false,
  newChatProject: undefined,
  newChatEffort: null,
  showDispatchCard: false,
  showMulticaSetup: false,
  showNewProject: false,
  sidebarTerminalOpen: false,
  hasUpdate: false,
  platform: null,
  draftsPath: null,
});

export function getUi(): UiState {
  return uiStore.getState();
}

/** Shallow patch; skips the notification when nothing changed. */
export function patchUi(patch: Partial<UiState>): void {
  uiStore.setState((prev) => {
    for (const key of Object.keys(patch) as (keyof UiState)[]) {
      if (!Object.is(prev[key], patch[key])) return { ...prev, ...patch };
    }
    return prev;
  });
}

export function useUi<K extends keyof UiState>(key: K): UiState[K] {
  return useStore(uiStore, (state) => state[key]);
}

/** Effective platform (falls back to the user agent before `system-info` resolves). */
export function getEffectivePlatform(platform: string | null): string {
  if (platform) return platform;
  if (typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent || "")) return "win32";
  return "";
}
