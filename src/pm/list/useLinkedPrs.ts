import { useEffect, useState } from "react";
import type { GhLinkedPr } from "@shared/github/types";
import type { IssueListItem } from "../types";

export type LinkedPrMap = Readonly<Record<string, GhLinkedPr[]>>;

export function linkedPrKey(repo: string, number: number): string {
  return `${repo}/${number}`;
}

/**
 * Cross-referenced PRs for each listed issue. Refetched when the issue list
 * changes — which, since unchanged polls keep the same array, means only when
 * something actually changed.
 */
export function useLinkedPrs(issues: readonly IssueListItem[]): LinkedPrMap {
  const [linked, setLinked] = useState<LinkedPrMap>({});

  useEffect(() => {
    if (issues.length === 0) return;
    let cancelled = false;
    void Promise.allSettled(
      issues.map(async (issue) => ({
        key: linkedPrKey(issue._repo, issue.number),
        prs: await window.ghApi.getLinkedPRs(issue._repo, issue.number),
      })),
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, GhLinkedPr[]> = {};
      for (const result of results) {
        if (result.status === "fulfilled" && result.value.prs.length > 0) map[result.value.key] = result.value.prs;
      }
      setLinked(map);
    });
    return () => {
      cancelled = true;
    };
  }, [issues]);

  return linked;
}
