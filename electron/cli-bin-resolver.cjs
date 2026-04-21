const { spawnSync } = require("child_process");
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
  return ["", ...exts];
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

module.exports = {
  COMMON_EXTRA_PATH_DIRS,
  buildSpawnPath,
  isExecutable,
  resolveCliBin,
};
