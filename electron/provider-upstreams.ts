/**
 * Provider upstreams: point the Claude / Codex CLIs at a user-configured base
 * URL + API key. Public entry; implementation lives in providers/upstreams/.
 */

import type { ProviderUpstreamConfig } from "@shared/providers/types";
import { patchClaudeConfigWin32, patchClaudeSettingsWin32 } from "./providers/upstreams/claude-settings-win32";
import {
  buildCodexProviderArgs,
  cleanCodexProviderKey,
  normalizeOpenAIBaseURL,
  normalizeProviderUpstreamConfig,
  upstreamModels,
} from "./providers/upstreams/config";
import { startCodexResponsesBridge, type CodexResponsesBridge } from "./providers/upstreams/responses-bridge";

export {
  buildClaudeUpstreamEnv,
  buildCodexUpstreamEnv,
  cleanCodexProviderKey,
  normalizeOpenAIBaseURL,
  normalizeProviderUpstreamConfig,
  summarizeProviderUpstream,
  type ProviderUpstreamSummary,
} from "./providers/upstreams/config";
export { patchClaudeConfigWin32, patchClaudeSettingsWin32 } from "./providers/upstreams/claude-settings-win32";
export { startCodexResponsesBridge, type CodexResponsesBridge } from "./providers/upstreams/responses-bridge";

const IS_WINDOWS = process.platform === "win32";

export interface CodexUpstreamRuntime extends ProviderUpstreamConfig {
  targetBaseURL: string;
  providerKey: string;
  /** Local Responses bridge (null for remote runs). */
  bridge: CodexResponsesBridge | null;
  /** `-c model_provider…` overrides to append to the codex args. */
  args: string[];
}

export interface PrepareCodexUpstreamOptions {
  /** Start the local Responses↔Chat bridge (false for SSH-remote runs). */
  bridge?: boolean;
}

/**
 * Resolves a Codex upstream: starts the local bridge when requested and
 * returns the `-c` overrides plus the bridge handle. Null when no upstream
 * base URL is configured.
 */
export async function prepareCodexUpstream(
  input: unknown,
  model: string | null | undefined,
  options: PrepareCodexUpstreamOptions = {},
): Promise<CodexUpstreamRuntime | null> {
  const config = normalizeProviderUpstreamConfig(input, "codex");
  if (!config?.baseURL) return null;
  const bridge = options.bridge === false ? null : await startCodexResponsesBridge(config);
  const baseURL = bridge?.baseURL || normalizeOpenAIBaseURL(config.baseURL);
  return {
    ...config,
    baseURL,
    targetBaseURL: bridge?.targetBaseURL || normalizeOpenAIBaseURL(config.baseURL),
    providerKey: cleanCodexProviderKey(baseURL),
    bridge,
    args: buildCodexProviderArgs(baseURL, upstreamModels(config, model)),
  };
}

export interface PrepareClaudeUpstreamOptions {
  /** Windows: also write the upstream into ~/.claude/settings.json (local runs only). */
  patchLocalSettings?: boolean;
}

/**
 * Claude reads its upstream from env (`buildClaudeUpstreamEnv`); on Windows
 * the settings file is patched too. Returns the normalized config, or null
 * when no upstream base URL is configured.
 */
export function prepareClaudeUpstream(
  input: unknown,
  model: string | null | undefined,
  options: PrepareClaudeUpstreamOptions = {},
): ProviderUpstreamConfig | null {
  const config = normalizeProviderUpstreamConfig(input, "claude");
  if (!config?.baseURL) return null;
  if (IS_WINDOWS && options.patchLocalSettings !== false) {
    patchClaudeSettingsWin32({ baseURL: config.baseURL, apiKey: config.apiKey }, model);
    patchClaudeConfigWin32();
  }
  return config;
}
