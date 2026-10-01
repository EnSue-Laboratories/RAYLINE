/**
 * Host / window / misc system IPC types.
 */

/** Node `os.platform()` values. */
export type HostPlatform =
  | "aix"
  | "android"
  | "darwin"
  | "freebsd"
  | "haiku"
  | "linux"
  | "openbsd"
  | "sunos"
  | "win32"
  | "cygwin"
  | "netbsd";

/** `system-info` */
export interface SystemInfo {
  user: string;
  hostname: string;
  platform: HostPlatform;
  /** `os.arch()` */
  arch: string;
  home: string;
  nodeVersion: string;
  electronVersion: string;
  cpus: number;
  /** Total memory, e.g. "16 GB". */
  memory: string;
  /** Basename of $SHELL / %COMSPEC%, or "unknown". */
  shell: string;
}

/** `shell-run` argument. */
export interface ShellRunRequest {
  command: string;
  /** Defaults to the home directory. */
  cwd?: string | null;
}

/**
 * `shell-run` result. `ok` means the process ran (check `exitCode`); it is
 * false only when the command was empty or could not be spawned.
 */
export interface ShellRunResult {
  ok: boolean;
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  /** Output exceeded the main-process limit and was cut. */
  truncated: boolean;
  error?: string;
}
