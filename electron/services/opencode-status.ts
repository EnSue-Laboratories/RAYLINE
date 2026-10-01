/**
 * OpenCode install/config probing and config writes (async; nothing here
 * blocks the main thread).
 */

import { type ExecFileOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  OpenCodeProviderConfig,
  OpenCodeSaveConfigInput,
  OpenCodeStatus,
  OpenCodeStatusSnapshot,
} from "@shared/providers/types";
import { buildSpawnPath, execFileCli, resolveCliBinAsync } from "../cli-bin-resolver";
import { AtomicFileWriter } from "./atomic-writer";
import { invalidateCliInstalledCache } from "./cli-status";
import { parseJsonc } from "./json-comments";
import {
  applyOpenCodeConfigInput,
  buildOpenCodeStatusSnapshot,
  extractProviderConfig,
  normalizeOpenCodeConfigInput,
  parseOpenCodeModelProviders,
} from "./opencode-config";

const SUPPORTED_PROVIDERS_TTL_MS = 10 * 60 * 1000;

let supportedProvidersCache: string[] = [];
let supportedProvidersCachedAt = 0;
const configWriter = new AtomicFileWriter({ mode: 0o644 });

export function resolveOpenCodeBinAsync(): Promise<string | null> {
  return resolveCliBinAsync("opencode", { envVarName: "OPENCODE_BIN" });
}

export function getOpenCodeConfigPath(): string {
  return path.join(os.homedir(), ".config", "opencode", "opencode.json");
}

export function getOpenCodeAuthPath(): string {
  const xdgData = process.env.XDG_DATA_HOME;
  return path.join(xdgData || path.join(os.homedir(), ".local", "share"), "opencode", "auth.json");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** null when missing or invalid; `{}` when empty. */
async function readJsonFileLoose(filePath: string): Promise<unknown> {
  try {
    return parseJsonc(await fs.promises.readFile(filePath, "utf-8"));
  } catch {
    return null;
  }
}

export async function getOpenCodeStatusSnapshot(): Promise<OpenCodeStatusSnapshot> {
  const configPath = getOpenCodeConfigPath();
  const authPath = getOpenCodeAuthPath();
  const [binPath, config, auth, configExists, authExists] = await Promise.all([
    resolveOpenCodeBinAsync(),
    readJsonFileLoose(configPath),
    readJsonFileLoose(authPath),
    pathExists(configPath),
    pathExists(authPath),
  ]);
  return buildOpenCodeStatusSnapshot({ binPath, configPath, authPath, config, auth, configExists, authExists });
}

function runOpenCode(bin: string, args: string[], options: ExecFileOptions): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFileCli(bin, args, { ...options, env: { ...process.env, PATH: buildSpawnPath() } }, (_error, stdout, stderr) => {
      resolve({ stdout, stderr });
    });
  });
}

async function getSupportedProviders(bin: string): Promise<string[]> {
  if (!bin) return [];
  if (supportedProvidersCache.length > 0 && Date.now() - supportedProvidersCachedAt < SUPPORTED_PROVIDERS_TTL_MS) {
    return supportedProvidersCache;
  }
  const { stdout } = await runOpenCode(bin, ["models"], { timeout: 12000, maxBuffer: 4 * 1024 * 1024 });
  const providers = parseOpenCodeModelProviders(stdout);
  if (providers.length > 0) {
    supportedProvidersCache = providers;
    supportedProvidersCachedAt = Date.now();
    return providers;
  }
  return supportedProvidersCache;
}

async function getVersion(bin: string): Promise<string> {
  if (!bin) return "";
  const { stdout, stderr } = await runOpenCode(bin, ["--version"], { timeout: 5000 });
  return (stdout || stderr).trim().split(/\r?\n/)[0] ?? "";
}

/** `opencode-status` */
export async function getOpenCodeStatus(): Promise<OpenCodeStatus> {
  const status = await getOpenCodeStatusSnapshot();
  const [version, supportedProviders] = await Promise.all([
    getVersion(status.binPath),
    getSupportedProviders(status.binPath),
  ]);
  return {
    ...status,
    version,
    supportedProviders: [...new Set([...supportedProviders, ...status.providers])].sort(),
  };
}

/** `opencode-get-provider-config` */
export async function getOpenCodeProviderConfig(providerId: unknown): Promise<OpenCodeProviderConfig> {
  if (typeof providerId !== "string") return { apiKey: "", baseURL: "" };
  return extractProviderConfig(await readJsonFileLoose(getOpenCodeConfigPath()), providerId);
}

/** `opencode-save-config` — rejects on invalid provider/model ids. */
export async function saveOpenCodeConfig(input: OpenCodeSaveConfigInput): Promise<OpenCodeStatusSnapshot> {
  const normalized = normalizeOpenCodeConfigInput(input);
  const configPath = getOpenCodeConfigPath();
  const nextConfig = applyOpenCodeConfigInput(await readJsonFileLoose(configPath), normalized);
  await configWriter.write(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`);
  invalidateCliInstalledCache();
  return getOpenCodeStatusSnapshot();
}
