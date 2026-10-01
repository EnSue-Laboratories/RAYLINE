import type { Translate } from "./boundary";
import type { PmItemType } from "./types";

const MINUTE_MS = 60_000;

/** "5m ago" style relative time via the pm.time* strings. */
export function timeAgo(dateStr: string, t: Translate, now: number = Date.now()): string {
  const mins = Math.floor((now - new Date(dateStr).getTime()) / MINUTE_MS);
  if (mins < 60) return t("pm.timeMinutesAgo", { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("pm.timeHoursAgo", { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 30) return t("pm.timeDaysAgo", { count: days });
  return t("pm.timeMonthsAgo", { count: Math.floor(days / 30) });
}

/** Strips Electron's "Error invoking remote method 'x': Error:" prefix. */
export function cleanIpcError(message: string | null | undefined, fallback = "Unknown error"): string {
  if (!message) return fallback;
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim() || fallback;
}

export function errorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return null;
}

export function itemKey(repo: string, number: number | null): string {
  return `${repo}-${number ?? "null"}`;
}

export function githubItemUrl(repo: string, type: PmItemType, number: number): string {
  return `https://github.com/${repo}/${type === "pr" ? "pull" : "issues"}/${number}`;
}

export function checkoutCommand(repo: string, number: number): string {
  return `gh pr checkout ${number} -R ${repo}`;
}

export function itemSummary(repo: string, type: PmItemType, number: number, title: string): string {
  return `#${number} ${title} ${githubItemUrl(repo, type, number)}`;
}

/** PR number from the URL `gh pr create` prints, or null. */
export function parsePrNumber(url: string | null | undefined): number | null {
  const match = /\/pull\/(\d+)/.exec(url ?? "");
  return match?.[1] ? parseInt(match[1], 10) : null;
}

export interface NewItemDraft {
  type: PmItemType;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
}

/** github.com URL that opens the prefilled new issue / compare page. */
export function buildGithubNewItemUrl({ type, repo, title, body, head, base }: NewItemDraft): string {
  const encodedTitle = encodeURIComponent(title.trim());
  const encodedBody = encodeURIComponent(body.trim());
  return type === "issue"
    ? `https://github.com/${repo}/issues/new?title=${encodedTitle}&body=${encodedBody}`
    : `https://github.com/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?expand=1&title=${encodedTitle}&body=${encodedBody}`;
}

/** "owner/name" → "name" (falls back to the input). */
export function repoShortName(repo: string): string {
  return repo.split("/").pop() ?? repo;
}

export function copyText(text: string): void {
  void navigator.clipboard.writeText(text).catch(() => {});
}
