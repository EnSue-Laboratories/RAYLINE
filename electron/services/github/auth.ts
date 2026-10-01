/** gh auth status / switch / logout. */

import type {
  GhAuthAccount,
  GhCheckAuthResult,
  GhListAuthAccountsResult,
  GhLogoutResult,
  GhSwitchAccountResult,
} from "@shared/github/types";
import { errorMessage, gh } from "./gh-cli";

const NOT_LOGGED_IN = /not logged in/i;

/** Active account from `gh auth status` (newer "account X" / older "as X"). */
export function parseAuthStatusUser(text: string): string | null {
  if (!text) return null;
  const m = /Logged in to [^\s]+ account ([^\s(]+)/i.exec(text) ?? /Logged in to [^\s]+ as ([^\s(]+)/i.exec(text);
  return m?.[1] ?? null;
}

export function parseAuthStatusAccounts(text: string): GhAuthAccount[] {
  if (!text) return [];
  const accounts: GhAuthAccount[] = [];
  let current: GhAuthAccount | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const login =
      /^✓ Logged in to [^\s]+ account ([^\s(]+)/i.exec(line)?.[1] ?? /^✓ Logged in to [^\s]+ as ([^\s(]+)/i.exec(line)?.[1];
    if (login) {
      current = { login, active: false };
      accounts.push(current);
      continue;
    }
    if (current && /^- Active account:\s*true$/i.test(line)) current.active = true;
  }
  const [only] = accounts;
  if (accounts.length === 1 && only && !only.active) only.active = true;
  return accounts;
}

interface AuthUser {
  loggedIn: boolean;
  user: string | null;
}

async function resolveAuthUser(): Promise<AuthUser> {
  let statusErr: unknown = null;
  try {
    const out = await gh(["auth", "status", "--hostname", "github.com"]);
    const user = parseAuthStatusAccounts(out).find((account) => account.active)?.login || parseAuthStatusUser(out);
    if (user) return { loggedIn: true, user };
  } catch (err) {
    statusErr = err;
    if (NOT_LOGGED_IN.test(errorMessage(err))) return { loggedIn: false, user: null };
  }

  try {
    // Authoritative fallback — works across auth status output variants.
    const user = (await gh(["api", "user", "-q", ".login"])) || null;
    return { loggedIn: Boolean(user), user };
  } catch (err) {
    if (/not logged in|authentication required/i.test(errorMessage(err))) return { loggedIn: false, user: null };
    throw statusErr ?? err;
  }
}

export async function checkAuth(): Promise<GhCheckAuthResult> {
  try {
    const { user } = await resolveAuthUser();
    return { ok: true, user };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function listAuthAccounts(): Promise<GhListAuthAccountsResult> {
  try {
    const out = await gh(["auth", "status", "--hostname", "github.com"]);
    let accounts = parseAuthStatusAccounts(out);
    if (!accounts.length) {
      const { user } = await resolveAuthUser();
      if (user) accounts = [{ login: user, active: true }];
    }
    return { ok: true, accounts };
  } catch (err) {
    if (NOT_LOGGED_IN.test(errorMessage(err))) return { ok: true, accounts: [] };
    return { ok: false, error: errorMessage(err) };
  }
}

export async function switchAccount(user: string): Promise<GhSwitchAccountResult> {
  try {
    await gh(["auth", "switch", "--hostname", "github.com", "--user", user]);
    return { ok: true, user };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function logout(): Promise<GhLogoutResult> {
  try {
    const { loggedIn, user } = await resolveAuthUser();
    if (!loggedIn) return { ok: true };
    if (!user) return { ok: false, error: "Unable to determine the active GitHub account to sign out." };
    await gh(["auth", "logout", "--hostname", "github.com", "--user", user]);
    return { ok: true };
  } catch (err) {
    if (NOT_LOGGED_IN.test(errorMessage(err))) return { ok: true };
    return { ok: false, error: errorMessage(err) };
  }
}
