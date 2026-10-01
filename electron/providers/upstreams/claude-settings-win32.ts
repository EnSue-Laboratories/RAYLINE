/**
 * Windows-only: Claude Code on Windows ignores ANTHROPIC_* env passed to the
 * spawned process in some installs, so a Claude upstream is also written to
 * ~/.claude/settings.json (and onboarding is marked complete in
 * ~/.claude.json). No-ops on other platforms.
 *
 * Synchronous on purpose: called from the `sync-provider-upstreams` handler
 * and right before spawning on Windows, where ordering matters.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isRecord, safeJsonParse } from "../common/json";

const IS_WINDOWS = process.platform === "win32";

export interface ClaudeUpstreamPatch {
  baseURL?: string;
  apiKey?: string;
}

function readJsonObject(filePath: string, stripLineComments: boolean): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const cleaned = stripLineComments ? content.replace(/\/\/.*$/gm, "") : content;
    if (!cleaned.trim()) return null;
    const parsed = safeJsonParse(cleaned);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function patchClaudeSettingsWin32(config: ClaudeUpstreamPatch, model?: string | null): void {
  if (!IS_WINDOWS) return;
  try {
    const claudeDir = path.join(os.homedir(), ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    const settingsPath = path.join(claudeDir, "settings.json");

    const settings = readJsonObject(settingsPath, true) ?? {};
    const env: Record<string, unknown> = isRecord(settings.env) ? { ...settings.env } : {};
    if (config.baseURL) env.ANTHROPIC_BASE_URL = config.baseURL;
    if (config.apiKey) env.ANTHROPIC_AUTH_TOKEN = config.apiKey;
    if (model) {
      env.ANTHROPIC_MODEL = model;
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = model;
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;
    }
    settings.env = env;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  } catch (err) {
    console.warn("Failed to patch ~/.claude/settings.json:", err);
  }
}

export function patchClaudeConfigWin32(): void {
  if (!IS_WINDOWS) return;
  try {
    const configPath = path.join(os.homedir(), ".claude.json");
    const config = readJsonObject(configPath, false) ?? {};
    config.hasCompletedOnboarding = true;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  } catch (err) {
    console.warn("Failed to patch .claude.json:", err);
  }
}
