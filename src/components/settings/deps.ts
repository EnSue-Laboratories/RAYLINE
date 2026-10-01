/**
 * Dependencies shared by Settings, the model picker, MulticaSetupModal and
 * RuntimeSetupCard. Typed modules are re-exported as-is; the two modules that
 * are still `// @ts-nocheck` get a single typed cast each (ts-boundary).
 */

import type { ComponentType } from "react";
import { playChime as rawPlayChime, CHIME_SOUNDS as RAW_CHIME_SOUNDS } from "../../utils/chime";
import RawWindowDragSpacer from "../WindowDragSpacer";

export { createTranslator, isMessageKey, type MessageKey, type Translator } from "../../i18n";
export { useFontScale, type FontScale } from "../../contexts/FontSizeContext";
export { useTheme, type ThemePreference } from "../../contexts/ThemeContext";
export { DEFAULT_APPEARANCE, FONT_OPTIONS, LOGO_RED, isValidHexColor, normalizeAppearance } from "../../utils/appearance";
export type { FontOption } from "../../utils/appearance/constants";
export { getPaneSurfaceStyle } from "../../utils/paneSurface";
export { DEFAULT_WALLPAPER, normalizeWallpaper } from "../../utils/wallpaper";
export { loadMulticaState, normalizeMulticaServerUrl, saveMulticaState } from "../../multica/store";
export { useOpenCodeModels, type UseOpenCodeModelsResult } from "../../data/openCodeModels";
export { useProviderUpstreams } from "../../data/providerUpstreams";
export {
  getRuntimeSetupCommand,
  RUNTIME_SETUP_DOCS,
  RUNTIME_SETUP_PROVIDERS,
  type RuntimeSetupAction,
  type RuntimeSetupProvider,
  type RuntimeSetupProviderId,
} from "../../data/runtimeSetup";

export type FontOptionGroup = "ui" | "content" | "mono";

export interface ChimeSound {
  id: string;
  label: string;
  src: string;
}

// TODO(ts-boundary): drop once src/utils/chime is converted
export const CHIME_SOUNDS = RAW_CHIME_SOUNDS as readonly ChimeSound[];
// TODO(ts-boundary): drop once src/utils/chime is converted
export const playChime = rawPlayChime as (id: string) => void;

export interface WindowDragSpacerProps {
  reserveSidebarRail?: boolean;
  reserveWindowsHeader?: boolean;
}
// TODO(ts-boundary): drop once WindowDragSpacer is converted (app-shell)
export const WindowDragSpacer = RawWindowDragSpacer as ComponentType<WindowDragSpacerProps>;
