/**
 * Renderer-only global augmentation for the contextBridge APIs.
 * Kept under src/ (DOM project) so the electron project never sees `Window`.
 *
 * `api` is exposed by electron/preload (main + terminal windows) and `ghApi`
 * by electron/preload-pm (Project Manager window). Each is actually missing
 * in the other window kind and in plain-browser `vite` dev; they are typed as
 * present for ergonomics, so keep the existing `window.api?.…` / `if
 * (!window.api)` guards where code can run outside Electron.
 */

import type { GithubApi, RaylineApi } from "@shared/ipc/renderer-api";

declare global {
  interface Window {
    api: RaylineApi;
    ghApi: GithubApi;
  }
}

export {};
