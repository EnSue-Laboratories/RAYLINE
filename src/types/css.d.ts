/**
 * Electron's `-webkit-app-region` (window drag regions) is missing from
 * React's CSSProperties; declare it once for the whole renderer.
 */

import "react";

declare module "react" {
  interface CSSProperties {
    WebkitAppRegion?: "drag" | "no-drag";
  }
}
