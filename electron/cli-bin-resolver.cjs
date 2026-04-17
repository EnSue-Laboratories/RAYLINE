const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const COMMON_EXTRA_PATH_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
];

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
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

  return [
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
}

function buildSpawnPath(extraDirs = []) {
  return [...new Set([
    ...splitPath(process.env.PATH),
    ...extraDirs.map(expandHome).filter(Boolean),
    ...COMMON_EXTRA_PATH_DIRS,
    ...getUserBinDirs(),
  ])].join(path.delimiter);
}

function resolvePathCandidate(candidate, searchPath) {
  if (!candidate || typeof candidate !== "string") return null;

  const normalized = expandHome(candidate.trim());
  if (!normalized) return null;

  if (path.isAbsolute(normalized) && isExecutable(normalized)) {
    return normalized;
  }

  if (normalized.includes(path.sep)) {
    const absoluteCandidate = path.resolve(normalized);
    if (isExecutable(absoluteCandidate)) {
      return absoluteCandidate;
    }
  }

  for (const dir of splitPath(searchPath)) {
    const fullPath = path.join(dir, normalized);
    if (isExecutable(fullPath)) {
      return fullPath;
    }
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
