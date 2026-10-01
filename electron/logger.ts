/**
 * Opt-in verbose logging for the main process.
 *
 * Enabled by `RAYLINE_VERBOSE_LOGS=1`, `RAYLINE_DEBUG=1`, or a scope list in
 * `RAYLINE_DEBUG` (`rayline:*`, `rayline:<scope>` or `<scope>`).
 */

const TRUE_PATTERN = /^(1|true|yes|on)$/i;

export type FlagValue = string | number | boolean | null | undefined;

export type Logger = (...args: unknown[]) => void;

export function isTruthyFlag(value: FlagValue): boolean {
  return TRUE_PATTERN.test(value === null || value === undefined ? "" : String(value));
}

function debugMatchesScope(value: string | undefined, scope: string): boolean {
  const debug = (value ?? "").trim();
  if (!debug) return false;
  const tokens = debug.split(/[\s,]+/).filter(Boolean);
  return tokens.some((token) => token === "rayline:*" || token === `rayline:${scope}` || token === scope);
}

export function isVerboseLoggingEnabled(scope = ""): boolean {
  return (
    isTruthyFlag(process.env.RAYLINE_VERBOSE_LOGS) ||
    isTruthyFlag(process.env.RAYLINE_DEBUG) ||
    debugMatchesScope(process.env.RAYLINE_DEBUG, scope)
  );
}

export function createLogger(scope: string): Logger {
  return (...args: unknown[]) => {
    if (!isVerboseLoggingEnabled(scope)) return;
    console.log(`[${scope}]`, ...args);
  };
}
