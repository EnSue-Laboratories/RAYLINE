import { useEffect, useState } from "react";
import { useStableCallback } from "../../hooks/useStableCallback";

export interface PmAuth {
  /** null while the first check is in flight. */
  authOk: boolean | null;
  authUser: string | null;
  refreshAuth: () => Promise<boolean>;
}

/** `gh auth status` for the Project Manager; checked on mount and on demand. */
export function usePmAuth(): PmAuth {
  const [authOk, setAuthOk] = useState<boolean | null>(null);
  const [authUser, setAuthUser] = useState<string | null>(null);

  const refreshAuth = useStableCallback(async () => {
    const result = await window.ghApi.checkAuth();
    setAuthOk(result.ok);
    setAuthUser(result.ok ? result.user || null : null);
    return result.ok;
  });

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  return { authOk, authUser, refreshAuth };
}
