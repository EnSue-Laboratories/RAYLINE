/**
 * Dependencies shared by Settings, the model picker, MulticaSetupModal and
 * RuntimeSetupCard, re-exported from their typed owners.
 */

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

export { CHIME_SOUNDS, playChime, type ChimeSound } from "../../utils/chime";
export { default as WindowDragSpacer, type WindowDragSpacerProps } from "../WindowDragSpacer";
