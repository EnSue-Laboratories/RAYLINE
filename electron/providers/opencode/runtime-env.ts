/**
 * Process env for OpenCode runs, plus the temporary config directory that
 * carries per-run credentials (see `buildOpenCodeConfigOverlay`).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { baseCliEnv, terminalEnv } from "../common/runtime-env";
import { buildOpenCodeConfigOverlay } from "./config";

export interface OpenCodeRuntimeEnv {
  env: NodeJS.ProcessEnv;
  /** Removes the temporary config directory (idempotent, never throws). */
  cleanup: () => void;
}

export function buildOpenCodeEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return baseCliEnv({ OPENCODE_CLIENT: "rayline", ...terminalEnv(), ...extra });
}

function removeDir(dir: string): () => void {
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  };
}

/**
 * Synchronous variant kept for electron/main's dispatch planner, which uses
 * the env immediately. Agent runs use `createOpenCodeRuntimeEnvAsync`.
 */
export function createOpenCodeRuntimeEnv(openCodeConfig: unknown, model: unknown): OpenCodeRuntimeEnv {
  const overlay = buildOpenCodeConfigOverlay(openCodeConfig, model);
  if (!overlay) return { env: buildOpenCodeEnv(), cleanup: () => {} };
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "rayline-opencode-"));
  const configPath = path.join(configDir, "opencode.json");
  fs.writeFileSync(configPath, overlay.configJson, { mode: 0o600 });
  return { env: buildOpenCodeEnv({ ...overlay.env, OPENCODE_CONFIG: configPath }), cleanup: removeDir(configDir) };
}

export async function createOpenCodeRuntimeEnvAsync(openCodeConfig: unknown, model: unknown): Promise<OpenCodeRuntimeEnv> {
  const overlay = buildOpenCodeConfigOverlay(openCodeConfig, model);
  if (!overlay) return { env: buildOpenCodeEnv(), cleanup: () => {} };
  const configDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "rayline-opencode-"));
  const configPath = path.join(configDir, "opencode.json");
  await fs.promises.writeFile(configPath, overlay.configJson, { mode: 0o600 });
  return { env: buildOpenCodeEnv({ ...overlay.env, OPENCODE_CONFIG: configPath }), cleanup: removeDir(configDir) };
}
