/**
 * Typed facade over main-process modules owned by other packages. Those still
 * `// @ts-nocheck` CommonJS (cli-bin-resolver, logger, remote-runtime) are
 * cast exactly once here; providers import the typed wrappers below instead
 * of the raw modules. The wrappers keep working (and type-checking) once the
 * owning package converts those files to ESM.
 *
 * TODO(ts-boundary): drop the casts once electron-shell converts
 * cli-bin-resolver, logger and remote-runtime.
 */

import type { ChildProcess, ExecFileOptions, SpawnOptions } from "node:child_process";
import type { NormalizedRemoteRuntime } from "@shared/providers/types";
import * as untypedCliBinResolver from "../../cli-bin-resolver";
import * as untypedLogger from "../../logger";
import * as untypedRemoteRuntime from "../../remote-runtime";
import { findSessionCwdAsync, loadSessionMessages as loadSessionMessagesTyped, moveSessionAsync } from "../../session-reader";

export type Logger = (...args: unknown[]) => void;

export interface ResolveCliBinOptions {
  envVarName?: string;
  extraDirs?: string[];
}

/** `execFile`-style completion callback (stdout decoded as UTF-8). */
export type ExecFileCallback = (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void;

interface CliBinResolverModule {
  buildSpawnPath: (extraDirs?: string[]) => string;
  isExecutable: (filePath: string) => boolean;
  resolveCliBin: (commandName: string, options?: ResolveCliBinOptions) => string | null;
  spawnCli: (binPath: string, args: readonly string[], options?: SpawnOptions) => ChildProcess;
  execFileCli: (binPath: string, args: readonly string[], options: ExecFileOptions, callback: ExecFileCallback) => ChildProcess;
}

interface LoggerModule {
  createLogger: (scope: string) => Logger;
}

export interface RemoteSpawnOptions {
  env?: Record<string, string>;
  cwd?: string;
  sshArgs?: readonly string[];
}

export interface RemoteRuntimeDescription {
  type: "ssh";
  provider: string | null;
  command: string;
}

interface RemoteRuntimeModule {
  normalizeRemoteRuntime: (input: unknown) => NormalizedRemoteRuntime | null;
  spawnRemoteCommand: (
    remoteRuntime: NormalizedRemoteRuntime,
    command: string,
    args: readonly string[],
    options?: SpawnOptions,
    remoteOptions?: RemoteSpawnOptions,
  ) => ChildProcess;
  describeRemoteRuntime: (remoteRuntime: NormalizedRemoteRuntime | null) => RemoteRuntimeDescription | null;
}

const cliBinResolver = untypedCliBinResolver as unknown as CliBinResolverModule;
const logger = untypedLogger as unknown as LoggerModule;
const remoteRuntime = untypedRemoteRuntime as unknown as RemoteRuntimeModule;

// ── cli-bin-resolver ────────────────────────────────────────────────────────

export function buildSpawnPath(extraDirs?: string[]): string {
  return cliBinResolver.buildSpawnPath(extraDirs);
}

export function isExecutable(filePath: string): boolean {
  return cliBinResolver.isExecutable(filePath);
}

export function resolveCliBin(commandName: string, options?: ResolveCliBinOptions): string | null {
  return cliBinResolver.resolveCliBin(commandName, options) || null;
}

export function spawnCli(binPath: string, args: readonly string[], options?: SpawnOptions): ChildProcess {
  return cliBinResolver.spawnCli(binPath, args, options);
}

/** `execFile` that handles Windows .cmd shims like `spawnCli`. */
export function execFileCli(binPath: string, args: readonly string[], options: ExecFileOptions, callback: ExecFileCallback): ChildProcess {
  return cliBinResolver.execFileCli(binPath, args, options, callback);
}

// ── logger ──────────────────────────────────────────────────────────────────

export function createLogger(scope: string): Logger {
  return logger.createLogger(scope);
}

// ── remote-runtime ──────────────────────────────────────────────────────────

export function normalizeRemoteRuntime(input: unknown): NormalizedRemoteRuntime | null {
  return remoteRuntime.normalizeRemoteRuntime(input);
}

export function spawnRemoteCommand(
  remote: NormalizedRemoteRuntime,
  command: string,
  args: readonly string[],
  options?: SpawnOptions,
  remoteOptions?: RemoteSpawnOptions,
): ChildProcess {
  return remoteRuntime.spawnRemoteCommand(remote, command, args, options, remoteOptions);
}

export function describeRemoteRuntime(remote: NormalizedRemoteRuntime | null): RemoteRuntimeDescription | null {
  return remoteRuntime.describeRemoteRuntime(remote);
}

// ── session-reader (typed; async variants keep fs off the main thread) ─────

export function findSessionCwd(sessionId: string): Promise<string | null> {
  return findSessionCwdAsync(sessionId);
}

export function moveSession(sessionId: string, newCwd: string): Promise<boolean> {
  return moveSessionAsync(sessionId, newCwd);
}

export const loadSessionMessages = loadSessionMessagesTyped;
