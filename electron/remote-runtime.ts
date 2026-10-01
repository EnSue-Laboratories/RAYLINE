/**
 * SSH remote runtime: validates the user's `ssh …` command and runs CLI
 * commands on the remote host through it.
 */

import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import type { NormalizedRemoteRuntime, RemoteRuntimeProviderId } from "@shared/providers/types";

const SSH_COMMAND_PATTERN = /^\s*ssh(?:\s|$)/i;
const SAFE_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type RemoteEnvValue = string | number | boolean | null | undefined;

export interface RemoteCommandSpec {
  command: string;
  args?: readonly string[];
  env?: Readonly<Record<string, RemoteEnvValue>> | null;
  cwd?: string;
}

export interface RemoteSpawnOptions {
  env?: Readonly<Record<string, RemoteEnvValue>> | null;
  cwd?: string;
  sshArgs?: readonly string[];
}

export interface RemoteRuntimeDescription {
  type: "ssh";
  provider: RemoteRuntimeProviderId | null;
  command: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toRemoteProvider(value: unknown): RemoteRuntimeProviderId | "" {
  return value === "claude" || value === "codex" ? value : "";
}

export function normalizeRemoteRuntime(input: unknown): NormalizedRemoteRuntime | null {
  if (!isRecord(input) || input.type !== "ssh") return null;
  const sshCommand = typeof input.sshCommand === "string" ? input.sshCommand.trim().slice(0, 2000) : "";
  if (!SSH_COMMAND_PATTERN.test(sshCommand)) return null;
  return {
    type: "ssh",
    sshCommand,
    provider: toRemoteProvider(input.provider),
    cwd: readTrimmed(input.cwd),
    commandPath: readTrimmed(input.commandPath),
  };
}

function quotePosix(value: RemoteEnvValue): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/** Splits an `ssh …` command line into argv (POSIX-ish quoting rules). */
export function parseSshCommand(command: unknown): string[] {
  const input = typeof command === "string" ? command.trim() : "";
  const tokens: string[] = [];
  let token = "";
  let quote = "";

  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charAt(i);
    if (quote) {
      if (ch === quote) {
        quote = "";
      } else if (quote === "\"" && ch === "\\" && i + 1 < input.length) {
        i += 1;
        token += input.charAt(i);
      } else {
        token += ch;
      }
      continue;
    }

    if (ch === "'" || ch === "\"") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (token) {
        tokens.push(token);
        token = "";
      }
      continue;
    }
    if (ch === "\\" && i + 1 < input.length) {
      i += 1;
      token += input.charAt(i);
      continue;
    }
    token += ch;
  }

  if (quote) throw new Error("SSH command has an unterminated quote.");
  if (token) tokens.push(token);
  if (tokens[0] !== "ssh") throw new Error("SSH command must start with ssh.");
  return tokens;
}

export function buildRemoteCommand({ command, args = [], env = {}, cwd = "" }: RemoteCommandSpec): string {
  const envPairs = Object.entries(env ?? {})
    .filter(([key, value]) => SAFE_ENV_KEY_PATTERN.test(key) && value !== null && value !== undefined && String(value).length > 0)
    .map(([key, value]) => `${key}=${quotePosix(value)}`);
  const envPrefix = envPairs.length > 0 ? `env ${envPairs.join(" ")} ` : "";
  const commandLine = `${envPrefix}${[command, ...args].map(quotePosix).join(" ")}`;
  return cwd ? `cd ${quotePosix(cwd)} && ${commandLine}` : commandLine;
}

export function spawnRemoteCommand(
  remoteRuntime: unknown,
  command: string,
  args: readonly string[],
  options: SpawnOptions = {},
  remoteOptions: RemoteSpawnOptions = {},
): ChildProcess {
  const runtime = normalizeRemoteRuntime(remoteRuntime);
  if (!runtime) {
    throw new Error("A valid SSH command is required for remote execution.");
  }

  const remoteCommand = buildRemoteCommand({
    command,
    args,
    env: remoteOptions.env,
    cwd: remoteOptions.cwd || runtime.cwd,
  });
  const [sshBin = "ssh", ...sshArgs] = parseSshCommand(runtime.sshCommand);
  const extraSshArgs = remoteOptions.sshArgs ? remoteOptions.sshArgs.filter(Boolean) : [];
  return spawn(sshBin, [...sshArgs, ...extraSshArgs, remoteCommand], options);
}

export function describeRemoteRuntime(remoteRuntime: unknown): RemoteRuntimeDescription | null {
  const runtime = normalizeRemoteRuntime(remoteRuntime);
  if (!runtime) return null;
  return {
    type: runtime.type,
    provider: runtime.provider || null,
    command: runtime.sshCommand.replace(/\s+/g, " ").slice(0, 120),
  };
}
