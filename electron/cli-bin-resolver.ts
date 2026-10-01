/**
 * Locates agent CLIs (claude, codex, opencode, gh, node …) for GUI-launched
 * Electron, whose PATH usually lacks the user's shell PATH mutations, and
 * spawns them portably (Windows `.cmd` shims, npm shim unwrapping).
 *
 * `resolveCliBin` is synchronous (used by providers at launch time);
 * `resolveCliBinAsync` never blocks the main thread and should be preferred
 * on IPC paths. Both share a positive-result cache.
 *
 * `warmLoginShellPath()` (called once at startup) captures the login
 * shell's PATH in the background. Once it is known it is searched directly,
 * so neither resolver has to spawn a login shell per lookup — previously a
 * missing CLI cost up to 5 s of blocked main thread per shell candidate.
 */

import {
  execFile,
  spawn,
  spawnSync,
  type ChildProcess,
  type ExecFileException,
  type ExecFileOptions,
  type SpawnOptions,
} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const IS_WINDOWS = process.platform === "win32";
const LOGIN_SHELL_TIMEOUT_MS = 5000;

export const COMMON_EXTRA_PATH_DIRS: readonly string[] = IS_WINDOWS
  ? []
  : ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];

export interface ResolveCliBinOptions {
  /** Environment variable that may hold an explicit path (e.g. CLAUDE_BIN). */
  envVarName?: string;
  /** Extra directories searched before the common ones (`~/` allowed). */
  extraDirs?: readonly string[];
}

export type ExecFileCliCallback = (error: ExecFileException | null, stdout: string, stderr: string) => void;

export function isExecutable(filePath: string): boolean {
  try {
    if (!fs.statSync(filePath).isFile()) return false;
    // X_OK is not meaningful on Windows — existence + PATHEXT match is enough.
    if (!IS_WINDOWS) fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isExecutableAsync(filePath: string): Promise<boolean> {
  try {
    if (!(await fs.promises.stat(filePath)).isFile()) return false;
    if (!IS_WINDOWS) await fs.promises.access(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function getPathExtensions(): string[] {
  if (!IS_WINDOWS) return [""];
  const raw = process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD";
  const exts = raw
    .split(";")
    .map((e) => e.trim())
    .filter(Boolean);
  // On Windows, PATHEXT matches must be tried FIRST. npm's global bin
  // (`%APPDATA%\npm`) installs three files per command — `codex`,
  // `codex.cmd`, `codex.ps1` — and only the `.cmd` is directly spawnable.
  // Trying the bare name first would return the extension-less bash shim,
  // which `child_process.spawn` can't execute.
  return [...exts, ""];
}

function hasKnownExtension(candidate: string): boolean {
  if (!IS_WINDOWS) return true;
  const lower = candidate.toLowerCase();
  return getPathExtensions()
    .filter(Boolean)
    .some((ext) => lower.endsWith(ext.toLowerCase()));
}

function expandHome(inputPath: string): string {
  if (!inputPath) return inputPath;
  if (inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/")) return path.join(os.homedir(), inputPath.slice(2));
  return inputPath;
}

function splitPath(pathValue: string | undefined): string[] {
  return (pathValue ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getUserBinDirs(): string[] {
  const home = os.homedir();
  if (!home) return [];

  const shared = [
    path.join(home, "bin"),
    path.join(home, ".local", "bin"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".yarn", "bin"),
    path.join(home, ".config", "yarn", "global", "node_modules", ".bin"),
    path.join(home, ".local", "share", "pnpm"),
    path.join(home, "Library", "pnpm"),
    path.join(home, ".bun", "bin"),
    path.join(home, ".volta", "bin"),
    path.join(home, ".asdf", "shims"),
    path.join(home, ".local", "share", "mise", "shims"),
    path.join(home, ".cargo", "bin"),
  ];

  if (!IS_WINDOWS) return shared;

  const appData = process.env.APPDATA;
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];

  const windowsDirs = [
    appData && path.join(appData, "npm"),
    localAppData && path.join(localAppData, "Programs", "claude"),
    localAppData && path.join(localAppData, "Volta", "bin"),
    localAppData && path.join(localAppData, "fnm"),
    localAppData && path.join(localAppData, "Microsoft", "WindowsApps"),
    path.join(home, "scoop", "shims"),
    path.join(home, ".bun", "bin"),
    programFiles && path.join(programFiles, "nodejs"),
    programFiles && path.join(programFiles, "Git", "bin"),
    programFiles && path.join(programFiles, "Git", "cmd"),
    programFiles && path.join(programFiles, "GitHub CLI"),
    programFilesX86 && path.join(programFilesX86, "nodejs"),
  ].filter((dir): dir is string => Boolean(dir));

  return [...shared, ...windowsDirs];
}

// ── Login-shell PATH (captured once, in the background) ─────────────────────

let loginShellPath: string | null = null;
let loginShellPathWarm: Promise<void> | null = null;

const PATH_MARKER = "__RAYLINE_PATH__";

/** Starts (once) an async probe of the login shell's PATH; resolves when it settled. */
export function warmLoginShellPath(): Promise<void> {
  if (IS_WINDOWS) return Promise.resolve();
  loginShellPathWarm ??= (async () => {
    for (const shellPath of loginShellCandidates()) {
      if (!(await isExecutableAsync(shellPath))) continue;
      const stdout = await new Promise<string | null>((resolve) => {
        execFile(
          shellPath,
          ["-lc", `printf '%s%s%s' ${PATH_MARKER} "$PATH" ${PATH_MARKER}`],
          { encoding: "utf-8", timeout: LOGIN_SHELL_TIMEOUT_MS, windowsHide: true },
          (error, out) => resolve(error ? null : out),
        );
      });
      const match = stdout === null ? null : new RegExp(`${PATH_MARKER}(.*)${PATH_MARKER}`, "s").exec(stdout);
      if (match?.[1] !== undefined) {
        loginShellPath = match[1].trim();
        return;
      }
    }
    loginShellPath = "";
  })();
  return loginShellPathWarm;
}

export function buildSpawnPath(extraDirs: readonly string[] = []): string {
  return [...new Set([
    ...splitPath(process.env.PATH),
    ...splitPath(loginShellPath ?? ""),
    ...extraDirs.map(expandHome).filter(Boolean),
    ...COMMON_EXTRA_PATH_DIRS,
    ...getUserBinDirs(),
  ])].join(path.delimiter);
}

/** Every path to probe for `basePath`, in priority order. */
function extensionProbes(basePath: string): string[] {
  const probes = getPathExtensions().map((ext) => basePath + ext);
  if (IS_WINDOWS && !hasKnownExtension(basePath)) probes.push(basePath);
  return probes;
}

/** Every path to probe for a bare command name or path, in priority order. */
function candidateProbes(candidate: string | null | undefined, searchPath: string): string[] {
  if (!candidate) return [];
  const normalized = expandHome(candidate.trim());
  if (!normalized) return [];

  const probes: string[] = [];
  if (path.isAbsolute(normalized)) probes.push(...extensionProbes(normalized));
  if (normalized.includes(path.sep) || (IS_WINDOWS && normalized.includes("/"))) {
    probes.push(...extensionProbes(path.resolve(normalized)));
  }
  for (const dir of splitPath(searchPath)) {
    probes.push(...extensionProbes(path.join(dir, normalized)));
  }
  return probes;
}

function resolvePathCandidate(candidate: string | null | undefined, searchPath: string): string | null {
  return candidateProbes(candidate, searchPath).find(isExecutable) ?? null;
}

async function resolvePathCandidateAsync(candidate: string | null | undefined, searchPath: string): Promise<string | null> {
  for (const probe of candidateProbes(candidate, searchPath)) {
    if (await isExecutableAsync(probe)) return probe;
  }
  return null;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function loginShellCandidates(): string[] {
  return [...new Set([process.env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"].filter((s): s is string => Boolean(s)))];
}

function firstLine(text: string): string | undefined {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

// GUI-launched Electron apps often miss user shell PATH mutations from
// nvm/fnm/asdf/Volta or custom npm global prefixes, so ask a login shell.
function resolveWithLoginShell(commandName: string, searchPath: string): string | null {
  // The captured login PATH is already part of searchPath; nothing more to find.
  if (IS_WINDOWS || loginShellPath !== null) return null;
  const env = { ...process.env, PATH: searchPath };
  for (const shellPath of loginShellCandidates()) {
    if (!isExecutable(shellPath)) continue;
    try {
      const result = spawnSync(shellPath, ["-lc", `command -v ${shellQuote(commandName)}`], {
        encoding: "utf-8",
        env,
        timeout: LOGIN_SHELL_TIMEOUT_MS,
        windowsHide: true,
      });
      if (result.status !== 0) continue;
      const fullPath = resolvePathCandidate(firstLine(result.stdout || ""), searchPath);
      if (fullPath) return fullPath;
    } catch {
      // try the next shell
    }
  }
  return null;
}

function runLoginShell(shellPath: string, commandName: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      shellPath,
      ["-lc", `command -v ${shellQuote(commandName)}`],
      { encoding: "utf-8", env, timeout: LOGIN_SHELL_TIMEOUT_MS, windowsHide: true },
      (error, stdout) => resolve(error ? null : stdout),
    );
  });
}

async function resolveWithLoginShellAsync(commandName: string, searchPath: string): Promise<string | null> {
  if (IS_WINDOWS || loginShellPath !== null) return null;
  const env = { ...process.env, PATH: searchPath };
  for (const shellPath of loginShellCandidates()) {
    if (!(await isExecutableAsync(shellPath))) continue;
    const stdout = await runLoginShell(shellPath, commandName, env);
    if (stdout === null) continue;
    const fullPath = await resolvePathCandidateAsync(firstLine(stdout), searchPath);
    if (fullPath) return fullPath;
  }
  return null;
}

// Positive results only: a CLI installed while the app runs is still found.
const resolvedBinCache = new Map<string, string>();

function cacheKey(commandName: string, envVarName: string | undefined, extraDirs: readonly string[]): string {
  return JSON.stringify([commandName, envVarName ?? "", envVarName ? process.env[envVarName] ?? "" : "", extraDirs, process.env.PATH ?? ""]);
}

function binCandidates(commandName: string, envVarName: string | undefined): string[] {
  const fromEnv = envVarName ? process.env[envVarName] : undefined;
  return [fromEnv, commandName].filter((c): c is string => Boolean(c));
}

export function resolveCliBin(commandName: string, { envVarName, extraDirs = [] }: ResolveCliBinOptions = {}): string | null {
  const key = cacheKey(commandName, envVarName, extraDirs);
  const cached = resolvedBinCache.get(key);
  if (cached && isExecutable(cached)) return cached;

  const searchPath = buildSpawnPath(extraDirs);
  let resolved: string | null = null;
  for (const candidate of binCandidates(commandName, envVarName)) {
    resolved = resolvePathCandidate(candidate, searchPath);
    if (resolved) break;
  }
  resolved ??= resolveWithLoginShell(commandName, searchPath);
  if (resolved) resolvedBinCache.set(key, resolved);
  else resolvedBinCache.delete(key);
  return resolved;
}

export async function resolveCliBinAsync(
  commandName: string,
  { envVarName, extraDirs = [] }: ResolveCliBinOptions = {},
): Promise<string | null> {
  const key = cacheKey(commandName, envVarName, extraDirs);
  const cached = resolvedBinCache.get(key);
  if (cached && (await isExecutableAsync(cached))) return cached;

  const searchPath = buildSpawnPath(extraDirs);
  let resolved: string | null = null;
  for (const candidate of binCandidates(commandName, envVarName)) {
    resolved = await resolvePathCandidateAsync(candidate, searchPath);
    if (resolved) break;
  }
  resolved ??= await resolveWithLoginShellAsync(commandName, searchPath);
  if (resolved) resolvedBinCache.set(key, resolved);
  else resolvedBinCache.delete(key);
  return resolved;
}

function escapeCmdArg(arg: string): string {
  if (!arg) return '""';
  // No quoting needed if arg has no whitespace or cmd.exe metacharacters.
  if (!/[\s"&|<>()^!%,;=]/.test(arg)) return arg;
  // CreateProcess parse rules: escape embedded quotes and any trailing
  // backslash runs that would otherwise eat the closing quote.
  const inner = arg
    .replace(/(\\*)"/g, (_match: string, bs: string) => `${bs}${bs}\\"`)
    .replace(/(\\+)$/, (_match: string, bs: string) => bs + bs);
  return `"${inner}"`;
}

function needsCmdWrapping(binPath: string): boolean {
  return IS_WINDOWS && /\.(cmd|bat)$/i.test(binPath);
}

function buildCmdWrappedArgs(binPath: string, args: readonly string[]): { command: string; args: string[] } {
  const line = [binPath, ...args].map(escapeCmdArg).join(" ");
  return { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", line] };
}

// npm's generated .cmd shims on Windows have a fixed shape that ends with
//   "%_prog%"  "%dp0%\path\to\script.js" %*
// If we dispatch through cmd.exe, multi-line args (e.g. a whole system-context
// prompt) are truncated at the first newline because cmd.exe parses them as
// separate commands. Extracting the underlying JS entrypoint lets us spawn
// `node script.js ...args` directly — no cmd.exe, no arg-length or newline
// limits, no percent-expansion. For non-npm `.cmd` shims we fall back to the
// cmd.exe wrapper which preserves single-line behavior.
function resolveNpmShimTarget(cmdPath: string): string | null {
  if (!IS_WINDOWS) return null;
  try {
    const content = fs.readFileSync(cmdPath, "utf-8");
    const match = content.match(/"%_prog%"\s+"%dp0%[\\/]([^"]+)"\s+%\*/);
    if (!match?.[1]) return null;
    const scriptPath = path.join(path.dirname(cmdPath), match[1]);
    return fs.existsSync(scriptPath) ? scriptPath : null;
  } catch {
    return null;
  }
}

let cachedNodeBin: string | null = null;
function resolveNodeBin(): string | null {
  if (cachedNodeBin && isExecutable(cachedNodeBin)) return cachedNodeBin;
  cachedNodeBin = resolveCliBin("node", { envVarName: "NODE_BIN" });
  return cachedNodeBin;
}

function maybeDirectNodeInvocation(binPath: string): { command: string; prefixArgs: string[] } | null {
  if (!needsCmdWrapping(binPath)) return null;
  const shimTarget = resolveNpmShimTarget(binPath);
  if (!shimTarget) return null;
  const nodeBin = resolveNodeBin();
  if (!nodeBin) return null;
  return { command: nodeBin, prefixArgs: [shimTarget] };
}

export function spawnCli(binPath: string, args: readonly string[], options: SpawnOptions = {}): ChildProcess {
  const direct = maybeDirectNodeInvocation(binPath);
  if (direct) return spawn(direct.command, [...direct.prefixArgs, ...args], options);
  if (needsCmdWrapping(binPath)) {
    const { command, args: wrapped } = buildCmdWrappedArgs(binPath, args);
    return spawn(command, wrapped, { ...options, windowsVerbatimArguments: true });
  }
  return spawn(binPath, args, options);
}

/** `execFile` with the same Windows shim handling as `spawnCli`; output is always utf-8 text. */
export function execFileCli(binPath: string, args: readonly string[], callback: ExecFileCliCallback): ChildProcess;
export function execFileCli(
  binPath: string,
  args: readonly string[],
  options: ExecFileOptions | null | undefined,
  callback: ExecFileCliCallback,
): ChildProcess;
export function execFileCli(
  binPath: string,
  args: readonly string[],
  optionsOrCallback: ExecFileOptions | ExecFileCliCallback | null | undefined,
  maybeCallback?: ExecFileCliCallback,
): ChildProcess {
  const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
  const baseOptions = typeof optionsOrCallback === "function" ? {} : (optionsOrCallback ?? {});
  const options = { ...baseOptions, encoding: "utf-8" as const };
  const done = (error: ExecFileException | null, stdout: string, stderr: string): void => {
    callback?.(error, stdout, stderr);
  };
  const direct = maybeDirectNodeInvocation(binPath);
  if (direct) return execFile(direct.command, [...direct.prefixArgs, ...args], options, done);
  if (needsCmdWrapping(binPath)) {
    const { command, args: wrapped } = buildCmdWrappedArgs(binPath, args);
    return execFile(command, wrapped, { ...options, windowsVerbatimArguments: true }, done);
  }
  return execFile(binPath, args, options, done);
}
