/** Pure parsers / formatters for git and GitHub CLI output. */

import type { GitBranchList, GitOpenPr, GitStatus, GitWorktree } from "@shared/git/types";

/** `git branch --format=%(refname:short)\t%(HEAD)` */
export function parseBranchList(raw: string): GitBranchList {
  let current: string | null = null;
  const branches = raw.split("\n").filter(Boolean).map((line) => {
    const [name = "", head] = line.split("\t");
    if (head === "*") current = name;
    return name;
  });
  return { current, branches };
}

/** `git worktree list --porcelain` */
export function parseWorktreeList(raw: string): GitWorktree[] {
  const worktrees: GitWorktree[] = [];
  let current: Partial<GitWorktree> = {};
  const push = (): void => {
    if (current.path) worktrees.push({ ...current, path: current.path });
  };
  for (const line of raw.split("\n")) {
    if (line.startsWith("worktree ")) {
      push();
      current = { path: line.slice(9) };
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice(5);
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice(7).replace("refs/heads/", "");
    } else if (line === "bare") {
      current.bare = true;
    } else if (line === "") {
      push();
      current = {};
    }
  }
  push();
  return worktrees;
}

/** `git status --porcelain=v2 --branch` */
export function parseStatusPorcelainV2(raw: string): GitStatus {
  const out: GitStatus = { branch: null, upstream: null, ahead: 0, behind: 0, files: [], detached: false };
  const pushFile = (xy: string | undefined, filePath: string): void => {
    out.files.push({ path: filePath, index: xy?.charAt(0) ?? "", worktree: xy?.charAt(1) ?? "" });
  };
  for (const line of raw.split("\n")) {
    if (!line) continue;
    if (line.startsWith("# branch.head ")) {
      const head = line.slice(14).trim();
      if (head === "(detached)") out.detached = true;
      else out.branch = head;
    } else if (line.startsWith("# branch.upstream ")) {
      out.upstream = line.slice(18).trim();
    } else if (line.startsWith("# branch.ab ")) {
      const m = /^\+(\d+) -(\d+)/.exec(line.slice(12));
      if (m) {
        out.ahead = Number(m[1]);
        out.behind = Number(m[2]);
      }
    } else if (line.startsWith("1 ")) {
      // tracked: "1 XY ... <path>" — 8 header fields before path
      const parts = line.split(" ");
      pushFile(parts[1], parts.slice(8).join(" "));
    } else if (line.startsWith("2 ")) {
      // renamed/copied: 9 header fields, then "<newPath>\t<origPath>"
      const parts = line.split(" ");
      const [newPath = ""] = parts.slice(9).join(" ").split("\t");
      pushFile(parts[1], newPath);
    } else if (line.startsWith("u ")) {
      // unmerged: 10 header fields before path
      const parts = line.split(" ");
      pushFile(parts[1], parts.slice(10).join(" "));
    } else if (line.startsWith("? ")) {
      out.files.push({ path: line.slice(2), index: "?", worktree: "?" });
    }
    // "! " (ignored) entries are skipped.
  }
  return out;
}

/** `owner/repo` from a GitHub remote URL (ssh or https), else null. */
export function parseGithubRemoteSlug(remoteUrl: string): string | null {
  const m = /github\.com[:/]([^/]+)\/([^/.\s]+?)(?:\.git)?$/.exec(remoteUrl.trim());
  return m?.[1] && m[2] ? `${m[1]}/${m[2]}` : null;
}

export function extractPrNumber(value: string | null | undefined): number | null {
  const match = /\/pull\/(\d+)(?:\D|$)/.exec(value ?? "");
  return match ? Number(match[1]) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** GitHub REST pull (or `gh pr view` JSON) → GitOpenPr. */
export function normalizeOpenPr(pr: unknown): GitOpenPr | null {
  if (!isRecord(pr)) return null;
  const head = isRecord(pr.head) ? pr.head : {};
  const base = isRecord(pr.base) ? pr.base : {};
  const draft = pr.draft ?? pr.isDraft;
  return {
    number: typeof pr.number === "number" ? pr.number : Number(pr.number),
    title: typeof pr.title === "string" ? pr.title : "",
    url: strOrNull(pr.html_url) ?? strOrNull(pr.url),
    state: typeof pr.state === "string" ? pr.state.toUpperCase() : "",
    headRefName: strOrNull(head.ref) ?? strOrNull(pr.headRefName),
    baseRefName: strOrNull(base.ref) ?? strOrNull(pr.baseRefName),
    isDraft: Boolean(draft),
  };
}

/** Appends the co-author trailer unless the message already contains it. */
export function withCoauthorTrailer(message: string, coauthor: unknown): string {
  const trailer = typeof coauthor === "string" ? coauthor.trim() : "";
  return trailer && !message.includes(trailer) ? `${message.trimEnd()}\n\n${trailer}\n` : message;
}

/** New .gitignore contents with `entry` appended, or null when already ignored. */
export function appendGitignoreEntry(existing: string, rawEntry: string): string | null {
  const entry = rawEntry.replace(/\/+$/, "");
  const present = existing.split("\n").some((l) => l.trim() === entry || l.trim() === `${entry}/`);
  if (present) return null;
  const sep = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  return `${existing}${sep}${entry}\n`;
}

// ── project-clone URL helpers ───────────────────────────────────────────────

export function normalizeCloneUrl(raw: unknown): string {
  return (typeof raw === "string" ? raw : "").trim().replace(/\s+/g, "").replace(/\/+$/, "");
}

/** `owner/repo` for GitHub URLs or bare slugs (for `gh repo clone`), else null. */
export function toGhOwnerRepo(url: string): string | null {
  if (!url) return null;
  const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9][A-Za-z0-9-_.]*)\/([A-Za-z0-9][A-Za-z0-9-_.]*?)(?:\.git)?\/?$/i.exec(url);
  if (m?.[1] && m[2]) return `${m[1]}/${m[2]}`;
  if (/^[A-Za-z0-9][A-Za-z0-9-_.]*\/[A-Za-z0-9][A-Za-z0-9-_.]*$/.test(url)) return url;
  return null;
}

export function deriveRepoDirName(url: string): string | null {
  const s = normalizeCloneUrl(url);
  if (!s) return null;
  const m = /([^/:\s]+)$/.exec(s.replace(/\.git$/i, ""));
  return m?.[1] ?? null;
}
