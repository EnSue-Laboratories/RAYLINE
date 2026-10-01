/**
 * Runtime model discovery for the `model-catalog` IPC (ported from PR #230
 * `model-catalog.cjs`). Parsing is pure and lives in shared/models
 * (`parseCodexModelsCache`, `parseGrokModelsOutput`, `parseAgyModelsOutput`);
 * this module only does the I/O, all async with timeouts:
 *  - Codex: `$CODEX_HOME/models_cache.json` (≤ 8 MB);
 *  - Grok:  `grok models` (4 s);
 *  - AGY:   `agy models` (15 s, system proxy), cached in
 *           ~/.cache/rayline/agy-models.json for 5 min and kept across
 *           failed refreshes so a network timeout never hides known models.
 * The combined catalog is memoized for 60 s; concurrent callers share one
 * lookup.
 */

import type { ExecFileOptions } from "node:child_process";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildCodexRuntimeModel,
  parseAgyModelsOutput,
  parseCodexModelsCache,
  parseGrokModelsOutput,
  type AgyCatalogRecord,
  type CodexCatalogRecord,
  type CodexModelDefinition,
  type RuntimeModelCatalog,
} from "@shared/models";
import { execFileCli, type ExecFileCallback } from "./common/boundary";
import { isRecord, readNumber, safeJsonParse } from "./common/json";
import { baseCliEnv } from "./common/runtime-env";
import { resolveAgyBin } from "./agy/session";
import { resolveGrokBin } from "./grok/session";
import { withSystemProxy } from "./runtime-env";

const CODEX_CACHE_MAX_BYTES = 8 * 1024 * 1024;
const AGY_CACHE_MAX_BYTES = 256 * 1024;
const AGY_CACHE_TTL_MS = 5 * 60_000;
const CATALOG_TTL_MS = 60_000;

/** `execFile`-compatible runner (injectable for tests). */
export type CliRunner = (bin: string, args: readonly string[], options: ExecFileOptions, callback: ExecFileCallback) => void;

const defaultRunner: CliRunner = (bin, args, options, callback) => {
  execFileCli(bin, args, options, callback);
};

function runForStdout(runCli: CliRunner, bin: string, args: readonly string[], options: ExecFileOptions): Promise<string | null> {
  return new Promise((resolve) => {
    runCli(bin, args, { maxBuffer: 256 * 1024, windowsHide: true, ...options }, (error, stdout) => {
      resolve(error ? null : String(stdout));
    });
  });
}

export interface ReadCodexCatalogOptions {
  root?: string;
}

export async function readCodexCatalog({ root = process.env.CODEX_HOME || path.join(os.homedir(), ".codex") }: ReadCodexCatalogOptions = {}): Promise<CodexCatalogRecord[]> {
  try {
    const file = path.join(root, "models_cache.json");
    if ((await fsp.stat(file)).size > CODEX_CACHE_MAX_BYTES) return [];
    return parseCodexModelsCache(safeJsonParse(await fsp.readFile(file, "utf8")));
  } catch {
    return [];
  }
}

export interface ReadGrokCatalogOptions {
  bin?: string | null;
  runCli?: CliRunner;
}

/** Discovery failure → [] (only the native default is offered, no guessed ids). */
export async function readGrokCatalog({ bin = resolveGrokBin(), runCli = defaultRunner }: ReadGrokCatalogOptions = {}): Promise<string[]> {
  if (!bin) return [];
  const stdout = await runForStdout(runCli, bin, ["models"], { timeout: 4000, env: baseCliEnv({ NO_COLOR: "1" }) });
  return stdout === null ? [] : parseGrokModelsOutput(stdout);
}

export interface ReadAgyCatalogOptions {
  cacheFile?: string;
  bin?: string | null;
  runCli?: CliRunner;
  /** Clock override for tests. */
  now?: () => number;
}

interface AgyCacheFile {
  checkedAt: number;
  models: AgyCatalogRecord[];
}

async function readAgyCache(cacheFile: string): Promise<AgyCacheFile | null> {
  try {
    if ((await fsp.stat(cacheFile)).size >= AGY_CACHE_MAX_BYTES) return null;
    const stored = safeJsonParse(await fsp.readFile(cacheFile, "utf8"));
    if (!isRecord(stored) || !Array.isArray(stored.models)) return null;
    // Re-validate through the same parser the CLI output goes through.
    const rows = stored.models.map((model) => (isRecord(model) ? `${String(model.slug)}\t${String(model.name)}` : "")).join("\n");
    return { checkedAt: readNumber(stored, "checkedAt") ?? 0, models: parseAgyModelsOutput(rows) };
  } catch {
    return null;
  }
}

async function writeAgyCache(cacheFile: string, models: readonly AgyCatalogRecord[], checkedAt: number): Promise<void> {
  try {
    await fsp.mkdir(path.dirname(cacheFile), { recursive: true });
    const temp = `${cacheFile}.${process.pid}.tmp`;
    await fsp.writeFile(temp, JSON.stringify({ checkedAt, models }), { mode: 0o600 });
    await fsp.rename(temp, cacheFile);
  } catch {
    // A read-only cache must not hide a successfully discovered model.
  }
}

export async function readAgyCatalog({
  cacheFile = path.join(os.homedir(), ".cache", "rayline", "agy-models.json"),
  bin = resolveAgyBin(),
  runCli = defaultRunner,
  now = Date.now,
}: ReadAgyCatalogOptions = {}): Promise<AgyCatalogRecord[]> {
  if (!bin) return [];
  const cached = await readAgyCache(cacheFile);
  const previous = cached?.models ?? [];
  if (cached && previous.length > 0) {
    const age = now() - cached.checkedAt;
    if (age >= 0 && age < AGY_CACHE_TTL_MS) return previous;
  }
  const env = await withSystemProxy(baseCliEnv({ NO_COLOR: "1" }));
  const stdout = await runForStdout(runCli, bin, ["models"], { timeout: 15_000, env });
  const models = stdout === null ? [] : parseAgyModelsOutput(stdout);
  if (models.length === 0) return previous;
  await writeAgyCache(cacheFile, models, now());
  return models;
}

let pending: Promise<RuntimeModelCatalog> | null = null;
let cached: RuntimeModelCatalog | null = null;
let checkedAt = 0;

export function getModelCatalog(): Promise<RuntimeModelCatalog> {
  if (pending) return pending;
  if (cached && Date.now() - checkedAt < CATALOG_TTL_MS) return Promise.resolve(cached);
  pending = Promise.all([readCodexCatalog(), readGrokCatalog(), readAgyCatalog()])
    .then(([codex, grok, agy]) => {
      cached = { codex, grok, agy };
      checkedAt = Date.now();
      return cached;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

let codexCache: { at: number; records: Promise<CodexCatalogRecord[]> } | null = null;

/**
 * The installed Codex CLI's definition for `slug` (efforts, default effort),
 * from models_cache.json (memoized 60 s). Null when unknown.
 */
export async function findDiscoveredCodexModel(slug: string | null | undefined): Promise<CodexModelDefinition | null> {
  if (!slug) return null;
  if (!codexCache || Date.now() - codexCache.at >= CATALOG_TTL_MS) codexCache = { at: Date.now(), records: readCodexCatalog() };
  const record = (await codexCache.records).find((r) => r.slug === slug);
  return record ? buildCodexRuntimeModel(record) : null;
}
