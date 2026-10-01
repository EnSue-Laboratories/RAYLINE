#!/usr/bin/env node
/**
 * `rayline-terminal` CLI: drives RayLine's terminal sessions over the
 * terminal manager's local WebSocket. Bundled by scripts/build-electron to
 * dist-electron/scripts/claudi-terminal.cjs and handed to Codex / OpenCode.
 */

import { existsSync, readFileSync } from "node:fs";
import type { TerminalWsAction } from "@shared/terminal/types";
import { TerminalWsClient } from "../electron/services/terminal/ws-client";

function usage(): void {
  process.stderr.write(`RayLine terminal CLI

Usage:
  rayline-terminal list [--json]
  rayline-terminal create <name> [--cwd <path>] [--command <command line>] [--json]
  rayline-terminal send <name> <text> [--json]
  rayline-terminal read <name> [--lines <n>] [--json]
  rayline-terminal kill <name> [--json]
  rayline-terminal resize <name> <cols> <rows> [--json]

Environment:
  CLAUDI_TERMINAL_PORT         WebSocket port of RayLine terminal manager
  CLAUDI_TERMINAL_MCP_CONFIG   Optional path to mcp-terminal.json for port discovery
`);
}

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPortFromMcpConfig(configPath: string | undefined): number | null {
  if (!configPath || !existsSync(configPath)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
    const servers = isRecord(parsed) && isRecord(parsed.mcpServers) ? parsed.mcpServers : null;
    const terminal = servers && isRecord(servers["terminal-sessions"]) ? servers["terminal-sessions"] : null;
    const args: unknown = terminal?.args;
    if (!Array.isArray(args) || args.length < 2) return null;
    const maybePort = Number(args[args.length - 1]);
    return Number.isFinite(maybePort) && maybePort > 0 ? maybePort : null;
  } catch {
    return null;
  }
}

function resolvePort(): number | null {
  const direct = Number(process.env.CLAUDI_TERMINAL_PORT);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return readPortFromMcpConfig(process.env.CLAUDI_TERMINAL_MCP_CONFIG);
}

interface ParsedArgs {
  positionals: string[];
  options: { json: boolean; values: Map<string, string> };
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const values = new Map<string, string>();
  let json = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === "json") {
      json = true;
      continue;
    }
    const value = argv[i + 1];
    if (value == null || value.startsWith("--")) fail(`Missing value for --${key}`);
    values.set(key, value);
    i += 1;
  }
  return { positionals, options: { json, values } };
}

function printResult(result: unknown, asJson: boolean): void {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (Array.isArray(result)) {
    if (result.length === 0) {
      process.stdout.write("No terminal sessions.\n");
      return;
    }
    for (const session of result as unknown[]) {
      const s = isRecord(session) ? session : {};
      process.stdout.write(`${String(s.name)}\t${String(s.cwd)}\tpid=${String(s.pid)}\n`);
    }
    return;
  }
  if (isRecord(result) && Array.isArray(result.lines)) {
    process.stdout.write(`${result.lines.map(String).join("\n")}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

interface Request {
  action: TerminalWsAction;
  params: Record<string, unknown>;
}

function buildRequest(command: string, rest: readonly string[], values: ReadonlyMap<string, string>): Request {
  const [name, ...more] = rest;
  switch (command) {
    case "list":
      return { action: "list_sessions", params: {} };
    case "create":
      if (!name) fail("create requires <name>");
      return { action: "create_session", params: { name, cwd: values.get("cwd"), command: values.get("command") } };
    case "send":
      if (!name || more[0] == null) fail("send requires <name> <text>");
      return { action: "send_input", params: { name, text: more.join(" ") } };
    case "read": {
      if (!name) fail("read requires <name>");
      const rawLines = values.get("lines");
      const lines = rawLines ? Number(rawLines) : undefined;
      if (lines !== undefined && !Number.isFinite(lines)) fail("--lines must be a number");
      return { action: "read_output", params: { name, lines } };
    }
    case "kill":
      if (!name) fail("kill requires <name>");
      return { action: "kill_session", params: { name } };
    case "resize": {
      if (!name || !more[0] || !more[1]) fail("resize requires <name> <cols> <rows>");
      const cols = Number(more[0]);
      const rows = Number(more[1]);
      if (!Number.isFinite(cols) || !Number.isFinite(rows)) fail("resize expects numeric <cols> and <rows>");
      return { action: "resize", params: { name, cols, rows } };
    }
    default:
      return fail(`Unknown command: ${command}`);
  }
}

async function main(): Promise<void> {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  const [command, ...rest] = positionals;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    usage();
    process.exit(command ? 0 : 1);
  }

  const port = resolvePort();
  if (!port) fail("RayLine terminal server is not available. Missing CLAUDI_TERMINAL_PORT / CLAUDI_TERMINAL_MCP_CONFIG.");

  const { action, params } = buildRequest(command, rest, options.values);
  const client = new TerminalWsClient(port);
  try {
    const result = await client.call(action, params);
    if (isRecord(result) && typeof result.error === "string" && result.error) fail(result.error);
    printResult(result, options.json);
  } finally {
    client.close();
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
