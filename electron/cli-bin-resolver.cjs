const { execFile, spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const IS_WINDOWS = process.platform === "win32";

const COMMON_EXTRA_PATH_DIRS = IS_WINDOWS
  ? []
  : ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];

function isExecutable(filePath) {
  try {
    if (!fs.statSync(filePath).isFile()) return false;
    // X_OK is not meaningful on Windows — existence + PATHEXT match is enough.
    if (!IS_WINDOWS) fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function getPathExtensions() {
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

function hasKnownExtension(candidate) {
  if (!IS_WINDOWS) return true;
  const lower = candidate.toLowerCase();
  return getPathExtensions()
    .filter(Boolean)
    .some((ext) => lower.endsWith(ext.toLowerCase()));
}

function expandHome(inputPath) {
  if (!inputPath || typeof inputPath !== "string") return inputPath;
  if (inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/")) return path.join(os.homedir(), inputPath.slice(2));
  return inputPath;
}

function splitPath(pathValue) {
  return String(pathValue || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getUserBinDirs() {
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
    programFilesX86 && path.join(programFilesX86, "nodejs"),
  ].filter(Boolean);

  return [...shared, ...windowsDirs];
}

function buildSpawnPath(extraDirs = []) {
  return [...new Set([
    ...splitPath(process.env.PATH),
    ...extraDirs.map(expandHome).filter(Boolean),
    ...COMMON_EXTRA_PATH_DIRS,
    ...getUserBinDirs(),
  ])].join(path.delimiter);
}

function tryWithExtensions(basePath) {
  for (const ext of getPathExtensions()) {
    const candidate = basePath + ext;
    if (isExecutable(candidate)) return candidate;
  }
  if (IS_WINDOWS && !hasKnownExtension(basePath) && isExecutable(basePath)) {
    return basePath;
  }
  return null;
}

function resolvePathCandidate(candidate, searchPath) {
  if (!candidate || typeof candidate !== "string") return null;

  const normalized = expandHome(candidate.trim());
  if (!normalized) return null;

  if (path.isAbsolute(normalized)) {
    const resolved = tryWithExtensions(normalized);
    if (resolved) return resolved;
  }

  if (normalized.includes(path.sep) || (IS_WINDOWS && normalized.includes("/"))) {
    const absoluteCandidate = path.resolve(normalized);
    const resolved = tryWithExtensions(absoluteCandidate);
    if (resolved) return resolved;
  }

  for (const dir of splitPath(searchPath)) {
    const resolved = tryWithExtensions(path.join(dir, normalized));
    if (resolved) return resolved;
  }

  return null;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function resolveWithLoginShell(commandName, searchPath) {
  if (process.platform === "win32") return null;

  const shellCandidates = [...new Set([
    process.env.SHELL,
    "/bin/zsh",
    "/bin/bash",
    "/bin/sh",
  ].filter(Boolean))];

  const env = { ...process.env, PATH: searchPath };

  for (const shellPath of shellCandidates) {
    if (!isExecutable(shellPath)) continue;

    try {
      // GUI-launched Electron apps often miss user shell PATH mutations from
      // nvm/fnm/asdf/Volta or custom npm global prefixes.
      const result = spawnSync(
        shellPath,
        ["-lc", `command -v ${shellQuote(commandName)}`],
        { encoding: "utf-8", env, timeout: 5000, windowsHide: true }
      );

      if (result.status !== 0) continue;

      const resolved = (result.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);

      const fullPath = resolvePathCandidate(resolved, searchPath);
      if (fullPath) return fullPath;
    } catch {}
  }

  return null;
}

function resolveCliBin(commandName, { envVarName, extraDirs = [] } = {}) {
  const searchPath = buildSpawnPath(extraDirs);
  const candidates = [envVarName ? process.env[envVarName] : null, commandName].filter(Boolean);

  for (const candidate of candidates) {
    const fullPath = resolvePathCandidate(candidate, searchPath);
    if (fullPath) return fullPath;
  }

  return resolveWithLoginShell(commandName, searchPath);
}

function escapeCmdArg(arg) {
  const s = String(arg);
  if (!s) return '""';
  // No quoting needed if arg has no whitespace or cmd.exe metacharacters.
  if (!/[\s"&|<>()^!%,;=]/.test(s)) return s;
  // CreateProcess parse rules: escape embedded quotes and any trailing
  // backslash runs that would otherwise eat the closing quote.
  const inner = s
    .replace(/(\\*)"/g, (_, bs) => bs + bs + '\\"')
    .replace(/(\\+)$/, (_, bs) => bs + bs);
  return `"${inner}"`;
}

function needsCmdWrapping(binPath) {
  return IS_WINDOWS && /\.(cmd|bat)$/i.test(binPath);
}

function buildCmdWrappedArgs(binPath, args) {
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
function resolveNpmShimTarget(cmdPath) {
  if (!IS_WINDOWS) return null;
  try {
    const content = fs.readFileSync(cmdPath, "utf-8");
    const match = content.match(/"%_prog%"\s+"%dp0%[\\/]([^"]+)"\s+%\*/);
    if (!match) return null;
    const scriptPath = path.join(path.dirname(cmdPath), match[1]);
    return fs.existsSync(scriptPath) ? scriptPath : null;
  } catch {
    return null;
  }
}

let cachedNodeBin = null;
function resolveNodeBin() {
  if (cachedNodeBin && isExecutable(cachedNodeBin)) return cachedNodeBin;
  cachedNodeBin = resolveCliBin("node", { envVarName: "NODE_BIN" });
  return cachedNodeBin;
}

function maybeDirectNodeInvocation(binPath) {
  if (!needsCmdWrapping(binPath)) return null;
  const shimTarget = resolveNpmShimTarget(binPath);
  if (!shimTarget) return null;
  const nodeBin = resolveNodeBin();
  if (!nodeBin) return null;
  return { command: nodeBin, prefixArgs: [shimTarget] };
}

function spawnCli(binPath, args, options = {}) {
  const direct = maybeDirectNodeInvocation(binPath);
  if (direct) return spawn(direct.command, [...direct.prefixArgs, ...args], options);
  if (needsCmdWrapping(binPath)) {
    const { command, args: wrapped } = buildCmdWrappedArgs(binPath, args);
    return spawn(command, wrapped, { ...options, windowsVerbatimArguments: true });
  }
  return spawn(binPath, args, options);
}

function execFileCli(binPath, args, options, callback) {
  if (typeof options === "function") { callback = options; options = {}; }
  options = options || {};
  const direct = maybeDirectNodeInvocation(binPath);
  if (direct) return execFile(direct.command, [...direct.prefixArgs, ...args], options, callback);
  if (needsCmdWrapping(binPath)) {
    const { command, args: wrapped } = buildCmdWrappedArgs(binPath, args);
    return execFile(command, wrapped, { ...options, windowsVerbatimArguments: true }, callback);
  }
  return execFile(binPath, args, options, callback);
}

module.exports = {
  COMMON_EXTRA_PATH_DIRS,
  buildSpawnPath,
  isExecutable,
  resolveCliBin,
  spawnCli,
  execFileCli,
};
