/**
 * Claude CLI project-directory naming: `~/.claude/projects/<encoded cwd>/`.
 */

import { readdirSync, statSync, type Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export function projectDirName(cwd: string, platform: NodeJS.Platform = process.platform): string {
  // Windows: the Claude CLI encodes `C:\Users\kira\Documents` as
  // `C--Users-kira-Documents` — we must replace backslash and drive colon
  // too, or the path gets pasted verbatim into `~/.claude/projects/` and
  // produces an illegal nested drive letter.
  // Other platforms: keep the original `/` → `-` rule untouched to preserve
  // bug-compatible behavior for existing session files.
  if (platform === "win32") return cwd.replace(/[\\/:]/g, "-");
  return cwd.replace(/\//g, "-");
}

function encodedDirNames(entryName: string): string[] {
  const names = [entryName];
  if (entryName.startsWith(".")) {
    names.push(`-${entryName.slice(1)}`);
    names.push(entryName.slice(1));
  }
  return [...new Set(names)];
}

/** Child directories of `entries` whose encoded name can consume `remaining`. */
function* matchSteps(
  dirPath: string,
  entries: Dirent[],
  remaining: string,
): Generator<{ full: string; rest: string | null }> {
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    for (const encoded of encodedDirNames(entry.name)) {
      if (remaining === encoded) {
        yield { full: path.join(dirPath, entry.name), rest: null };
      } else if (remaining.startsWith(`${encoded}-`)) {
        yield { full: path.join(dirPath, entry.name), rest: remaining.slice(encoded.length + 1) };
      }
    }
  }
}

function fallbackDecode(projDir: string): string {
  return projDir.replace(/-/g, "/");
}

/**
 * Project dir names encode paths by replacing `/` with `-`, so
 * "-Users-kira-chan-Downloads-codex-research" can't be decoded naively (dir
 * names may contain dashes). Walk the filesystem from `/` and match children
 * against the remaining encoded string instead.
 */
export async function cwdFromProjectDir(projDir: string): Promise<string> {
  if (!projDir.startsWith("-")) return projDir;

  async function walk(dirPath: string, remaining: string): Promise<string | null> {
    if (!remaining) {
      try {
        if ((await stat(dirPath)).isDirectory()) return dirPath;
      } catch {
        /* missing */
      }
      return null;
    }
    let entries: Dirent[];
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const step of matchSteps(dirPath, entries, remaining)) {
      if (step.rest === null) return step.full;
      const result = await walk(step.full, step.rest);
      if (result) return result;
    }
    return null;
  }

  return (await walk("/", projDir.slice(1))) ?? fallbackDecode(projDir);
}

/** Synchronous twin of {@link cwdFromProjectDir} for the sync legacy API. */
export function cwdFromProjectDirSync(projDir: string): string {
  if (!projDir.startsWith("-")) return projDir;

  function walk(dirPath: string, remaining: string): string | null {
    if (!remaining) {
      try {
        if (statSync(dirPath).isDirectory()) return dirPath;
      } catch {
        /* missing */
      }
      return null;
    }
    let entries: Dirent[];
    try {
      entries = readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const step of matchSteps(dirPath, entries, remaining)) {
      if (step.rest === null) return step.full;
      const result = walk(step.full, step.rest);
      if (result) return result;
    }
    return null;
  }

  return walk("/", projDir.slice(1)) ?? fallbackDecode(projDir);
}
