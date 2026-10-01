import type { CSSProperties } from "react";

export type AppRegion = "drag" | "no-drag";

/**
 * Electron's `-webkit-app-region` as a style fragment. React's CSSProperties
 * doesn't declare it, so it is added through an index-signature view instead
 * of a global augmentation. Spread it into a style object.
 */
export function appRegion(region: AppRegion): CSSProperties {
  const style: Record<string, string> = { WebkitAppRegion: region };
  return style;
}

export const NO_DRAG: CSSProperties = appRegion("no-drag");
export const DRAG: CSSProperties = appRegion("drag");
