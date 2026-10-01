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

/**
 * `get-app-build` result: `app.getVersion()` / `app.isPackaged` plus the
 * `raylineBuild` metadata electron-builder writes into the packaged
 * package.json (`extraMetadata`). `commit` / `repository` are absent in dev.
 */
export interface AppBuildInfo {
  version: string;
  packaged: boolean;
  /** Full git commit sha the package was built from. */
  commit?: string;
  /** `owner/repo` the release is published to. */
  repository?: string;
}
