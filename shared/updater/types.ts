/**
 * Auto-updater (electron/auto-updater, electron-updater on Windows only).
 * `updater-check` / `updater-download` / `updater-install` resolve to void;
 * progress is reported via `updater-status` events.
 */

export type UpdaterPhase =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "ready"
  | "error";

/** `updater-status` payload. */
export type UpdaterStatus =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "available"; version: string }
  | { phase: "not-available" }
  | { phase: "downloading"; percent: number }
  | { phase: "ready"; version: string }
  | { phase: "error"; error: string };
