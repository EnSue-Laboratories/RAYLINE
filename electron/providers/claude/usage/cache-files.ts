/**
 * Cross-process cache for the Claude usage endpoint (~/.cache/rayline):
 * `claude-usage.json` holds the last raw response, `claude-usage.lock`
 * holds a back-off deadline after failures / 429s. All I/O is async.
 */

import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readNumber, safeJsonParse } from "../../common/json";

const CACHE_DIR = path.join(os.homedir(), ".cache", "rayline");
const CACHE_FILE = path.join(CACHE_DIR, "claude-usage.json");
const LOCK_FILE = path.join(CACHE_DIR, "claude-usage.lock");

export const CACHE_MAX_AGE_S = 180;
export const LOCK_MAX_AGE_S = 30;

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

async function ageSeconds(filePath: string): Promise<{ age: number; mtimeSec: number } | null> {
  try {
    const stat = await fsp.stat(filePath);
    const mtimeSec = Math.floor(stat.mtimeMs / 1000);
    return { age: nowSec() - mtimeSec, mtimeSec };
  } catch {
    return null;
  }
}

/** Raw cached response when fresher than `CACHE_MAX_AGE_S`. */
export async function readFileCache(): Promise<unknown> {
  const info = await ageSeconds(CACHE_FILE);
  if (!info || info.age >= CACHE_MAX_AGE_S) return null;
  try {
    return safeJsonParse(await fsp.readFile(CACHE_FILE, "utf8")) ?? null;
  } catch {
    return null;
  }
}

export async function writeFileCache(data: unknown): Promise<void> {
  try {
    await fsp.mkdir(CACHE_DIR, { recursive: true });
    await fsp.writeFile(CACHE_FILE, JSON.stringify(data));
  } catch {
    // best effort
  }
}

/** Unix seconds until which requests are blocked, or null. */
export async function readActiveLock(): Promise<number | null> {
  const info = await ageSeconds(LOCK_FILE);
  if (!info || info.age >= LOCK_MAX_AGE_S) return null;
  try {
    const parsed = safeJsonParse(await fsp.readFile(LOCK_FILE, "utf8"));
    const blockedUntil = readNumber(parsed, "blockedUntil") ?? info.mtimeSec + LOCK_MAX_AGE_S;
    return blockedUntil > nowSec() ? blockedUntil : null;
  } catch {
    return null;
  }
}

export async function writeLock(blockedUntil: number): Promise<void> {
  try {
    await fsp.mkdir(CACHE_DIR, { recursive: true });
    await fsp.writeFile(LOCK_FILE, JSON.stringify({ blockedUntil }));
  } catch {
    // best effort
  }
}
