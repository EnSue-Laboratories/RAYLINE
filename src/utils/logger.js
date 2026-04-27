const TRUE_PATTERN = /^(1|true|yes|on)$/i;

function isTruthyFlag(value) {
  return TRUE_PATTERN.test(String(value || ""));
}

function readStorageFlag(key) {
  try {
    return typeof window !== "undefined" ? window.localStorage?.getItem(key) : null;
  } catch {
    return null;
  }
}

function debugMatchesScope(value, scope) {
  const debug = String(value || "").trim();
  if (!debug) return false;
  const tokens = debug.split(/[\s,]+/).filter(Boolean);
  return tokens.some((token) => (
    token === "rayline:*" ||
    token === `rayline:${scope}` ||
    token === scope
  ));
}

export function isVerboseLoggingEnabled(scope = "") {
  return (
    isTruthyFlag(import.meta.env?.VITE_RAYLINE_VERBOSE_LOGS) ||
    isTruthyFlag(import.meta.env?.VITE_RAYLINE_DEBUG) ||
    isTruthyFlag(readStorageFlag("rayline:verboseLogs")) ||
    isTruthyFlag(readStorageFlag("rayline:debug")) ||
    isTruthyFlag(readStorageFlag("rayline:debugLogs")) ||
    debugMatchesScope(import.meta.env?.VITE_RAYLINE_DEBUG, scope) ||
    debugMatchesScope(readStorageFlag("rayline:debug"), scope)
  );
}

export function createLogger(scope) {
  return (...args) => {
    if (!isVerboseLoggingEnabled(scope)) return;
    console.log(`[${scope}]`, ...args);
  };
}
