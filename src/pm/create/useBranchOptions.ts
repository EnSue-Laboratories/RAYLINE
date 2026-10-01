import { useEffect, useState } from "react";
import type { GhBranch } from "@shared/github/types";
import type { PmItemType } from "../types";

export interface BranchOptions {
  branches: GhBranch[];
  head: string;
  setHead: (head: string) => void;
  base: string;
  setBase: (base: string) => void;
}

/**
 * Branch pickers for a new PR: loads the repo's branches, preselects the
 * locally checked-out branch as head (unless the user already picked one)
 * and the repo's default branch as base.
 */
export function useBranchOptions(repo: string, type: PmItemType): BranchOptions {
  const [branches, setBranches] = useState<GhBranch[]>([]);
  const [head, setHead] = useState("");
  const [base, setBase] = useState("main");

  useEffect(() => {
    if (type !== "pr" || !repo) return;
    let cancelled = false;
    Promise.all([
      window.ghApi.listBranches(repo),
      window.ghApi.getCurrentBranch(),
      window.ghApi.getRepoDefaultBranch(repo),
    ]).then(([repoBranches, currentBranch, defaultBranch]) => {
      if (cancelled) return;
      const names = repoBranches.map((branch) => branch.name);
      setBranches(repoBranches);
      setHead((prev) => prev || names.find((name) => name === currentBranch) || names[0] || "");
      setBase(defaultBranch);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [repo, type]);

  return { branches, head, setHead, base, setBase };
}
