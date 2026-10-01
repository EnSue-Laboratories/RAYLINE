export type GitHubState = "open" | "closed";

export function normalizeGitHubState(state: unknown, fallback: GitHubState = "open"): GitHubState {
  const normalized = (typeof state === "string" ? state : "").trim().toLowerCase();
  if (normalized === "open" || normalized === "closed") return normalized;
  return fallback;
}

export function isGitHubOpen(state: unknown, fallback: GitHubState = "open"): boolean {
  return normalizeGitHubState(state, fallback) === "open";
}
