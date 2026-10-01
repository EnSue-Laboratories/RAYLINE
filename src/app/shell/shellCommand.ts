/**
 * `!command` shell mode: run via `shell-run`, or fall back to a hidden PTY
 * session, and format the result as a transcript message.
 */

import type { ShellRunResult } from "@shared/system/types";
import { errorMessage, hasApi } from "../lib/api";

const SHELL_TRANSCRIPT_LIMIT = 12000;
const SHELL_TERMINAL_TIMEOUT_MS = 15000;

export type ShellResult = Partial<ShellRunResult> & Pick<ShellRunResult, "ok" | "command">;

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function truncateShellText(text: string): string {
  if (!text) return "";
  if (text.length <= SHELL_TRANSCRIPT_LIMIT) return text;
  const remaining = text.length - SHELL_TRANSCRIPT_LIMIT;
  return `${text.slice(0, SHELL_TRANSCRIPT_LIMIT)}\n\n[output truncated: ${remaining} more characters]`;
}

function stripAnsi(text: string): string {
  const esc = String.fromCharCode(27);
  return text.replace(new RegExp(`${esc}(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])`, "g"), "");
}

/** Remove ANSI codes and the exit-code marker/helper lines echoed by the PTY. */
export function cleanTerminalShellOutput(text: string, marker: string): string {
  if (!text) return "";
  const markerPattern = new RegExp(`^${escapeRegExp(marker)}:\\d+$`);
  const helperPatterns = [/^__claudi_exit_code=\$\?$/, /^printf ['"].*__CLAUDI_SHELL_EXIT__.*$/];
  return stripAnsi(text)
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (markerPattern.test(trimmed)) return false;
      return !helperPatterns.some((pattern) => pattern.test(trimmed));
    })
    .join("\n")
    .trim();
}

export function formatShellResult(result: ShellResult): string {
  const fence = "````";
  if (!result.ok) return `${fence}text\n${result.error || "Unknown error"}\n${fence}`;

  const stdout = truncateShellText(result.stdout || "");
  const stderr = truncateShellText(result.stderr || "");
  const sections: string[] = [];
  if (stdout) sections.push(`${fence}text\n${stdout}\n${fence}`);
  if (stderr) {
    if (stdout) sections.push("");
    sections.push(`${fence}text\n${stderr}\n${fence}`);
  }
  if (!stdout && !stderr) sections.push(`${fence}text\n(no output)\n${fence}`);
  return sections.join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function failure(command: string, cwd: string | undefined, error: string): ShellResult {
  return { ok: false, command, cwd, stdout: "", stderr: "", exitCode: null, timedOut: false, truncated: false, error };
}

function hasTerminalApi(): boolean {
  return hasApi("terminalCreate", "terminalSend", "terminalRead", "terminalKill");
}

/** Run a command in a hidden PTY session and scrape its output (fallback path). */
export async function runShellViaTerminalApi({ command, cwd }: { command: string; cwd?: string }): Promise<ShellResult> {
  if (!hasTerminalApi()) return failure(command, cwd, "Terminal session APIs are not available.");
  const api = window.api;
  const sessionName = `shell-run-${Date.now()}`;
  const marker = `__CLAUDI_SHELL_EXIT__${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + SHELL_TERMINAL_TIMEOUT_MS;

  const createResult = await api.terminalCreate({ name: sessionName, cwd, reveal: false });
  if ("error" in createResult) return failure(command, cwd, createResult.error);

  const sendInput = async (text: string) => {
    const result = await api.terminalSend({ name: sessionName, text });
    if ("error" in result) throw new Error(result.error);
  };

  try {
    await sendInput(`${command}\n`);
    await sendInput("__claudi_exit_code=$?\n");
    await sendInput(`printf '${marker}:%s\\n' "$__claudi_exit_code"\n`);

    let rawOutput = "";
    let exitCode: number | null = null;
    const exitPattern = new RegExp(`${escapeRegExp(marker)}:(\\d+)`);
    while (Date.now() < deadline) {
      const readResult = await api.terminalRead({ name: sessionName, lines: 400 });
      if ("error" in readResult) throw new Error(readResult.error);
      rawOutput = readResult.lines.join("\n");
      const match = exitPattern.exec(rawOutput);
      if (match) {
        exitCode = Number(match[1]);
        break;
      }
      await sleep(120);
    }

    const output = cleanTerminalShellOutput(rawOutput, marker);
    return {
      ok: true,
      command,
      cwd,
      stdout: output,
      stderr: "",
      exitCode,
      timedOut: exitCode == null,
      truncated: false,
    };
  } catch (error) {
    return failure(command, cwd, errorMessage(error));
  } finally {
    try {
      await api.terminalKill({ name: sessionName });
    } catch (error) {
      console.warn("[shell-fallback] terminal kill failed:", error);
    }
  }
}

/** Run a `!command` with the best available backend; never rejects. */
export async function runShellCommand(command: string, cwd: string | undefined): Promise<ShellResult> {
  try {
    if (hasApi("shellRun")) return await window.api.shellRun({ command, cwd });
    if (hasTerminalApi()) return await runShellViaTerminalApi({ command, cwd });
    return { ok: false, command, cwd, error: "Shell mode is not available in this environment." };
  } catch (error) {
    return { ok: false, command, cwd, error: errorMessage(error) };
  }
}
