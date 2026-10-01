export interface ElementBox {
  clientWidth: number;
  clientHeight: number;
  offsetWidth: number;
  offsetHeight: number;
  rectWidth: number;
  rectHeight: number;
}

/** Best-effort structured log to main (only recorded when terminal debug is on). */
export function emitTerminalDebug(event: string, details: Record<string, unknown> = {}): void {
  try {
    window.api?.terminalDebugLog?.({
      source: "renderer",
      page: window.location.pathname,
      event,
      details: {
        perfNow: typeof performance !== "undefined" ? Number(performance.now().toFixed(2)) : null,
        ...details,
      },
    });
  } catch {
    // Debug logging is best-effort only.
  }
}

export function measureElementBox(element: HTMLElement | null): ElementBox | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    offsetWidth: element.offsetWidth,
    offsetHeight: element.offsetHeight,
    rectWidth: Number(rect.width.toFixed(2)),
    rectHeight: Number(rect.height.toFixed(2)),
  };
}
