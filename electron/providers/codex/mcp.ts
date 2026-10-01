/**
 * Forwards RayLine's MCP config (the terminal-sessions server) to Codex as
 * `-c mcp_servers."<name>".…` overrides. Parsing / serialization is pure;
 * `readConfiguredMcpServers` does the (async) file read.
 */

import { promises as fsp } from "node:fs";
import { isRecord, safeJsonParse } from "../common/json";

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  enabled?: boolean;
}

export type McpServerEntry = readonly [name: string, config: McpServerConfig];

function toServerConfig(value: unknown): McpServerConfig {
  if (!isRecord(value)) return {};
  const config: McpServerConfig = {};
  if (typeof value.command === "string") config.command = value.command;
  if (Array.isArray(value.args)) config.args = value.args.map((arg) => String(arg));
  if (isRecord(value.env)) {
    config.env = Object.fromEntries(Object.entries(value.env).map(([key, v]) => [key, String(v)]));
  }
  if (typeof value.cwd === "string") config.cwd = value.cwd;
  if (typeof value.enabled === "boolean") config.enabled = value.enabled;
  return config;
}

/** `{ mcpServers: { name: {...} } }` → entries (invalid JSON → []). */
export function parseMcpServers(json: unknown): McpServerEntry[] {
  if (!isRecord(json) || !isRecord(json.mcpServers)) return [];
  return Object.entries(json.mcpServers).map(([name, config]) => [name, toServerConfig(config)] as const);
}

export function hasTerminalSessionsServer(servers: readonly McpServerEntry[]): boolean {
  return servers.some(([name, config]) => name === "terminal-sessions" && Boolean(config.command) && config.enabled !== false);
}

/**
 * TOML inline table for `env`. A JSON object is not valid TOML
 * (`{"A":"1"}` has no `=`), so Codex used to reject / misread it — the
 * packaged-app fix from PR #230 (`{ "KEY" = "value" }`).
 */
export function tomlInlineTable(values: Readonly<Record<string, string>>): string {
  const entries = Object.entries(values).map(([key, value]) => `${JSON.stringify(key)} = ${JSON.stringify(value)}`);
  return `{${entries.join(", ")}}`;
}

/** `-c` override pairs for every server with a command. */
export function buildCodexMcpOverrides(servers: readonly McpServerEntry[]): string[] {
  const args: string[] = [];
  for (const [name, config] of servers) {
    if (!config.command) continue;
    const prefix = `mcp_servers.${JSON.stringify(name)}`;
    args.push("-c", `${prefix}.command=${JSON.stringify(config.command)}`);
    if (config.args) args.push("-c", `${prefix}.args=${JSON.stringify(config.args)}`);
    if (config.env) args.push("-c", `${prefix}.env=${tomlInlineTable(config.env)}`);
    if (config.cwd) args.push("-c", `${prefix}.cwd=${JSON.stringify(config.cwd)}`);
    args.push("-c", `${prefix}.enabled=${config.enabled !== false}`);
  }
  return args;
}

export async function readConfiguredMcpServers(configPath: string | null): Promise<McpServerEntry[]> {
  if (!configPath) return [];
  try {
    return parseMcpServers(safeJsonParse(await fsp.readFile(configPath, "utf-8")));
  } catch {
    return [];
  }
}
