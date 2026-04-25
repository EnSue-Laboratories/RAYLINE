export function normalizeGitHubState(state, fallback = "open") {
  const normalized = String(state || "").trim().toLowerCase();
  if (normalized === "open" || normalized === "closed") return normalized;
  return fallback;
}

export function isGitHubOpen(state, fallback = "open") {
  return normalizeGitHubState(state, fallback) === "open";
}
