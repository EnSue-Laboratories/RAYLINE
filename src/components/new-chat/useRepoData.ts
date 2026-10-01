import { useEffect, useState } from "react";
import type { GhIssue } from "@shared/github/types";
import { useStableCallback } from "../../hooks/useStableCallback";

const NO_BRANCHES: readonly string[] = [];
const NO_ISSUES: readonly GhIssue[] = [];

interface BranchResult {
  cwd: string;
  current: string;
  branches: readonly string[];
}

export interface BranchState {
  current: string;
  branches: readonly string[];
  loading: boolean;
}

/**
 * Branches of the repo at `cwd`. Results are keyed by cwd so switching
 * projects shows "loading" without resetting state inside the effect.
 * `onLoaded` runs once per successful load (used to preselect a branch).
 */
export function useBranches(cwd: string | null, onLoaded: (current: string, branches: readonly string[]) => void): BranchState {
  const [result, setResult] = useState<BranchResult | null>(null);
  const enabled = Boolean(cwd) && typeof window.api?.gitBranches === "function";
  // Stable identity: a new `onLoaded` closure must not trigger a reload.
  const handleLoaded = useStableCallback(onLoaded);

  useEffect(() => {
    if (!cwd || !enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const info = await window.api.gitBranches(cwd);
        if (cancelled) return;
        const current = info?.current || "";
        const branches = info?.branches ?? NO_BRANCHES;
        setResult({ cwd, current, branches });
        handleLoaded(current, branches);
      } catch {
        if (!cancelled) setResult({ cwd, current: "", branches: NO_BRANCHES });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd, enabled, handleLoaded]);

  const loaded = enabled && result?.cwd === cwd ? result : null;
  return {
    current: loaded?.current ?? "",
    branches: loaded?.branches ?? NO_BRANCHES,
    loading: enabled && loaded === null,
  };
}

interface IssueResult {
  cwd: string;
  issues: readonly GhIssue[];
}

export interface IssueState {
  issues: readonly GhIssue[];
  loading: boolean;
}

/**
 * Open issues of the repo at `cwd`, (re)fetched each time `active` turns on.
 * The previous list for the same cwd stays visible while refreshing.
 */
export function useRepoIssues(cwd: string | null, active: boolean): IssueState {
  const [result, setResult] = useState<IssueResult | null>(null);
  const [pendingFor, setPendingFor] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !cwd) return;
    let cancelled = false;
    void (async () => {
      try {
        const repoName = await window.api?.ghGetRepoName?.(cwd);
        if (!repoName || cancelled) return;
        const issues = await window.api?.ghListIssues?.(repoName, "open");
        if (!cancelled && issues) setResult({ cwd, issues });
      } catch {
        // Keep whatever list we had; the dropdown shows "No issues found".
      } finally {
        if (!cancelled) setPendingFor(cwd);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, cwd]);

  const current = result?.cwd === cwd ? result : null;
  return {
    issues: current?.issues ?? NO_ISSUES,
    loading: active && Boolean(cwd) && pendingFor !== cwd && current === null,
  };
}
