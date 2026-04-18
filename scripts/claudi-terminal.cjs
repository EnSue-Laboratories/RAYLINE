#!/usr/bin/env node
"use strict";

const fs = require("fs");
const WebSocket = require("ws");

function usage() {
  process.stderr.write(`RayLine terminal CLI

Usage:
  rayline-terminal list [--json]
  rayline-terminal create <name> [--cwd <path>] [--command <executable>] [--json]
  rayline-terminal send <name> <text> [--json]
  rayline-terminal read <name> [--lines <n>] [--json]
  rayline-terminal kill <name> [--json]
  rayline-terminal resize <name> <cols> <rows> [--json]

Environment:
  CLAUDI_TERMINAL_PORT         WebSocket port of RayLine terminal manager
  CLAUDI_TERMINAL_MCP_CONFIG   Optional path to mcp-terminal.json for port discovery
`);
}

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function readPortFromMcpConfig(configPath) {
  if (!configPath || !fs.existsSync(configPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const args = parsed?.mcpServers?.["terminal-sessions"]?.args;
    if (!Array.isArray(args) || args.length < 2) return null;
    const maybePort = Number(args[args.length - 1]);
    return Number.isFinite(maybePort) && maybePort > 0 ? maybePort : null;
  } catch {
    return null;
  }
}

function resolvePort() {
  const direct = Number(process.env.CLAUDI_TERMINAL_PORT);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const fromConfig = readPortFromMcpConfig(process.env.CLAUDI_TERMINAL_MCP_CONFIG);
  if (fromConfig) return fromConfig;

  return null;
}

function parseArgs(argv) {
  const positionals = [];
  const options = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    if (key === "json") {
      options.json = true;
      continue;
    }

    const value = argv[i + 1];
    if (value == null || value.startsWith("--")) {
      fail(`Missing value for --${key}`);
    }
    options[key] = value;
    i += 1;
  }

  return { positionals, options };
}

function printResult(result, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (Array.isArray(result)) {
    if (result.length === 0) {
      process.stdout.write("No terminal sessions.\n");
      return;
    }
    for (const session of result) {
      process.stdout.write(`${session.name}\t${session.cwd}\tpid=${session.pid}\n`);
    }
    return;
  }

  if (result?.lines) {
    process.stdout.write(`${result.lines.join("\n")}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function callManager(port, action, params) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const id = Date.now();
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {}
      fn(value);
    };

    const timer = setTimeout(() => {
      finish(reject, new Error(`Timed out calling ${action}`));
    }, 10000);

    ws.on("open", () => {
      ws.send(JSON.stringify({ id, action, params }));
    });

    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.id !== id) return;
      clearTimeout(timer);
      finish(resolve, msg.result);
    });

    ws.on("error", (error) => {
      clearTimeout(timer);
      finish(reject, error);
    });

    ws.on("close", () => {
      clearTimeout(timer);
      if (!settled) {
        finish(reject, new Error("Connection closed before response"));
      }
    });
  });
}

async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  const [command, ...rest] = positionals;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    usage();
    process.exit(command ? 0 : 1);
  }

  const port = resolvePort();
  if (!port) {
    fail("RayLine terminal server is not available. Missing CLAUDI_TERMINAL_PORT / CLAUDI_TERMINAL_MCP_CONFIG.");
  }

  let action;
  let params;

  switch (command) {
    case "list":
      action = "list_sessions";
      params = {};
      break;
    case "create":
      if (!rest[0]) fail("create requires <name>");
      action = "create_session";
      params = {
        name: rest[0],
        cwd: options.cwd,
        command: options.command,
      };
      break;
    case "send":
      if (!rest[0] || rest[1] == null) fail("send requires <name> <text>");
      action = "send_input";
      params = {
        name: rest[0],
        text: rest.slice(1).join(" "),
      };
      break;
    case "read":
      if (!rest[0]) fail("read requires <name>");
      action = "read_output";
      params = {
        name: rest[0],
        lines: options.lines ? Number(options.lines) : undefined,
      };
      if (params.lines !== undefined && !Number.isFinite(params.lines)) {
        fail("--lines must be a number");
      }
      break;
    case "kill":
      if (!rest[0]) fail("kill requires <name>");
      action = "kill_session";
      params = { name: rest[0] };
      break;
    case "resize":
      if (!rest[0] || !rest[1] || !rest[2]) fail("resize requires <name> <cols> <rows>");
      params = {
        name: rest[0],
        cols: Number(rest[1]),
        rows: Number(rest[2]),
      };
      if (!Number.isFinite(params.cols) || !Number.isFinite(params.rows)) {
        fail("resize expects numeric <cols> and <rows>");
      }
      action = "resize";
      break;
    default:
      fail(`Unknown command: ${command}`);
  }

  const result = await callManager(port, action, params);
  if (result && typeof result === "object" && result.error) {
    fail(result.error);
  }
  printResult(result, options.json);
}

main().catch((error) => {
  fail(error.message || String(error));
});
