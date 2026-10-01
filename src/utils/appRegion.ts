import type { CSSProperties } from "react";

/** Style fragments for Electron window drag regions; spread into a style object. */
export const DRAG: CSSProperties = { WebkitAppRegion: "drag" };
export const NO_DRAG: CSSProperties = { WebkitAppRegion: "no-drag" };
