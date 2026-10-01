/**
 * Typed views of renderer modules that are still `// @ts-nocheck` (owned by
 * other migration packages). Each cast is done once here so the sidebar/git
 * components never see inferred `any`s. Delete an entry once its owner lands
 * real types and import the module directly instead.
 */
import useGitStatusUntyped from "../../hooks/useGitStatus";
import type { GitStatus } from "@shared/git/types";

export interface GitStatusHandle {
  /** null = not loaded yet, or cwd is not a git repo. */
  status: GitStatus | null;
  /** Re-runs `git status`. */
  refresh: () => Promise<void>;
  /** `git fetch` then `git status`. */
  refetch: () => Promise<void>;
}

// TODO(ts-boundary): drop once app-shell lands (hooks/useGitStatus).
export const useGitStatus = useGitStatusUntyped as unknown as (cwd: string | null | undefined) => GitStatusHandle;
