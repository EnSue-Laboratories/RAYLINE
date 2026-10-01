/**
 * Shell selection and environment for PTY sessions: strip IDE-injected
 * variables, add RayLine terminal UX variables, and route zsh / bash through
 * the bundled `shell-init/` bootstrap.
 */

import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type ShellEnv = Record<string, string | undefined>;

export interface ShellLaunch {
  shell: string;
  args: string[];
  env: ShellEnv;
}

export interface SupportPaths {
  /** `<bundle>/shell-init` */
  shellInitRoot: string;
  /** `<bundle>/vendor` */
  vendorRoot: string;
}

export function defaultShell(env: ShellEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  return env.SHELL || (platform === "win32" ? "cmd.exe" : platform === "darwin" ? "/bin/zsh" : "/bin/bash");
}

// When the Electron app is launched from VS Code (or another IDE), variables
// like TERM_PROGRAM, VSCODE_*, and ZDOTDIR leak into process.env. They make
// the shell inside xterm.js load foreign shell-integration scripts that send
// escape sequences xterm.js can't handle, producing garbled output.
const STRIP_ENV_PREFIXES = ["VSCODE_", "TERM_PROGRAM", "USER_ZDOTDIR"];
const STRIP_ENV_EXACT = new Set(["CODESPACES", "GIT_ASKPASS", "ELECTRON_RUN_AS_NODE"]);

/** Copy of `env` without IDE-injected variables; restores VS Code's saved ZDOTDIR. */
export function buildCleanEnv(env: ShellEnv): ShellEnv {
  const clean: ShellEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (STRIP_ENV_EXACT.has(key)) continue;
    if (STRIP_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    clean[key] = value;
  }
  if (env.USER_ZDOTDIR) clean.ZDOTDIR = env.USER_ZDOTDIR;
  return clean;
}

function bundledFzfBinary(vendorRoot: string): string | null {
  const executable = process.platform === "win32" ? "fzf.exe" : "fzf";
  const candidate = path.join(vendorRoot, "fzf", `${process.platform}-${process.arch}`, "bin", executable);
  return existsSync(candidate) ? candidate : null;
}

function bundledFzfShellRoot(vendorRoot: string): string | null {
  const shellRoot = path.join(vendorRoot, "fzf", "shell");
  return existsSync(shellRoot) ? shellRoot : null;
}

export function withTerminalUxEnv(env: ShellEnv, sessionName: string, support: SupportPaths): ShellEnv {
  const fzfBinary = bundledFzfBinary(support.vendorRoot);
  const fzfShellRoot = bundledFzfShellRoot(support.vendorRoot);
  const existingPath = env.PATH || process.env.PATH || "";
  const nextPath = fzfBinary
    ? `${path.dirname(fzfBinary)}${existingPath ? path.delimiter : ""}${existingPath}`
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
    RAYLINE_PROMPT_MODE: sessionName.startsWith("shell-run-") ? "minimal" : "compact",
    ...(fzfShellRoot ? { RAYLINE_FZF_SHELL_ROOT: fzfShellRoot } : {}),
  };
}

function shellBaseName(shellPath: string): string {
  return path.basename(shellPath).toLowerCase().replace(/\.exe$/, "");
}

export function resolveShellLaunch(shellPath: string, env: ShellEnv, shellInitRoot: string): ShellLaunch {
  const name = shellBaseName(shellPath);
  const zshInitDir = path.join(shellInitRoot, "zsh");
  const bashInitFile = path.join(shellInitRoot, "bash", "bashrc");

  if (name === "zsh" && existsSync(zshInitDir)) {
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

  if (name === "bash" && existsSync(bashInitFile)) {
    return {
      shell: shellPath,
      args: ["--init-file", bashInitFile, "-i"],
      env: { ...env, RAYLINE_ORIG_BASHRC: path.join(os.homedir(), ".bashrc") },
    };
  }

  return { shell: shellPath, args: [], env };
}

const KNOWN_SHELLS = new Set([
  "sh", "bash", "zsh", "fish", "dash", "ksh", "mksh", "tcsh", "csh", "nu", "elvish", "xonsh",
  "pwsh", "powershell", "cmd",
]);

/**
 * What to do with a session's `command`:
 * - a shell (`/bin/zsh`, `bash`, `pwsh.exe`) is spawned directly as the PTY
 *   program (legacy behavior);
 * - anything else (`npm run dev`, `python3 -m http.server`) is a command line
 *   typed into an interactive default shell, so the session survives the
 *   command and arguments work. Spawning it directly made node-pty treat the
 *   whole line as an executable path, which exits immediately (issue #219).
 */
export type CommandPlan = { kind: "shell"; shell: string } | { kind: "typed"; shell: string; commandLine: string };

export function planCommand(command: string | undefined, fallbackShell: string): CommandPlan {
  const trimmed = command?.trim();
  if (!trimmed) return { kind: "shell", shell: fallbackShell };
  const isSingleToken = !/\s/.test(trimmed) || (path.isAbsolute(trimmed) && existsSync(trimmed));
  if (isSingleToken && KNOWN_SHELLS.has(shellBaseName(trimmed))) return { kind: "shell", shell: trimmed };
  return { kind: "typed", shell: fallbackShell, commandLine: trimmed };
}
