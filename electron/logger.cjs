"use strict";

const TRUE_PATTERN = /^(1|true|yes|on)$/i;

function isTruthyFlag(value) {
  return TRUE_PATTERN.test(String(value || ""));
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

function isVerboseLoggingEnabled(scope = "") {
  return (
    isTruthyFlag(process.env.RAYLINE_VERBOSE_LOGS) ||
    isTruthyFlag(process.env.RAYLINE_DEBUG) ||
    debugMatchesScope(process.env.RAYLINE_DEBUG, scope)
  );
}

function createLogger(scope) {
  return (...args) => {
    if (!isVerboseLoggingEnabled(scope)) return;
    console.log(`[${scope}]`, ...args);
  };
}

module.exports = {
  createLogger,
  isTruthyFlag,
  isVerboseLoggingEnabled,
};
