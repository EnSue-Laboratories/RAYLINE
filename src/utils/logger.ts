const TRUE_PATTERN = /^(1|true|yes|on)$/i;

function isTruthyFlag(value: unknown): boolean {
  return TRUE_PATTERN.test(typeof value === "string" ? value : "");
}

function readStorageFlag(key: string): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage?.getItem(key) ?? null : null;
  } catch {
    return null;
  }
}

function debugMatchesScope(value: unknown, scope: string): boolean {
  const debug = (typeof value === "string" ? value : "").trim();
  if (!debug) return false;
  const tokens = debug.split(/[\s,]+/).filter(Boolean);
  return tokens.some((token) => (
    token === "rayline:*" ||
    token === `rayline:${scope}` ||
    token === scope
  ));
}

function readEnvFlag(name: "VITE_RAYLINE_VERBOSE_LOGS" | "VITE_RAYLINE_DEBUG"): unknown {
  const env: Record<string, unknown> | undefined = import.meta.env;
  return env?.[name];
}

export function isVerboseLoggingEnabled(scope = ""): boolean {
  return (
    isTruthyFlag(readEnvFlag("VITE_RAYLINE_VERBOSE_LOGS")) ||
    isTruthyFlag(readEnvFlag("VITE_RAYLINE_DEBUG")) ||
    isTruthyFlag(readStorageFlag("rayline:verboseLogs")) ||
    isTruthyFlag(readStorageFlag("rayline:debug")) ||
    isTruthyFlag(readStorageFlag("rayline:debugLogs")) ||
    debugMatchesScope(readEnvFlag("VITE_RAYLINE_DEBUG"), scope) ||
    debugMatchesScope(readStorageFlag("rayline:debug"), scope)
  );
}

export type ScopedLogger = (...args: unknown[]) => void;

export function createLogger(scope: string): ScopedLogger {
  return (...args: unknown[]) => {
    if (!isVerboseLoggingEnabled(scope)) return;
    console.log(`[${scope}]`, ...args);
  };
}
