import { useEffect, useState } from "react";
import type { GhRepoSummary } from "@shared/github/types";
import { useStableCallback } from "../hooks/useStableCallback";
import { errorMessage } from "./format";

const REPO_LIMIT = 100;

export interface UserRepos {
  repos: GhRepoSummary[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/** The signed-in user's repositories (`gh repo list`), fetched on mount. */
export function useUserRepos(): UserRepos {
  const [repos, setRepos] = useState<GhRepoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRepos = useStableCallback(() => {
    window.ghApi.listUserRepos(REPO_LIMIT)
      .then((data) => {
        setRepos(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err));
        setLoading(false);
      });
  });

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  return {
    repos,
    loading,
    error,
    retry: () => {
      setLoading(true);
      setError(null);
      fetchRepos();
    },
  };
}
