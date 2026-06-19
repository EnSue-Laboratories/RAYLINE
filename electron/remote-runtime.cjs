"use strict";

const { spawn } = require("child_process");

const SSH_COMMAND_PATTERN = /^\s*ssh(?:\s|$)/i;
const SAFE_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function normalizeRemoteRuntime(input) {
  if (!input || input.type !== "ssh") return null;
  const sshCommand = typeof input.sshCommand === "string" ? input.sshCommand.trim().slice(0, 2000) : "";
  if (!SSH_COMMAND_PATTERN.test(sshCommand)) return null;
  return {
    type: "ssh",
    sshCommand,
    provider: typeof input.provider === "string" ? input.provider : "",
    cwd: typeof input.cwd === "string" ? input.cwd.trim() : "",
    commandPath: typeof input.commandPath === "string" ? input.commandPath.trim() : "",
  };
}

function quotePosix(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function parseSshCommand(command) {
  const input = typeof command === "string" ? command.trim() : "";
  const tokens = [];
  let token = "";
  let quote = "";

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = "";
      } else if (quote === "\"" && ch === "\\" && i + 1 < input.length) {
        i += 1;
        token += input[i];
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
      token += input[i];
      continue;
    }
    token += ch;
  }

  if (quote) throw new Error("SSH command has an unterminated quote.");
  if (token) tokens.push(token);
  if (tokens[0] !== "ssh") throw new Error("SSH command must start with ssh.");
  return tokens;
}

function buildRemoteCommand({ command, args = [], env = {}, cwd = "" }) {
  const envPairs = Object.entries(env || {})
    .filter(([key, value]) => SAFE_ENV_KEY_PATTERN.test(key) && value != null && String(value).length > 0)
    .map(([key, value]) => `${key}=${quotePosix(value)}`);
  const envPrefix = envPairs.length > 0 ? `env ${envPairs.join(" ")} ` : "";
  const commandLine = `${envPrefix}${[command, ...args].map(quotePosix).join(" ")}`;
  return cwd ? `cd ${quotePosix(cwd)} && ${commandLine}` : commandLine;
}

function spawnRemoteCommand(remoteRuntime, command, args, options = {}, remoteOptions = {}) {
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
  const [sshBin, ...sshArgs] = parseSshCommand(runtime.sshCommand);
  const extraSshArgs = Array.isArray(remoteOptions.sshArgs) ? remoteOptions.sshArgs.filter(Boolean) : [];
  return spawn(sshBin, [...sshArgs, ...extraSshArgs, remoteCommand], options);
}

function describeRemoteRuntime(remoteRuntime) {
  const runtime = normalizeRemoteRuntime(remoteRuntime);
  if (!runtime) return null;
  return {
    type: runtime.type,
    provider: runtime.provider || null,
    command: runtime.sshCommand.replace(/\s+/g, " ").slice(0, 120),
  };
}

module.exports = {
  normalizeRemoteRuntime,
  parseSshCommand,
  spawnRemoteCommand,
  describeRemoteRuntime,
};
