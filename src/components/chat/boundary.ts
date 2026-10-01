/**
 * Typed views of modules other packages are still converting.
 * TODO(ts-boundary): drop once app-shell converts src/hooks/useGitStatus.ts.
 */
import type { GitStatus } from "@shared/git/types";
import useGitStatusUntyped from "../../hooks/useGitStatus";

export interface GitStatusHandle {
  status: GitStatus | null;
}

export const useGitStatus = useGitStatusUntyped as unknown as (cwd: string | null | undefined) => GitStatusHandle;
