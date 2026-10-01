import type { GhAuthAccount } from "@shared/github/types";

/**
 * The signed-in user (from `gh-check-auth`) is authoritative for which
 * account is active; before the account list loads it stands in for it.
 */
export function withActiveUser(accounts: GhAuthAccount[], currentUser: string | null | undefined): GhAuthAccount[] {
  if (!currentUser) return accounts;
  if (accounts.length === 0) return [{ login: currentUser, active: true }];
  if (accounts.every((account) => account.active === (account.login === currentUser))) return accounts;
  return markActive(accounts, currentUser);
}

export function markActive(accounts: GhAuthAccount[], login: string): GhAuthAccount[] {
  return accounts.map((account) => ({ ...account, active: account.login === login }));
}

export function resolveActiveUser(accounts: GhAuthAccount[], currentUser: string | null | undefined): string | null {
  return currentUser || accounts.find((account) => account.active)?.login || null;
}
