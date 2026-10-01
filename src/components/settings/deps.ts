/**
 * Typed views of the still-`// @ts-nocheck` modules that Settings, the model
 * picker, MulticaSetupModal and RuntimeSetupCard depend on. Every cast below
 * is a ts-boundary: the owning package converts the module in parallel, after
 * which the cast (and usually this re-export) can be dropped in favour of a
 * direct import.
 */

import type { ComponentType, CSSProperties } from "react";
import type { ModelDefinition } from "@shared/models";
import type {
  MulticaStoreState,
  OpenCodeModelEntry,
  ProviderUpstreamSettings,
  UpstreamProviderId,
} from "@shared/providers/types";
import type { Appearance, Wallpaper } from "@shared/state/types";
import { useFontScale as rawUseFontScale } from "../../contexts/FontSizeContext";
import { useTheme as rawUseTheme } from "../../contexts/ThemeContext";
import { createTranslator as rawCreateTranslator } from "../../i18n";
import {
  DEFAULT_APPEARANCE as RAW_DEFAULT_APPEARANCE,
  FONT_OPTIONS as RAW_FONT_OPTIONS,
  LOGO_RED as RAW_LOGO_RED,
  isValidHexColor as rawIsValidHexColor,
  normalizeAppearance as rawNormalizeAppearance,
} from "../../utils/appearance";
import { getPaneSurfaceStyle as rawGetPaneSurfaceStyle } from "../../utils/paneSurface";
import { DEFAULT_WALLPAPER as RAW_DEFAULT_WALLPAPER, normalizeWallpaper as rawNormalizeWallpaper } from "../../utils/wallpaper";
import { CHIME_SOUNDS as RAW_CHIME_SOUNDS, playChime as rawPlayChime } from "../../utils/chime";
import {
  loadMulticaState as rawLoadMulticaState,
  normalizeMulticaServerUrl as rawNormalizeMulticaServerUrl,
  saveMulticaState as rawSaveMulticaState,
} from "../../multica/store";
import { useOpenCodeModels as rawUseOpenCodeModels } from "../../data/openCodeModels";
import { useProviderUpstreams as rawUseProviderUpstreams } from "../../data/providerUpstreams";
import {
  RUNTIME_SETUP_DOCS as RAW_RUNTIME_SETUP_DOCS,
  RUNTIME_SETUP_PROVIDERS as RAW_RUNTIME_SETUP_PROVIDERS,
  getRuntimeSetupCommand as rawGetRuntimeSetupCommand,
} from "../../data/runtimeSetup";
import RawWindowDragSpacer from "../WindowDragSpacer";

// ── i18n / contexts (data-i18n) ─────────────────────────────────────────────

/** `t(key, vars)` returned by `createTranslator(locale)`. */
export type Translate = (key: string, vars?: Readonly<Record<string, string | number>>) => string;
/** `useFontScale()` result: scales a px value by the user's font size. */
export type FontScale = (px: number) => number;
export type ThemeModeSetting = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export interface ThemeContextValue {
  mode: ThemeModeSetting;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeModeSetting) => void;
}

// TODO(ts-boundary): drop once data-i18n lands (src/i18n)
export const createTranslator = rawCreateTranslator as (locale: string) => Translate;
// TODO(ts-boundary): drop once data-i18n lands (src/contexts/FontSizeContext)
export const useFontScale = rawUseFontScale as () => FontScale;
// TODO(ts-boundary): drop once data-i18n lands (src/contexts/ThemeContext)
export const useTheme = rawUseTheme as () => ThemeContextValue;

// ── utils (appearance / wallpaper / pane surface / chime) ──────────────────

export interface FontOption {
  value: string;
  label: string;
}
export type FontOptionGroup = "ui" | "content" | "mono";
export interface ChimeSound {
  id: string;
  label: string;
  src: string;
}

// TODO(ts-boundary): drop once src/utils/appearance is converted
export const DEFAULT_APPEARANCE = RAW_DEFAULT_APPEARANCE as Appearance;
// TODO(ts-boundary): drop once src/utils/appearance is converted
export const FONT_OPTIONS = RAW_FONT_OPTIONS as Readonly<Record<FontOptionGroup, readonly FontOption[]>>;
// TODO(ts-boundary): drop once src/utils/appearance is converted
export const LOGO_RED = RAW_LOGO_RED as string;
// TODO(ts-boundary): drop once src/utils/appearance is converted
export const isValidHexColor = rawIsValidHexColor as (value: unknown) => boolean;
// TODO(ts-boundary): drop once src/utils/appearance is converted
export const normalizeAppearance = rawNormalizeAppearance as (value: unknown) => Appearance;
// TODO(ts-boundary): drop once src/utils/paneSurface is converted
export const getPaneSurfaceStyle = rawGetPaneSurfaceStyle as (hasWallpaper: boolean) => CSSProperties;
// TODO(ts-boundary): drop once src/utils/wallpaper is converted
export const DEFAULT_WALLPAPER = RAW_DEFAULT_WALLPAPER as Readonly<Wallpaper>;
// TODO(ts-boundary): drop once src/utils/wallpaper is converted
export const normalizeWallpaper = rawNormalizeWallpaper as (wallpaper: Partial<Wallpaper> | null | undefined) => Wallpaper | null;
// TODO(ts-boundary): drop once src/utils/chime is converted
export const CHIME_SOUNDS = RAW_CHIME_SOUNDS as readonly ChimeSound[];
// TODO(ts-boundary): drop once src/utils/chime is converted
export const playChime = rawPlayChime as (id: string) => void;

// ── data stores (data-i18n) ─────────────────────────────────────────────────

// TODO(ts-boundary): drop once data-i18n lands (src/multica/store)
export const loadMulticaState = rawLoadMulticaState as () => MulticaStoreState;
// TODO(ts-boundary): drop once data-i18n lands (src/multica/store)
export const saveMulticaState = rawSaveMulticaState as (patch: Partial<MulticaStoreState>) => MulticaStoreState;
// TODO(ts-boundary): drop once data-i18n lands (src/multica/store)
export const normalizeMulticaServerUrl = rawNormalizeMulticaServerUrl as (value: unknown) => string;

/** Normalized `opencode-status` held by `useOpenCodeModels` (fields Settings reads). */
export interface OpenCodeHookStatus {
  installed: boolean;
  configured: boolean;
  version: string;
  configPath: string;
  providers: string[];
  supportedProviders: string[];
}

/** Argument of `useOpenCodeModels().saveModel` (sanitized by src/opencode/store). */
export interface OpenCodeModelInput {
  providerId: string;
  modelId: string;
  label?: string;
  apiKey?: string;
  baseURL?: string;
  enabled?: boolean;
  thinking?: boolean;
}

export interface OpenCodeModelsHook {
  models: ModelDefinition[];
  rawModels: OpenCodeModelEntry[];
  status: OpenCodeHookStatus;
  loading: boolean;
  refresh: () => Promise<void>;
  saveModel: (entry: OpenCodeModelInput) => unknown;
  removeModel: (modelKey: string) => unknown;
}

export interface ProviderUpstreamsHook {
  configsByProvider: Partial<Record<UpstreamProviderId, Partial<ProviderUpstreamSettings>>>;
  overrideModels: ModelDefinition[];
  saveConfig: (provider: UpstreamProviderId, patch: ProviderUpstreamSettings) => unknown;
  clearConfig: (provider: UpstreamProviderId) => unknown;
}

// TODO(ts-boundary): drop once data-i18n lands (src/data/openCodeModels)
export const useOpenCodeModels = rawUseOpenCodeModels as () => OpenCodeModelsHook;
// TODO(ts-boundary): drop once data-i18n lands (src/data/providerUpstreams)
export const useProviderUpstreams = rawUseProviderUpstreams as () => ProviderUpstreamsHook;

// ── runtime setup data ──────────────────────────────────────────────────────

export type RuntimeSetupProviderId = "claude" | "codex" | "opencode";
export type RuntimeSetupAction = "install" | "signin";
export interface RuntimeSetupProvider {
  id: RuntimeSetupProviderId;
  name: string;
  eyebrow: string;
  description: string;
  primary: boolean;
  installNote: string;
}

// TODO(ts-boundary): drop once src/data/runtimeSetup is converted
export const RUNTIME_SETUP_DOCS = RAW_RUNTIME_SETUP_DOCS as Readonly<Record<RuntimeSetupProviderId, string>>;
// TODO(ts-boundary): drop once src/data/runtimeSetup is converted
export const RUNTIME_SETUP_PROVIDERS = RAW_RUNTIME_SETUP_PROVIDERS as readonly RuntimeSetupProvider[];
// TODO(ts-boundary): drop once src/data/runtimeSetup is converted
export const getRuntimeSetupCommand = rawGetRuntimeSetupCommand as (
  providerId: RuntimeSetupProviderId,
  action: RuntimeSetupAction,
  platform?: string | null,
) => string;

// ── components ──────────────────────────────────────────────────────────────

export interface WindowDragSpacerProps {
  reserveSidebarRail?: boolean;
  reserveWindowsHeader?: boolean;
}
// TODO(ts-boundary): drop once WindowDragSpacer is converted (app-shell)
export const WindowDragSpacer = RawWindowDragSpacer as ComponentType<WindowDragSpacerProps>;
