import type { RaylineApi } from "@shared/ipc/renderer-api";

/**
 * `window.api` when running inside Electron (it is missing in plain-browser
 * `vite` dev), or null. Methods are typed as present, but older/newer
 * preloads may lack some — check with `hasApi`.
 */
export function getApi(): RaylineApi | null {
  return typeof window !== "undefined" && typeof window.api === "object" ? window.api : null;
}

/** True when the preload exposes every listed method. */
export function hasApi(...methods: (keyof RaylineApi)[]): boolean {
  const api = getApi();
  if (!api) return false;
  return methods.every((method) => typeof api[method] === "function");
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || String(error);
  return String(error);
}
