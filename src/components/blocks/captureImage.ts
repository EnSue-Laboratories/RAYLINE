/**
 * Styling for "copy message as image" captures (CopyImageBtn). Pure — the
 * DOM measuring and html-to-image call stay in the component.
 */

import type { Wallpaper } from "@shared/state/types";

export const CAPTURE_BG_SOLID = "#0D0D10";
export const CAPTURE_BACKGROUND = "linear-gradient(180deg, #121622 0%, #0A0B10 100%)";
export const CAPTURE_PADDING_X = 24;
export const CAPTURE_PADDING_TOP = 20;
export const CAPTURE_PADDING_BOTTOM = 18;

/** CSS applied to the captured node (string-valued, as html-to-image wants). */
export type CaptureStyle = Partial<Record<
  | "border" | "borderRadius" | "boxShadow" | "padding" | "boxSizing" | "width"
  | "background" | "backgroundColor" | "backgroundImage" | "backgroundSize" | "backgroundPosition" | "backgroundRepeat",
  string
>>;

export interface CaptureLayout {
  width: number;
  height: number;
  style: CaptureStyle;
}

export type CaptureWallpaper = Pick<Wallpaper, "dataUrl" | "imgOpacity">;

/** Total image size and frame style for content of the given size. */
export function buildCaptureLayout(
  contentWidth: number,
  contentHeight: number,
  wallpaper: CaptureWallpaper | null | undefined,
): CaptureLayout {
  const style: CaptureStyle = {
    border: "1px solid var(--control-border)",
    borderRadius: "18px",
    boxShadow: "0 20px 44px rgba(0,0,0,0.28)",
    padding: `${CAPTURE_PADDING_TOP}px ${CAPTURE_PADDING_X}px ${CAPTURE_PADDING_BOTTOM}px`,
    boxSizing: "content-box",
    width: `${contentWidth}px`,
  };

  const dataUrl = wallpaper?.dataUrl;
  if (dataUrl) {
    const opacity = Number.isFinite(wallpaper.imgOpacity) ? Math.min(1, Math.max(0, wallpaper.imgOpacity / 100)) : 1;
    const overlayAlpha = 0.68 + (1 - opacity) * 0.25;
    style.backgroundColor = CAPTURE_BG_SOLID;
    style.backgroundImage = `linear-gradient(rgba(13,13,16,${overlayAlpha.toFixed(2)}), rgba(13,13,16,${(overlayAlpha + 0.1).toFixed(2)})), url(${dataUrl})`;
    style.backgroundSize = "cover, cover";
    style.backgroundPosition = "center, center";
    style.backgroundRepeat = "no-repeat, no-repeat";
  } else {
    style.background = CAPTURE_BACKGROUND;
  }

  return {
    width: contentWidth + CAPTURE_PADDING_X * 2,
    height: contentHeight + CAPTURE_PADDING_TOP + CAPTURE_PADDING_BOTTOM,
    style,
  };
}
