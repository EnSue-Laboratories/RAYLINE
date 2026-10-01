/** Pure auto-updater view state (Windows only). */

import type { UpdaterPhase, UpdaterStatus } from "@shared/updater/types";

export interface UpdaterViewState {
  phase: UpdaterPhase;
  /** Last version reported by `available` / `ready`. */
  version: string | null;
  /** Last download percentage. */
  percent: number;
  error: string | null;
}

export const INITIAL_UPDATER_STATE: UpdaterViewState = Object.freeze({
  phase: "idle",
  version: null,
  percent: 0,
  error: null,
});

/** How long "up to date" stays visible before returning to idle. */
export const NOT_AVAILABLE_RESET_MS = 3000;

/** Fold an `updater-status` event into the view state; sticky fields persist across phases. */
export function applyUpdaterStatus(state: UpdaterViewState, status: UpdaterStatus): UpdaterViewState {
  switch (status.phase) {
    case "available":
    case "ready":
      return { ...state, phase: status.phase, version: status.version || state.version };
    case "downloading":
      return { ...state, phase: status.phase, percent: status.percent };
    case "error":
      return { ...state, phase: status.phase, error: status.error || state.error };
    case "idle":
    case "checking":
    case "not-available":
      return { ...state, phase: status.phase };
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

/** Starting a new check clears the previous error. */
export function beginUpdateCheck(state: UpdaterViewState): UpdaterViewState {
  return { ...state, error: null };
}
