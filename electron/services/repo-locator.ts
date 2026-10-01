/**
 * Finds a local checkout for a GitHub `owner/repo` among directories the app
 * already knows about (project roots and conversation cwds), so Project
 * Manager features can use local git state.
 */

import fs from "node:fs";
import path from "node:path";
import { git } from "./git-ops";
import { parseGithubRemoteSlug } from "./git-parse";

const slugCache = new Map<string, string>();

async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function remoteSlugOf(dir: string): Promise<string | null> {
  try {
    return parseGithubRemoteSlug(await git(["remote", "get-url", "origin"], dir));
  } catch {
    return null;
  }
}

/** Local repo dir whose `origin` is `owner/repo` (case-insensitive), or null. */
export async function findLocalCheckout(slug: string, candidates: readonly string[]): Promise<string | null> {
  const wanted = slug.toLowerCase();
  const cached = slugCache.get(wanted);
  if (cached && (await remoteSlugOf(cached))?.toLowerCase() === wanted) return cached;
  slugCache.delete(wanted);

  for (const dir of new Set(candidates)) {
    if (!path.isAbsolute(dir) || !(await isDirectory(dir))) continue;
    const found = await remoteSlugOf(dir);
    if (found) slugCache.set(found.toLowerCase(), dir);
    if (found?.toLowerCase() === wanted) return dir;
  }
  return null;
}

/**
 * Directory to read the "current branch" from for `gh-current-branch`:
 * an absolute path is used directly, `owner/repo` is resolved among known
 * checkouts, and no argument keeps the legacy main-process cwd.
 */
export async function resolveBranchDir(repoOrPath: unknown, candidates: () => readonly string[]): Promise<string | null> {
  if (typeof repoOrPath !== "string" || !repoOrPath.trim()) return process.cwd();
  const value = repoOrPath.trim();
  if (path.isAbsolute(value)) return (await isDirectory(value)) ? value : null;
  return findLocalCheckout(value, candidates());
}
