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
import type { EffortLevel } from "../models/types";

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
  /** Sidebar group collapsed (persisted by the sidebar's collapse toggle). */
  collapsed?: boolean;
}

// ── Root ────────────────────────────────────────────────────────────────────

export interface PersistedAppState {
  convos?: Conversation[];
  /** Active conversation id. */
  active?: string | null;
  cwd?: string | null;
  defaultModel?: string;
  /** Last reasoning effort picked per model id (restored on new chats / model switches). */
  effortByModel?: Record<string, EffortLevel>;
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

// ── v2 split storage ────────────────────────────────────────────────────────
//
// userData/state-v2/
//   index.json                 PersistedAppIndex (settings + conversation metadata, no transcripts)
//   conversations/<id>.json    PersistedConversationFile (one transcript each)
//
// Migration: on first `state:load` with no index.json, main splits the legacy
// claudi-state.json into the v2 layout. The legacy file is left untouched so
// older builds keep working (downgrade-safe; they just won't see newer edits).
// All writes are async, atomic (temp file + rename) and serialized per path.

export const STATE_STORE_VERSION = 2;

/** Archived tool results/args larger than this are truncated on save. */
export const ARCHIVED_TOOL_PAYLOAD_LIMIT = 16 * 1024;

/** A conversation without its transcript, as stored in index.json. */
export type ConversationMeta = Omit<Conversation, "archivedMessages">;

export interface PersistedAppIndex extends Omit<PersistedAppState, "convos"> {
  version: typeof STATE_STORE_VERSION;
  convos: ConversationMeta[];
}

export interface PersistedConversationFile {
  version: typeof STATE_STORE_VERSION;
  id: string;
  archivedMessages: Conversation["archivedMessages"];
}

/** Delta write: only conversations whose transcript changed since the last save. */
export interface ConversationTranscriptDelta {
  upserts: Array<{ id: string; archivedMessages: Conversation["archivedMessages"] }>;
  /** Conversation ids whose transcript files should be removed. */
  deletes: string[];
}

/** Payload of `state:save` — index is optional so transcript-only flushes stay cheap. */
export interface StateSaveRequest {
  index?: PersistedAppIndex;
  transcripts?: ConversationTranscriptDelta;
}
