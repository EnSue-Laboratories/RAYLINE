/**
 * macOS GUI apps don't inherit the shell's proxy variables, so CLIs that
 * need the network (Antigravity) get the system proxy from `scutil --proxy`
 * (ported from PR #230 `runtime-env.cjs`). The lookup is async and cached
 * for a minute — the PR ran `execFileSync` on the main process.
 *
 * (PR #230's `terminalCliPath()` is superseded by `TERMINAL_CLI_PATH` in
 * providers/common/runtime-env, built on electron/paths `toUnpackedPath`.)
 */

import { execFile } from "node:child_process";

const SCUTIL_TIMEOUT_MS = 1500;
const CACHE_TTL_MS = 60_000;

/**
 * Adds `HTTP_PROXY` / `HTTPS_PROXY` from `scutil --proxy` output when the
 * scheme is enabled and the env has no explicit proxy (either case, or
 * `ALL_PROXY`). Pure; returns a new object.
 */
export function parseSystemProxy(text: string, env: Readonly<Record<string, string | undefined>> = {}): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = { ...env };
  for (const scheme of ["HTTP", "HTTPS"] as const) {
    if (env[`${scheme}_PROXY`] || env[`${scheme.toLowerCase()}_proxy`] || env.ALL_PROXY || env.all_proxy) continue;
    const enabled = new RegExp(`\\b${scheme}Enable\\s*:\\s*1\\b`).test(text);
    const host = new RegExp(`\\b${scheme}Proxy\\s*:\\s*(\\S+)`).exec(text)?.[1];
    const port = new RegExp(`\\b${scheme}Port\\s*:\\s*(\\d+)`).exec(text)?.[1];
    if (enabled && host && port && !/[\\/@?#]/.test(host)) result[`${scheme}_PROXY`] = `http://${host}:${port}`;
  }
  return result;
}

let cachedProxyText = "";
let checkedAt = 0;
let pending: Promise<string> | null = null;

function readScutilProxy(): Promise<string> {
  if (pending) return pending;
  pending = new Promise<string>((resolve) => {
    execFile("/usr/sbin/scutil", ["--proxy"], { encoding: "utf8", timeout: SCUTIL_TIMEOUT_MS, windowsHide: true }, (error, stdout) => {
      resolve(error ? "" : stdout);
    });
  }).then((text) => {
    cachedProxyText = text;
    checkedAt = Date.now();
    pending = null;
    return text;
  });
  return pending;
}

/** `env` plus the macOS system proxy (no-op elsewhere). */
export async function withSystemProxy(env: NodeJS.ProcessEnv = process.env): Promise<NodeJS.ProcessEnv> {
  if (process.platform !== "darwin") return { ...env };
  const text = Date.now() - checkedAt > CACHE_TTL_MS ? await readScutilProxy() : cachedProxyText;
  return parseSystemProxy(text, env);
}
