/**
 * Typed views of still-unconverted modules used by the Project Manager
 * window. Drop each cast once the owning package converts the module.
 */
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import {
  createTranslator as untypedCreateTranslator,
  detectDefaultLocale as untypedDetectDefaultLocale,
  normalizeLocale as untypedNormalizeLocale,
} from "../i18n";
import UntypedHoverIconButton from "../components/HoverIconButton";
import {
  applyPaneInteractionStyle as untypedApplyPaneInteractionStyle,
  getPaneInteractionStyle as untypedGetPaneInteractionStyle,
} from "../utils/paneSurface";

// Theme, appearance, wallpaper and pane-surface casts are shared with the
// terminal window.
export {
  applyAppearanceToDocument,
  applyAppearanceWindowBackground,
  getPaneSurfaceStyle,
  getWallpaperImageFilter,
  normalizeAppearance,
  normalizeWallpaper,
  useTheme,
  type TerminalWallpaper as PmWallpaper,
} from "../components/terminal/boundary";

export type Locale = string;
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

// TODO(ts-boundary): drop once data-i18n lands (i18n).
export const createTranslator = untypedCreateTranslator as (locale: Locale | null | undefined) => Translate;
// TODO(ts-boundary): drop once data-i18n lands (i18n).
export const detectDefaultLocale = untypedDetectDefaultLocale as () => Locale;
// TODO(ts-boundary): drop once data-i18n lands (i18n).
export const normalizeLocale = untypedNormalizeLocale as (locale: unknown) => Locale;

export type PaneInteractionState = "idle" | "hover" | "active";

// TODO(ts-boundary): drop once utils/paneSurface is converted.
export const getPaneInteractionStyle = untypedGetPaneInteractionStyle as (state: PaneInteractionState) => CSSProperties;
// TODO(ts-boundary): drop once utils/paneSurface is converted.
export const applyPaneInteractionStyle = untypedApplyPaneInteractionStyle as (
  element: HTMLElement,
  state: PaneInteractionState,
) => void;

export interface HoverIconButtonProps {
  tooltip?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  baseColor?: string;
  hoverColor?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

// TODO(ts-boundary): drop once components/HoverIconButton is converted.
export const HoverIconButton = UntypedHoverIconButton as (props: HoverIconButtonProps) => ReactNode;
