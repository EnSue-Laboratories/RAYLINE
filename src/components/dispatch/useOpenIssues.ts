import { useEffect, useState } from "react";
import type { GhIssue } from "@shared/github/types";
import { errorMessage } from "./plan";

interface IssuesResult {
  cwd: string;
  issues: readonly GhIssue[];
  /** null = ok; "" = failed without a message. */
  error: string | null;
}

export interface OpenIssuesState {
  issues: readonly GhIssue[];
  loading: boolean;
  /** Failure message, "" when the failure had none, null when ok. */
  error: string | null;
}

const NO_ISSUES: readonly GhIssue[] = [];

function canLoadIssues(): boolean {
  return typeof window.api?.gitRemoteSlug === "function" && typeof window.api?.ghListIssues === "function";
}

/**
 * Open GitHub issues for the repo at `cwd`. Results are keyed by cwd, so a
 * cwd change shows "loading" immediately without a synchronous setState in
 * the effect.
 */
export function useOpenIssues(cwd: string | null | undefined): OpenIssuesState {
  const [result, setResult] = useState<IssuesResult | null>(null);
  const enabled = Boolean(cwd) && canLoadIssues();

  useEffect(() => {
    if (!cwd || !enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const slug = await window.api.gitRemoteSlug(cwd);
        const issues = slug ? await window.api.ghListIssues(slug, "open") : [];
        if (!cancelled) setResult({ cwd, issues: Array.isArray(issues) ? issues : NO_ISSUES, error: null });
      } catch (error) {
        if (!cancelled) setResult({ cwd, issues: NO_ISSUES, error: errorMessage(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd, enabled]);

  const current = enabled && result?.cwd === cwd ? result : null;
  return {
    issues: current?.issues ?? NO_ISSUES,
    loading: enabled && current === null,
    error: current?.error ?? null,
  };
}
