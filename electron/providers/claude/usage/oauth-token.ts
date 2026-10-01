/**
 * Reads Claude Code's OAuth access token — asynchronously. The old fetcher
 * ran `execFileSync("security", …)` on the main process after every turn,
 * blocking IPC (and therefore streaming) for the duration of the keychain
 * lookup. The token is now read with `execFile` and memoized for a few
 * minutes; concurrent callers share one lookup.
 */

import { execFile } from "node:child_process";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractOAuthAccessToken } from "./normalize";

const KEYCHAIN_SERVICE = "Claude Code-credentials";
const KEYCHAIN_TIMEOUT_MS = 5000;
/** Tokens rotate on refresh; re-read periodically and after a 401. */
const TOKEN_TTL_MS = 10 * 60 * 1000;

let cachedToken: string | null = null;
let cachedAt = 0;
let pending: Promise<string | null> | null = null;

function readTokenFromKeychain(): Promise<string | null> {
  if (process.platform !== "darwin") return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8", timeout: KEYCHAIN_TIMEOUT_MS, windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const out = stdout.trim();
        resolve(out ? extractOAuthAccessToken(out) : null);
      },
    );
  });
}

async function readTokenFromCredentialsFile(): Promise<string | null> {
  try {
    const raw = await fsp.readFile(path.join(os.homedir(), ".claude", ".credentials.json"), "utf8");
    return extractOAuthAccessToken(raw);
  } catch {
    return null;
  }
}

async function readToken(): Promise<string | null> {
  // macOS: Claude Code stores credentials in the keychain; fall back to the file.
  if (process.platform === "darwin") {
    return (await readTokenFromKeychain()) || (await readTokenFromCredentialsFile());
  }
  return readTokenFromCredentialsFile();
}

export function getOAuthToken(): Promise<string | null> {
  if (cachedAt && Date.now() - cachedAt < TOKEN_TTL_MS) return Promise.resolve(cachedToken);
  if (pending) return pending;
  pending = readToken()
    .then((token) => {
      cachedToken = token;
      cachedAt = Date.now();
      return token;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Forget the memoized token (e.g. after the endpoint answered 401). */
export function invalidateOAuthToken(): void {
  cachedToken = null;
  cachedAt = 0;
}
