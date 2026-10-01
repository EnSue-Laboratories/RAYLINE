/**
 * Process-wide runtime values for agent runs: the terminal MCP config path and
 * the terminal WebSocket port (published by electron/app/terminal-bridge via
 * `setTerminalBridgeInfo`), plus the bundled terminal CLI script.
 */

import { promises as fsp } from "node:fs";
import path from "node:path";
import { toUnpackedPath } from "../../paths";
import { buildSpawnPath, isExecutable, resolveCliBin } from "../../cli-bin-resolver";
import { getTerminalBridgeInfo } from "./terminal-bridge-info";

export function getMcpConfigPath(): string | null {
  return getTerminalBridgeInfo()?.mcpConfigPath || null;
}

export function getTerminalWsPort(): string {
  const port = getTerminalBridgeInfo()?.wsPort;
  return port === undefined ? "" : String(port);
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
