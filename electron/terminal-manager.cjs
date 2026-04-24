"use strict";

/**
 * terminal-manager.cjs
 *
 * Manages persistent PTY sessions via node-pty and exposes them over a local
 * WebSocket server bound to 127.0.0.1 on a random OS-assigned port.
 *
 * Session map entry shape:
 *   {
 *     name     : string,
 *     pty      : IPty,
 *     command  : string,
 *     cwd      : string,
 *     buffer   : string[],   // scrollback, max SCROLLBACK_LIMIT lines
 *     exitCode : number|null
 *   }
 */

const os = require("os");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const { WebSocketServer } = require("ws");

// node-pty is a native module — require lazily so syntax-check passes even
// when binaries are not yet compiled for the current Electron version.
let pty;
try {
  pty = require("node-pty");
} catch (e) {
  console.error("[terminal-manager] node-pty failed to load:", e.message);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SESSIONS = 8;
const SCROLLBACK_LIMIT = 5000;

// Default shells per platform
const DEFAULT_SHELL =
  process.env.SHELL ||
  (process.platform === "win32"
    ? "cmd.exe"
    : process.platform === "darwin"
      ? "/bin/zsh"
      : "/bin/bash");

// Environment variables to strip from the PTY.  When the Electron app is
// launched from VS Code (or another IDE), variables like TERM_PROGRAM,
// VSCODE_*, and ZDOTDIR leak into process.env.  These cause the shell inside
// our xterm.js terminal to load foreign shell-integration scripts that send
// escape sequences xterm.js cannot handle, producing garbled output.
const STRIP_ENV_PREFIXES = [
  "VSCODE_",
  "TERM_PROGRAM",  // also catches TERM_PROGRAM_VERSION
  "USER_ZDOTDIR",
];
const STRIP_ENV_EXACT = new Set([
  "CODESPACES",
  "GIT_ASKPASS",
  "ELECTRON_RUN_AS_NODE",
]);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {Map<string, object>} */
const sessions = new Map();

/** @type {WebSocketServer|null} */
let wss = null;

/** @type {number|null} */
let currentPort = null;

/** @type {((name: string, data: string) => void)|null} */
let outputCallback = null;

/** @type {((payload: { reason: string, name?: string, exitCode?: number|null, reveal?: boolean, sessions: Array<object> }) => void)|null} */
let sessionStateCallback = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function log(...args) {
  console.log("[terminal-manager]", ...args);
}

function emitSessionState(reason, details = {}) {
  if (!sessionStateCallback) return;
  try {
    sessionStateCallback({
      reason,
      ...details,
      sessions: listSessions(),
    });
  } catch (e) {
    log("sessionStateCallback error:", e.message);
  }
}

function getBundledSupportRoot() {
  if (app?.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked", "electron");
  }
  return __dirname;
}

function getShellInitRoot() {
  return path.join(getBundledSupportRoot(), "shell-init");
}

function getVendorRoot() {
  return path.join(getBundledSupportRoot(), "vendor");
}

function getBundledFzfShellRoot() {
  const shellRoot = path.join(getVendorRoot(), "fzf", "shell");
  return fs.existsSync(shellRoot) ? shellRoot : null;
}

function getBundledFzfBinary() {
  const executable = process.platform === "win32" ? "fzf.exe" : "fzf";
  const platformKey = `${process.platform}-${process.arch}`;
  const candidate = path.join(getVendorRoot(), "fzf", platformKey, "bin", executable);
  return fs.existsSync(candidate) ? candidate : null;
}

function withTerminalUxEnv(env, sessionName) {
  const bundledFzfBinary = getBundledFzfBinary();
  const bundledFzfShellRoot = getBundledFzfShellRoot();
  const extraPathEntries = [];

  if (bundledFzfBinary) {
    extraPathEntries.push(path.dirname(bundledFzfBinary));
  }

  const existingPath = env.PATH || process.env.PATH || "";
  const nextPath = extraPathEntries.length > 0
    ? `${extraPathEntries.join(path.delimiter)}${existingPath ? path.delimiter : ""}${existingPath}`
    : existingPath;

  return {
    ...env,
    PATH: nextPath,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    CLICOLOR: "1",
    CLICOLOR_FORCE: "1",
    FORCE_COLOR: "1",
    TERM_PROGRAM: "RayLine",
    TERM_PROGRAM_VERSION: process.env.npm_package_version || "0.1.2",
    PROMPT_EOL_MARK: "",
    CONDA_CHANGEPS1: "false",
    VIRTUAL_ENV_DISABLE_PROMPT: "1",
    DISABLE_AUTO_TITLE: "true",
    RAYLINE_TERMINAL: "1",
    RAYLINE_PROMPT_MODE: sessionName?.startsWith("shell-run-") ? "minimal" : "compact",
    ...(bundledFzfShellRoot ? { RAYLINE_FZF_SHELL_ROOT: bundledFzfShellRoot } : {}),
  };
}

function resolveShellLaunch(shellPath, env) {
  const shellName = path.basename(shellPath || "").toLowerCase();
  const shellInitRoot = getShellInitRoot();
  const zshInitDir = path.join(shellInitRoot, "zsh");
  const bashInitFile = path.join(shellInitRoot, "bash", "bashrc");

  if ((shellName === "zsh" || shellName === "zsh.exe") && fs.existsSync(zshInitDir)) {
    const originalZdotdir = env.ZDOTDIR || os.homedir();
    return {
      shell: shellPath,
      args: ["-i"],
      env: {
        ...env,
        RAYLINE_ORIG_ZDOTDIR: originalZdotdir,
        RAYLINE_ORIG_ZSHRC: path.join(originalZdotdir, ".zshrc"),
        ZDOTDIR: zshInitDir,
      },
    };
  }

  if ((shellName === "bash" || shellName === "bash.exe") && fs.existsSync(bashInitFile)) {
    return {
      shell: shellPath,
      args: ["--init-file", bashInitFile, "-i"],
      env: {
        ...env,
        RAYLINE_ORIG_BASHRC: path.join(os.homedir(), ".bashrc"),
      },
    };
  }

  return { shell: shellPath, args: [], env };
}

/**
 * Append lines to a session's scrollback buffer, capping at SCROLLBACK_LIMIT.
 * node-pty data events may contain multiple newlines; we split on \n but
 * preserve the raw string so xterm.js can render control sequences.
 */
function appendToBuffer(session, data) {
  // Split on newlines but keep trailing partial line joined to next chunk.
  const incoming = data.split("\n");
  if (incoming.length === 1) {
    // No newline — append to the last existing line (in-line update).
    if (session.buffer.length === 0) {
      session.buffer.push(incoming[0]);
    } else {
      session.buffer[session.buffer.length - 1] += incoming[0];
    }
    return;
  }

  // Merge the first fragment with the current partial last line.
  if (session.buffer.length > 0) {
    session.buffer[session.buffer.length - 1] += incoming[0];
  } else {
    session.buffer.push(incoming[0]);
  }

  // Push full lines (everything except the last, which may be a partial line).
  for (let i = 1; i < incoming.length - 1; i++) {
    session.buffer.push(incoming[i]);
    if (session.buffer.length > SCROLLBACK_LIMIT) {
      session.buffer.shift();
    }
  }

  // Push the trailing fragment (may be empty string after a trailing \n).
  session.buffer.push(incoming[incoming.length - 1]);
  if (session.buffer.length > SCROLLBACK_LIMIT) {
    session.buffer.shift();
  }
}

/** Broadcast a JSON message to every connected WebSocket client. */
function broadcast(payload) {
  if (!wss) return;
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(msg);
    }
  }
}

// ---------------------------------------------------------------------------
// Exported API
// ---------------------------------------------------------------------------

/**
 * Spawn a new PTY session.
 *
 * @param {{ name: string, command?: string, cwd?: string, reveal?: boolean }} opts
 * @returns {{ ok: true, name: string } | { error: string }}
 */
function createSession({ name, command, cwd, reveal = true } = {}) {
  if (!name) return { error: "name is required" };
  if (!pty) return { error: "node-pty is not available" };
  if (sessions.has(name)) return { error: `Session '${name}' already exists` };
  if (sessions.size >= MAX_SESSIONS) {
    return { error: `Maximum session limit (${MAX_SESSIONS}) reached` };
  }

  const shell = command || DEFAULT_SHELL;
  const workDir = cwd || os.homedir();

  log(`createSession name=${name} shell=${shell} cwd=${workDir}`);

  // Build a clean environment: strip IDE-injected variables that confuse the
  // shell into loading integrations meant for a different terminal emulator.
  // Preserve the user's original ZDOTDIR if VS Code overwrote it.
  const userZdotdir = process.env.USER_ZDOTDIR;
  const cleanEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (STRIP_ENV_EXACT.has(k)) continue;
    if (STRIP_ENV_PREFIXES.some((p) => k.startsWith(p))) continue;
    cleanEnv[k] = v;
  }
  if (userZdotdir) cleanEnv.ZDOTDIR = userZdotdir;

  const styledEnv = withTerminalUxEnv(cleanEnv, name);
  const launch = resolveShellLaunch(shell, styledEnv);

  let ptyProcess;
  try {
    ptyProcess = pty.spawn(launch.shell, launch.args, {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: workDir,
      env: launch.env,
    });
  } catch (err) {
    log("spawn error:", err.message);
    return { error: `Failed to spawn PTY: ${err.message}` };
  }

  const session = {
    name,
    pty: ptyProcess,
    command: launch.shell,
    cwd: workDir,
    buffer: [],
    exitCode: null,
  };

  ptyProcess.onData((data) => {
    appendToBuffer(session, data);
    broadcast({ type: "output", name, data });
    if (outputCallback) {
      try {
        outputCallback(name, data);
      } catch (e) {
        log("outputCallback error:", e.message);
      }
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    log(`session '${name}' exited with code ${exitCode}`);
    session.exitCode = exitCode;
    broadcast({ type: "session_exited", name, exitCode });
    if (sessions.delete(name)) {
      emitSessionState("exited", { name, exitCode });
    }
  });

  sessions.set(name, session);
  log(`session '${name}' started (PID ${ptyProcess.pid})`);
  emitSessionState("created", { name, reveal: reveal !== false });

  return { ok: true, name };
}

/**
 * Write text to a session's PTY stdin.
 *
 * @param {string} name
 * @param {string} text
 * @returns {{ ok: true } | { error: string }}
 */
function sendInput(name, text) {
  const session = sessions.get(name);
  if (!session) return { error: `Session '${name}' not found` };
  try {
    // Process common escape sequences that arrive as literal strings from MCP
    const processed = text
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\");
    session.pty.write(processed);
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Return the last N lines from a session's scrollback buffer.
 *
 * @param {string} name
 * @param {number} [lines=50]
 * @returns {{ ok: true, lines: string[] } | { error: string }}
 */
function readOutput(name, lines = 50) {
  const session = sessions.get(name);
  if (!session) return { error: `Session '${name}' not found` };
  const count = Math.min(Math.max(1, lines), SCROLLBACK_LIMIT);
  return { ok: true, lines: session.buffer.slice(-count) };
}

/**
 * Kill a PTY session and remove it from the sessions map.
 *
 * @param {string} name
 * @returns {{ ok: true } | { error: string }}
 */
function killSession(name) {
  const session = sessions.get(name);
  if (!session) return { error: `Session '${name}' not found` };
  log(`killSession '${name}'`);
  try {
    session.pty.kill();
  } catch (err) {
    log(`kill error for '${name}':`, err.message);
  }
  if (sessions.delete(name)) {
    emitSessionState("killed", { name });
  }
  return { ok: true };
}

/**
 * List all active sessions with metadata.
 *
 * @returns {Array<{ name: string, command: string, cwd: string, pid: number, exitCode: number|null }>}
 */
function listSessions() {
  const result = [];
  for (const [, s] of sessions) {
    result.push({
      name: s.name,
      command: s.command,
      cwd: s.cwd,
      pid: s.pty.pid,
      exitCode: s.exitCode,
    });
  }
  return result;
}

/**
 * Resize a session's PTY.
 *
 * @param {string} name
 * @param {number} cols
 * @param {number} rows
 * @returns {{ ok: true } | { error: string }}
 */
function resizeSession(name, cols, rows) {
  const session = sessions.get(name);
  if (!session) return { error: `Session '${name}' not found` };
  try {
    session.pty.resize(cols, rows);
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Return minimal metadata for all sessions, suitable for persistence / restore.
 *
 * @returns {Array<{ name: string, cwd: string, command: string }>}
 */
function getSessionMetadata() {
  const result = [];
  for (const [, s] of sessions) {
    result.push({ name: s.name, cwd: s.cwd, command: s.command });
  }
  return result;
}

/**
 * Set the IPC output callback that is invoked whenever a session emits data.
 *
 * @param {(name: string, data: string) => void} cb
 */
function setOutputCallback(cb) {
  outputCallback = cb;
}

/**
 * Set the callback that is invoked whenever the session list changes.
 *
 * @param {(payload: { reason: string, name?: string, exitCode?: number|null, reveal?: boolean, sessions: Array<object> }) => void} cb
 */
function setSessionStateCallback(cb) {
  sessionStateCallback = cb;
}

/**
 * Return the WebSocket server's bound port, or null if the server is not running.
 *
 * @returns {number|null}
 */
function getPort() {
  return currentPort;
}

// ---------------------------------------------------------------------------
// WebSocket action dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatch an incoming WebSocket message action to the appropriate function.
 *
 * @param {{ id: any, action: string, params: object }} msg
 * @returns {any} result value
 */
function dispatch({ action, params = {} }) {
  switch (action) {
    case "create_session":
      return createSession(params);
    case "send_input":
      return sendInput(params.name, params.text);
    case "read_output":
      return readOutput(params.name, params.lines);
    case "kill_session":
      return killSession(params.name);
    case "list_sessions":
      return listSessions();
    case "resize":
      return resizeSession(params.name, params.cols, params.rows);
    default:
      return { error: `Unknown action: ${action}` };
  }
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

/**
 * Start the WebSocket server on 127.0.0.1 using a random OS-assigned port.
 *
 * @returns {Promise<number>} Resolves to the bound port number.
 */
function startServer() {
  return new Promise((resolve, reject) => {
    if (wss) {
      log("server already running on port", currentPort);
      return resolve(currentPort);
    }

    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });

    server.on("error", (err) => {
      log("WebSocket server error:", err.message);
      if (!currentPort) {
        // Error occurred before we could bind — reject the startup promise.
        reject(err);
      }
    });

    server.on("listening", () => {
      const addr = server.address();
      currentPort = addr.port;
      wss = server;
      log(`WebSocket server listening on 127.0.0.1:${currentPort}`);
      resolve(currentPort);
    });

    server.on("connection", (ws, req) => {
      const remote = req.socket.remoteAddress;
      log("client connected from", remote);

      ws.on("message", (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          ws.send(JSON.stringify({ error: "Invalid JSON" }));
          return;
        }

        const { id, action, params } = msg;

        if (typeof action !== "string") {
          ws.send(JSON.stringify({ id, error: "action must be a string" }));
          return;
        }

        let result;
        try {
          result = dispatch({ action, params });
        } catch (err) {
          log("dispatch error:", err.message);
          result = { error: err.message };
        }

        ws.send(JSON.stringify({ id, result }));
      });

      ws.on("error", (err) => {
        log("client socket error:", err.message);
      });

      ws.on("close", () => {
        log("client disconnected from", remote);
      });
    });
  });
}

/**
 * Kill all sessions and shut down the WebSocket server.
 *
 * @returns {Promise<void>}
 */
function stopServer() {
  log("stopServer called");

  // Kill every active session.
  for (const name of [...sessions.keys()]) {
    killSession(name);
  }

  return new Promise((resolve) => {
    if (!wss) return resolve();

    wss.close(() => {
      log("WebSocket server closed");
      wss = null;
      currentPort = null;
      resolve();
    });

    // Force-close any open client connections so the server can drain promptly.
    for (const client of wss.clients) {
      try {
        client.terminate();
      } catch {}
    }
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createSession,
  sendInput,
  readOutput,
  killSession,
  listSessions,
  resizeSession,
  startServer,
  stopServer,
  getPort,
  setOutputCallback,
  setSessionStateCallback,
  getSessionMetadata,
};
