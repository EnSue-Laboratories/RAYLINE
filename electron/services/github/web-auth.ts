/**
 * Drives `gh auth login --web` in a PTY so we can read the one-time code,
 * auto-answer prompts and report progress to the UI. Falls back to
 * `script(1)` for a pseudo-terminal when node-pty can't spawn.
 */

import { spawn } from "node:child_process";
import type { GhAuthEvent } from "@shared/github/types";
import { loadNodePty } from "../terminal/node-pty";
import { createAuthOutputParser } from "./auth-output";
import { errorMessage, ghEnv, log, resolveGhBin } from "./gh-cli";

const STALL_TIMEOUT_MS = 20_000;
const AUTH_ARGS = ["auth", "login", "--hostname", "github.com", "--web", "--git-protocol", "https", "--skip-ssh-key"];

export interface WebAuthSession {
  cancel(): void;
}

/** Backend-agnostic handle over a node-pty process or a `script` child. */
interface AuthProcess {
  write(data: string): void;
  kill(): void;
}

const NOOP_SESSION: WebAuthSession = { cancel() {} };

let activeSession: (WebAuthSession & { readonly proc: AuthProcess }) | null = null;

function spawnWithPty(
  bin: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
  onData: (chunk: string) => void,
  onExit: (code: number | null) => void,
): AuthProcess | null {
  const pty = loadNodePty("github-manager");
  if (!pty) return null;
  try {
    const proc = pty.spawn(bin, AUTH_ARGS, { name: "xterm-256color", cols: 120, rows: 30, cwd, env });
    proc.onData(onData);
    proc.onExit(({ exitCode }) => onExit(exitCode));
    return { write: (data) => proc.write(data), kill: () => proc.kill() };
  } catch (err) {
    log("node-pty spawn failed, falling back to child_process:", errorMessage(err));
    return null;
  }
}

/**
 * `script` provides a real PTY so gh enables interactive mode (git
 * credential setup, workflow scope…); without TTY semantics gh skips it.
 */
function spawnWithScript(
  bin: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
  onData: (chunk: string) => void,
  onExit: (code: number | null) => void,
  onError: (err: Error) => void,
): AuthProcess | null {
  let child;
  if (process.platform === "darwin") {
    child = spawn("script", ["-q", "/dev/null", bin, ...AUTH_ARGS], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  } else if (process.platform === "linux") {
    const cmdLine = [bin, ...AUTH_ARGS].map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
    child = spawn("script", ["-qec", cmdLine, "/dev/null"], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  } else {
    return null;
  }
  const toText = (d: Buffer | string): void => onData(typeof d === "string" ? d : d.toString("utf-8"));
  child.stdout.on("data", toText);
  child.stderr.on("data", toText);
  child.on("error", onError);
  child.on("close", onExit);
  return {
    write: (data) => {
      if (!child.stdin.destroyed) child.stdin.write(data);
    },
    kill: () => child.kill(),
  };
}

export function startWebAuth(onEvent: (event: GhAuthEvent) => void): WebAuthSession {
  if (activeSession) {
    onEvent({ type: "error", error: "An auth flow is already in progress." });
    return NOOP_SESSION;
  }

  let bin: string;
  try {
    bin = resolveGhBin();
  } catch (err) {
    onEvent({ type: "error", error: errorMessage(err) });
    return NOOP_SESSION;
  }

  const parser = createAuthOutputParser();
  let finished = false;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  // Assigned right below; callbacks only run after spawn returns.
  let proc: AuthProcess | null = null;

  const write = (data: string): void => {
    try {
      proc?.write(data);
    } catch {
      /* process gone */
    }
  };
  const kill = (): void => {
    try {
      proc?.kill();
    } catch {
      /* already exited */
    }
  };
  const finish = (event: GhAuthEvent): void => {
    if (finished) return;
    finished = true;
    if (stallTimer) clearTimeout(stallTimer);
    if (activeSession?.proc === proc) activeSession = null;
    onEvent(event);
  };

  const onData = (chunk: string): void => {
    const step = parser.push(chunk);
    log("auth buffer tail:", parser.buffer.slice(-200).replace(/\n/g, "\\n"));
    for (const event of step.events) onEvent(event);
    for (const data of step.writes) write(data);
    if (step.successUser) finish({ type: "success", user: step.successUser });
  };

  const onExit = (exitCode: number | null): void => {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
    if (finished || (exitCode === 0 && parser.authenticated)) return;
    if (exitCode === 0) {
      // Completed without printing the user — the caller re-queries auth status.
      finish({ type: "success", user: null });
    } else {
      finish({ type: "error", error: `gh auth login exited with code ${exitCode}`, output: parser.buffer.trim().slice(-500) });
    }
  };

  const env = ghEnv();
  const cwd = process.env.HOME || process.cwd();
  proc =
    spawnWithPty(bin, env, cwd, onData, onExit) ??
    spawnWithScript(bin, env, cwd, onData, onExit, (err) => finish({ type: "error", error: err.message }));

  if (!proc) {
    // No PTY wrapper on this platform — fail explicitly rather than run a
    // non-interactive auth that silently skips git credential setup.
    onEvent({
      type: "error",
      error:
        "node-pty is required for GitHub auth on this platform but failed to spawn. Reinstall or rebuild node-pty for your Electron version.",
    });
    return NOOP_SESSION;
  }

  // No one-time code within 20 s means gh is stuck on a prompt: kill it and
  // surface the captured output.
  stallTimer = setTimeout(() => {
    if (finished || parser.codeSeen) return;
    kill();
    finish({
      type: "error",
      error: "Timed out waiting for GitHub. gh may be stuck on a prompt.",
      output: parser.buffer.trim().slice(-500) || "(no output)",
    });
  }, STALL_TIMEOUT_MS);

  const session = {
    proc,
    cancel() {
      if (finished) return;
      kill();
      finish({ type: "cancelled" });
    },
  };
  activeSession = session;
  return session;
}

export function cancelWebAuth(): void {
  activeSession?.cancel();
}
