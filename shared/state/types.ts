/**
 * Persisted application state: the object the main window passes to
 * `save-state` / `save-state-sync` and receives from `load-state`
 * (userData/claudi-state.json). Built by `persistStatePayload` in src/App.
 *
 * `load-state` returns whatever is on disk, possibly written by older
 * versions, so every field is optional and must be normalized by the
 * renderer (see App's load effect). Use `isPersistedAppState` at the
 * boundary.
 */

import type { Conversation, QueuedMessage } from "../chat/types";
import type { RemoteSshRuntimeState } from "../providers/types";

export type Locale = "en-US" | "zh-CN";

// ── Appearance (src/utils/appearance) ───────────────────────────────────────

export type AppearancePaletteKey =
  | "background"
  | "pane"
  | "surface"
  | "surfaceStrong"
  | "border"
  | "accent"
  | "success"
  | "danger"
  | "warning"
  | "text";

export type AppearanceTypographyKey = "uiFont" | "contentFont" | "monoFont";

export interface AppearanceProfile {
  /** `#RRGGBB` colors. */
  palette: Record<AppearancePaletteKey, string>;
  /** CSS font-family stacks. */
  typography: Record<AppearanceTypographyKey, string>;
}

export type ThemeMode = "dark" | "light";

export interface Appearance {
  /** APPEARANCE_VERSION (currently 3). */
  version: number;
  profiles: Record<ThemeMode, AppearanceProfile>;
}

// ── Wallpaper (src/utils/wallpaper) ─────────────────────────────────────────

/** Runtime wallpaper; `dataUrl` is loaded via `read-image` and never persisted. */
export interface Wallpaper {
  path: string | null;
  dataUrl: string | null;
  /** 0–32 px */
  imgBlur: number;
  /** 0–100 % */
  imgOpacity: number;
}

/** Persisted wallpaper (`getPersistedWallpaper`). */
export interface PersistedWallpaper {
  path: string;
  imgBlur: number;
  imgOpacity: number;
}

// ── Projects ────────────────────────────────────────────────────────────────

/** `state.projects[<repo root>]` */
export interface ProjectMeta {
  name?: string;
  hidden?: boolean;
  /** Added via "New project" rather than discovered from conversations. */
  manual?: boolean;
  /** Extra context appended to the agent system prompt for this project. */
  context?: string;
}

// ── Root ────────────────────────────────────────────────────────────────────

export interface PersistedAppState {
  convos?: Conversation[];
  /** Active conversation id. */
  active?: string | null;
  cwd?: string | null;
  defaultModel?: string;
  /** A `Locale` when written by current versions; normalize with `normalizeLocale`. */
  locale?: string;
  /** 12–22 */
  fontSize?: number;
  /** 0–20 */
  sidebarActiveOpacity?: number;
  wallpaper?: PersistedWallpaper | null;
  appearance?: Appearance;
  projects?: Record<string, ProjectMeta>;
  draftsCollapsed?: boolean;
  defaultPrBranch?: string;
  coauthorEnabled?: boolean;
  coauthorTrailer?: string;
  /** 0–20 */
  appBlur?: number;
  /** 30–100 */
  appOpacity?: number;
  developerMode?: boolean;
  sidebarTerminalEnabled?: boolean;
  remoteSshCommand?: string;
  remoteSshRuntime?: RemoteSshRuntimeState;
  chromeControlsOnHover?: boolean;
  /** Chime id (src/utils/chime CHIME_SOUNDS), default "glass". */
  notificationSound?: string;
  notificationsMuted?: boolean;
  queuedMessages?: QueuedMessage[];

  /** Project Manager repo list; owned by `gh-save-pm-state`, preserved by main. */
  pmRepos?: string[];
  /** @deprecated legacy "zh" | "en"; migrated to `locale`. */
  language?: string;
}

/** Boundary guard for `load-state` results (shape check only). */
export function isPersistedAppState(value: unknown): value is PersistedAppState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return !("convos" in value) || value.convos === undefined || Array.isArray(value.convos);
}
