import { useEffect, useMemo, useState } from "react";
import type { GhAuthAccount } from "@shared/github/types";
import { useStableCallback } from "../../hooks/useStableCallback";
import { cleanIpcError, errorMessage } from "../format";
import { markActive, resolveActiveUser, withActiveUser } from "./accounts";

export interface GhAccountsState {
  accounts: GhAuthAccount[];
  activeUser: string | null;
  loadingAccounts: boolean;
  switchingUser: string | null;
  signingOut: boolean;
  error: string | null;
  /** `closeMenu` runs when the switch succeeds or is a no-op. */
  switchAccount: (login: string, closeMenu: () => void) => Promise<void>;
  signOut: () => Promise<void>;
}

interface UseGhAccountsOptions {
  currentUser: string | null | undefined;
  onAccountSwitched?: (login: string) => unknown;
  onSignedOut?: () => unknown;
}

/** gh CLI accounts: list on mount, switch, sign out. */
export function useGhAccounts({ currentUser, onAccountSwitched, onSignedOut }: UseGhAccountsOptions): GhAccountsState {
  const [loadedAccounts, setLoadedAccounts] = useState<GhAuthAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [switchingUser, setSwitchingUser] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useStableCallback(async () => {
    try {
      const res = await window.ghApi.listAuthAccounts();
      if (!res.ok) throw new Error(res.error || "Failed to load GitHub accounts");
      setLoadedAccounts(Array.isArray(res.accounts) ? res.accounts : []);
    } catch (err) {
      setError(cleanIpcError(errorMessage(err), "Failed to load GitHub accounts"));
      setLoadedAccounts(currentUser ? [{ login: currentUser, active: true }] : []);
    } finally {
      setLoadingAccounts(false);
    }
  });

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const accounts = useMemo(() => withActiveUser(loadedAccounts, currentUser), [loadedAccounts, currentUser]);
  const activeUser = resolveActiveUser(accounts, currentUser);

  const switchAccount = useStableCallback(async (login: string, closeMenu: () => void) => {
    if (!login || login === activeUser || switchingUser || signingOut) {
      closeMenu();
      return;
    }

    setSwitchingUser(login);
    setError(null);
    try {
      const res = await window.ghApi.switchAccount(login);
      if (!res.ok) throw new Error(res.error || "Switch account failed");
      setLoadedAccounts((prev) => markActive(prev, login));
      closeMenu();
      await onAccountSwitched?.(login);
    } catch (err) {
      setError(cleanIpcError(errorMessage(err), "Switch account failed"));
    } finally {
      setSwitchingUser(null);
    }
  });

  const signOut = useStableCallback(async () => {
    setSigningOut(true);
    setError(null);
    try {
      const res = await window.ghApi.authLogout();
      if (!res.ok) {
        setError(res.error || "Sign out failed");
        setSigningOut(false);
        return;
      }
      onSignedOut?.();
    } catch (err) {
      setError(cleanIpcError(errorMessage(err), "Sign out failed"));
      setSigningOut(false);
    }
  });

  return { accounts, activeUser, loadingAccounts, switchingUser, signingOut, error, switchAccount, signOut };
}
