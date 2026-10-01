/**
 * Process-wide runtime values the main process publishes for agent runs:
 * the terminal MCP config path and the terminal WebSocket port (set on
 * `global` by electron/main), plus the bundled terminal CLI script.
 */

import { promises as fsp } from "node:fs";
import path from "node:path";
import { toUnpackedPath } from "../../paths";
import { buildSpawnPath, isExecutable, resolveCliBin } from "./boundary";

interface RaylineGlobals {
  mcpConfigPath?: unknown;
  terminalWsPort?: unknown;
}

// Set by electron/main (`global.mcpConfigPath = …`). Typed view, not `any`.
const raylineGlobals = globalThis as typeof globalThis & RaylineGlobals;

export function getMcpConfigPath(): string | null {
  const value = raylineGlobals.mcpConfigPath;
  return typeof value === "string" && value ? value : null;
}

export function getTerminalWsPort(): string {
  const value = raylineGlobals.terminalWsPort;
  return typeof value === "number" || (typeof value === "string" && value) ? String(value) : "";
}

/**
 * `scripts/claudi-terminal.cjs`. The main process is bundled into
 * dist-electron/electron/main.cjs, so `__dirname` is that directory at
 * runtime (and electron/ in dev) — `../scripts` resolves either way.
 */
export const TERMINAL_CLI_PATH = toUnpackedPath(path.join(__dirname, "../scripts/claudi-terminal.cjs"));

/** Env vars that let Codex / OpenCode drive RayLine's terminal window. */
export function terminalEnv(): Record<string, string> {
  return {
    CLAUDI_TERMINAL_CLI: TERMINAL_CLI_PATH,
    CLAUDI_TERMINAL_PORT: getTerminalWsPort(),
    CLAUDI_TERMINAL_MCP_CONFIG: getMcpConfigPath() ?? "",
  };
}

/** Base env for every locally spawned CLI. */
export function baseCliEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, FORCE_COLOR: "0", PATH: buildSpawnPath(), ...extra };
}

/** The MCP config path when it exists on disk (async; no sync fs on start). */
export async function getExistingMcpConfigPath(): Promise<string | null> {
  const configPath = getMcpConfigPath();
  if (!configPath) return null;
  try {
    await fsp.access(configPath);
    return configPath;
  } catch {
    return null;
  }
}

export async function isDirectory(dirPath: string | null | undefined): Promise<boolean> {
  if (!dirPath) return false;
  try {
    return (await fsp.stat(dirPath)).isDirectory();
  } catch {
    return false;
  }
}

/** Memoized `resolveCliBin`, re-validated with a cheap stat on each call. */
export function createCliBinResolver(commandName: string, envVarName: string): () => string | null {
  let cached: string | null = null;
  return () => {
    if (cached && isExecutable(cached)) return cached;
    cached = resolveCliBin(commandName, { envVarName });
    return cached;
  };
}
