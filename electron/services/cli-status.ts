/**
 * `check-cli-installed`: which provider CLIs are reachable, plus their
 * `--version` (for the model picker's `minCliVersion` gating). Resolution is
 * async (login-shell probing used to block the main thread for seconds when
 * a CLI was missing) and cached for a few seconds; versions are cached per
 * binary path.
 */

import type { CheckCliInstalledOptions, CliInstalledSnapshot } from "@shared/providers/types";
import { buildSpawnPath, execFileCli, resolveCliBinAsync } from "../cli-bin-resolver";

const CLI_INSTALL_CHECK_TTL_MS = 5000;
const VERSION_TTL_MS = 10 * 60 * 1000;
const VERSION_TIMEOUT_MS = 5000;

type CliName = keyof NonNullable<CliInstalledSnapshot["versions"]>;

const CLIS: ReadonlyArray<{ name: CliName; envVarName: string }> = [
  { name: "claude", envVarName: "CLAUDE_BIN" },
  { name: "codex", envVarName: "CODEX_BIN" },
  { name: "opencode", envVarName: "OPENCODE_BIN" },
  { name: "grok", envVarName: "GROK_BIN" },
  { name: "agy", envVarName: "AGY_BIN" },
];

let cache: CliInstalledSnapshot | null = null;
let cachedAt = 0;
let inFlight: Promise<CliInstalledSnapshot> | null = null;
const versionCache = new Map<string, { version: string | null; at: number }>();

export function invalidateCliInstalledCache(): void {
  cache = null;
}

/** First semver-looking token of `--version` output ("claude 2.1.3 (Claude Code)" → "2.1.3"). */
export function parseCliVersion(output: string): string | null {
  return /\bv?(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?)\b/.exec(output)?.[1] ?? null;
}

function readVersion(bin: string): Promise<string | null> {
  const cached = versionCache.get(bin);
  if (cached && Date.now() - cached.at < VERSION_TTL_MS) return Promise.resolve(cached.version);
  return new Promise((resolve) => {
    execFileCli(
      bin,
      ["--version"],
      { timeout: VERSION_TIMEOUT_MS, env: { ...process.env, PATH: buildSpawnPath(), NO_COLOR: "1" }, windowsHide: true },
      (_error, stdout, stderr) => {
        const version = parseCliVersion(`${stdout}\n${stderr}`);
        versionCache.set(bin, { version, at: Date.now() });
        resolve(version);
      },
    );
  });
}

async function probe(): Promise<CliInstalledSnapshot> {
  const results = await Promise.all(
    CLIS.map(async ({ name, envVarName }) => {
      const bin = await resolveCliBinAsync(name, { envVarName });
      return { name, bin, version: bin ? await readVersion(bin) : null };
    }),
  );
  const installed = (name: CliName): boolean => Boolean(results.find((r) => r.name === name)?.bin);
  const versions: NonNullable<CliInstalledSnapshot["versions"]> = {};
  for (const { name, version } of results) if (version) versions[name] = version;
  return {
    claude: installed("claude"),
    codex: installed("codex"),
    opencode: installed("opencode"),
    grok: installed("grok"),
    agy: installed("agy"),
    versions,
  };
}

export async function getCliInstalledSnapshot(options: CheckCliInstalledOptions = {}): Promise<CliInstalledSnapshot> {
  if (!options.force && cache && Date.now() - cachedAt < CLI_INSTALL_CHECK_TTL_MS) return cache;
  // Concurrent callers share one probe.
  inFlight ??= probe().finally(() => {
    inFlight = null;
  });
  const snapshot = await inFlight;
  cache = snapshot;
  cachedAt = Date.now();
  return snapshot;
}
