/**
 * Public entry for appearance settings. Pure color / typography math lives in
 * ./appearance/{color,normalize,cssVariables}; DOM application in
 * ./appearance/dom.
 */

export type { Appearance, AppearancePaletteKey, AppearanceProfile, AppearanceTypographyKey } from "@shared/state/types";
export {
  APPEARANCE_VERSION,
  DEFAULT_APPEARANCE,
  FONT_OPTIONS,
  LOGO_RED,
  type FontOption,
} from "./appearance/constants";
export { isValidHexColor } from "./appearance/color";
export {
  getAppearanceProfile,
  getAppearanceWindowBackground,
  normalizeAppearance,
} from "./appearance/normalize";
export { buildAppearanceCssVariables, type AppearanceCssVariables } from "./appearance/cssVariables";
export {
  applyAppearanceToDocument,
  applyAppearanceWindowBackground,
  type AppearanceChangeDetail,
  type AppearanceStyleTarget,
  type WindowBackgroundBridge,
} from "./appearance/dom";
