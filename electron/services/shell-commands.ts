/** `shell-run` (local one-off shell command) and `remote-runtime-check` (SSH probe). */

import { spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import type { RemoteRuntimeCheckInput, RemoteRuntimeCheckResult } from "@shared/providers/types";
import type { ShellRunRequest, ShellRunResult } from "@shared/system/types";
import { buildSpawnPath } from "../cli-bin-resolver";
import { normalizeRemoteRuntime, spawnRemoteCommand } from "../remote-runtime";
import { collectChildOutput } from "./child-output";
import { errorMessage } from "./errors";

const SHELL_COMMAND_TIMEOUT_MS = 15000;
const SHELL_OUTPUT_LIMIT = 128 * 1024;
const isWindows = process.platform === "win32";

const shellEnv = (): NodeJS.ProcessEnv => ({ ...process.env, FORCE_COLOR: "0", PATH: buildSpawnPath() });

export async function runShellCommand(request: Partial<ShellRunRequest> | null | undefined): Promise<ShellRunResult> {
  const command = typeof request?.command === "string" ? request.command.trim() : "";
  const cwd = request?.cwd || os.homedir();
  const base = { command, cwd, stdout: "", stderr: "", exitCode: null, timedOut: false, truncated: false };
  if (!command) return { ...base, ok: false, error: "Command is required." };

  const shellBin = isWindows ? (process.env.ComSpec || "cmd.exe") : "/bin/sh";
  const shellArgs = isWindows ? ["/d", "/s", "/c", command] : ["-c", command];
  let child: ChildProcess;
  try {
    child = spawn(shellBin, shellArgs, { cwd, env: shellEnv(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  } catch (error) {
    return { ...base, ok: false, error: errorMessage(error) };
  }

  // On timeout the child is killed and we still wait for it to exit.
  const out = await collectChildOutput(child, { limit: SHELL_OUTPUT_LIMIT, timeoutMs: SHELL_COMMAND_TIMEOUT_MS, settleOnTimeout: false });
  const result = { command, cwd, stdout: out.stdout, stderr: out.stderr, timedOut: out.timedOut, truncated: out.truncated };
  if (out.error) return { ...result, ok: false, exitCode: null, error: errorMessage(out.error) };
  return { ...result, ok: true, exitCode: out.code };
}

const REMOTE_PROBE_SCRIPT = `
find_remote_cmd() {
  name="$1"
  check_cmd_path() {
    candidate="$1"
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      printf '%s\\n' "$candidate"
      return 0
    fi
    return 1
  }
  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return 0
  fi
  for dir in "$HOME/.npm-global/bin" "$HOME/.local/bin" "$HOME/bin" "$HOME/.bun/bin" "$HOME/.cargo/bin"; do
    check_cmd_path "$dir/$name" && return 0
  done
  if command -v npm >/dev/null 2>&1; then
    npm_prefix="$(npm config get prefix 2>/dev/null | head -n 1)"
    check_cmd_path "$npm_prefix/bin/$name" && return 0
  fi
  if command -v pnpm >/dev/null 2>&1; then
    pnpm_bin="$(pnpm bin -g 2>/dev/null | head -n 1)"
    check_cmd_path "$pnpm_bin/$name" && return 0
  fi
  for shell_name in bash zsh; do
    if command -v "$shell_name" >/dev/null 2>&1; then
      found="$("$shell_name" -lc "command -v $name" 2>/dev/null | head -n 1)"
      if [ -n "$found" ]; then
        printf '%s\\n' "$found"
        return 0
      fi
    fi
  done
  return 1
}
printf 'RAYLINE_SSH_OK\\n'
claude_path="$(find_remote_cmd claude || true)"
codex_path="$(find_remote_cmd codex || true)"
if [ -n "$claude_path" ]; then printf 'RAYLINE_CLAUDE=%s\\n' "$claude_path"; fi
if [ -n "$codex_path" ]; then printf 'RAYLINE_CODEX=%s\\n' "$codex_path"; fi
`.trim();

/** Interprets the probe script output (pure). */
export function parseRemoteProbeOutput(stdout: string): { connected: boolean; claudePath: string; codexPath: string } {
  return {
    connected: stdout.includes("RAYLINE_SSH_OK"),
    claudePath: /^RAYLINE_CLAUDE=(.+)$/m.exec(stdout)?.[1] ?? "",
    codexPath: /^RAYLINE_CODEX=(.+)$/m.exec(stdout)?.[1] ?? "",
  };
}

export async function checkRemoteRuntime(input: Partial<RemoteRuntimeCheckInput> | null | undefined): Promise<RemoteRuntimeCheckResult> {
  const runtime = normalizeRemoteRuntime({ type: "ssh", sshCommand: input?.sshCommand });
  if (!runtime) return { ok: false, error: "A valid SSH command is required." };

  let child: ChildProcess;
  try {
    child = spawnRemoteCommand(runtime, "sh", ["-lc", REMOTE_PROBE_SCRIPT], {
      cwd: process.cwd(),
      env: shellEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }

  const out = await collectChildOutput(child, { limit: SHELL_OUTPUT_LIMIT, timeoutMs: SHELL_COMMAND_TIMEOUT_MS, settleOnTimeout: false });
  if (out.error) {
    return { ok: false, stdout: out.stdout, stderr: out.stderr, timedOut: out.timedOut, error: errorMessage(out.error) };
  }
  const probe = parseRemoteProbeOutput(out.stdout);
  return {
    ok: out.code === 0 && probe.connected,
    connected: probe.connected,
    claude: Boolean(probe.claudePath),
    codex: Boolean(probe.codexPath),
    claudePath: probe.claudePath,
    codexPath: probe.codexPath,
    stdout: out.stdout,
    stderr: out.stderr,
    exitCode: out.code,
    signal: out.signal,
    timedOut: out.timedOut,
    ...(out.timedOut ? { error: "SSH check timed out." } : {}),
  };
}
