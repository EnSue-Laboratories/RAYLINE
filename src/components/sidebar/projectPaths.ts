/** Folder name `git clone` would create for a URL / `owner/repo` spec, or null. */
export function deriveRepoDirName(url: string | null | undefined): string | null {
  const spec = String(url || "").trim();
  if (!spec) return null;
  const stripped = spec.replace(/\/+$/, "").replace(/\.git$/i, "");
  const match = /([^/:\s]+)$/.exec(stripped);
  return match?.[1] ?? null;
}

/** `parent` + `/` + `name`, without doubling a trailing slash. */
export function joinClonePath(parentDir: string, name: string): string {
  return `${parentDir.replace(/\/$/, "")}/${name}`;
}
