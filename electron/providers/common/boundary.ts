/**
 * Typed facade over main-process modules owned by other packages that are
 * still `// @ts-nocheck` CommonJS (cli-bin-resolver, logger, remote-runtime,
 * session-reader). Each module is cast exactly once here; providers import
 * the typed wrappers below instead of the raw modules.
 *
 * The wrappers are written so they keep working (and type-checking) once the
 * owning packages convert those files to ESM — including if `moveSession` /
 * `findSessionCwd` become async (callers always `await` them).
 *
 * TODO(ts-boundary): drop the casts once electron-shell (cli-bin-resolver,
 * logger, remote-runtime) and electron-services (session-reader) land.
 */

import type { ChildProcess, ExecFileOptions, SpawnOptions } from "node:child_process";
import type { LoadedSession } from "@shared/chat/types";
import type { NormalizedRemoteRuntime } from "@shared/providers/types";
import * as untypedCliBinResolver from "../../cli-bin-resolver";
import * as untypedLogger from "../../logger";
import * as untypedRemoteRuntime from "../../remote-runtime";
import * as untypedSessionReader from "../../session-reader";

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

interface SessionReaderModule {
  findSessionCwd: (sessionId: string) => string | null | Promise<string | null>;
  moveSession: (sessionId: string, newCwd: string) => boolean | Promise<boolean>;
  loadSessionMessages: (sessionId: string) => Promise<LoadedSession>;
}

const cliBinResolver = untypedCliBinResolver as unknown as CliBinResolverModule;
const logger = untypedLogger as unknown as LoggerModule;
const remoteRuntime = untypedRemoteRuntime as unknown as RemoteRuntimeModule;
const sessionReader = untypedSessionReader as unknown as SessionReaderModule;

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

// ── session-reader ──────────────────────────────────────────────────────────

export async function findSessionCwd(sessionId: string): Promise<string | null> {
  return (await sessionReader.findSessionCwd(sessionId)) || null;
}

export async function moveSession(sessionId: string, newCwd: string): Promise<boolean> {
  return Boolean(await sessionReader.moveSession(sessionId, newCwd));
}

export function loadSessionMessages(sessionId: string): Promise<LoadedSession> {
  return sessionReader.loadSessionMessages(sessionId);
}
