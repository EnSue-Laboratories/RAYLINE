import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { GitWorktree } from "@shared/git/types";

export interface BranchData {
  /** Checked-out branch; null until loaded (or not a repo). */
  current: string | null;
  branches: string[];
  worktrees: GitWorktree[];
  refresh: () => Promise<void>;
  setCurrent: Dispatch<SetStateAction<string | null>>;
  setWorktrees: Dispatch<SetStateAction<GitWorktree[]>>;
}

/** Branch + worktree lists for `cwd`, loaded on mount / cwd change and on demand. */
export function useBranchData(cwd: string | null | undefined): BranchData {
  const [current, setCurrent] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [worktrees, setWorktrees] = useState<GitWorktree[]>([]);

  const refresh = useCallback(async () => {
    const api = window.api;
    if (!cwd || !api) return;
    try {
      const [b, w] = await Promise.all([api.gitBranches(cwd), api.gitWorktreeList(cwd)]);
      setCurrent(b.current);
      setBranches(b.branches);
      setWorktrees(w);
    } catch {
      // Not a repo / git missing: keep the previous lists.
    }
  }, [cwd]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  return { current, branches, worktrees, refresh, setCurrent, setWorktrees };
}
