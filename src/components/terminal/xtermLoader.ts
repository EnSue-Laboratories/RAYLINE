import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";

export interface XtermModules {
  Terminal: typeof Terminal;
  FitAddon: typeof FitAddon;
}

let xtermLoaderPromise: Promise<XtermModules> | null = null;

/**
 * Loads xterm + the fit addon on first use. They live in the lazily-loaded
 * `xterm` chunk (vite.config codeSplitting group) and must only ever be
 * imported dynamically — type-only imports elsewhere are fine.
 */
export function loadXtermModules(): Promise<XtermModules> {
  xtermLoaderPromise ??= (async () => {
    try {
      await import("@xterm/xterm/css/xterm.css");
    } catch {
      // If Vite can't dynamic-import the CSS, a static import in the app entry
      // is the fallback and this isn't fatal.
    }

    const [{ Terminal: XTerminal }, { FitAddon: XFitAddon }] = await Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
    ]);

    return { Terminal: XTerminal, FitAddon: XFitAddon };
  })();

  return xtermLoaderPromise;
}
