#!/usr/bin/env node
"use strict";

const { Server } = require("@modelcontextprotocol/sdk/server");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { ListToolsRequestSchema, CallToolRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const WebSocket = require("ws");

// ---------------------------------------------------------------------------
// CLI argument: WebSocket port of the terminal-manager
// ---------------------------------------------------------------------------
const port = process.argv[2];
if (!port) {
  process.stderr.write("Usage: mcp-terminal-server.cjs <ws-port>\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// WebSocket client — connects to the terminal-manager
// ---------------------------------------------------------------------------
let ws = null;
let wsReady = false;
const pendingRequests = new Map(); // id -> { resolve, reject, timer }
let nextId = 1;

function connectWS() {
  ws = new WebSocket(`ws://127.0.0.1:${port}`);

  ws.on("open", () => {
    wsReady = true;
  });

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    const pending = pendingRequests.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRequests.delete(msg.id);
    pending.resolve(msg.result);
  });

  ws.on("error", (err) => {
    wsReady = false;
    // Reject all in-flight requests
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timer);
      pendingRequests.delete(id);
      pending.reject(new Error(`WebSocket error: ${err.message}`));
    }
  });

  ws.on("close", () => {
    wsReady = false;
  });
}

/**
 * Send a request to the terminal-manager and await its response.
 * @param {string} action
 * @param {object} params
 * @returns {Promise<any>}
 */
function callManager(action, params) {
  return new Promise((resolve, reject) => {
    if (!wsReady) {
      return reject(new Error("WebSocket not connected to terminal-manager"));
    }
    const id = nextId++;
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request ${action} timed out after 10s`));
    }, 10000);

    pendingRequests.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, action, params }));
  });
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------
const server = new Server(
  { name: "terminal-manager", version: "1.0.0" },
  {
    capabilities: { tools: {} },
  }
);

// Tool definitions
const TOOLS = [
  {
    name: "create_session",
    description:
      "Create a new persistent terminal session. Use this instead of the Bash tool when you need to: run long-lived processes (dev servers, watchers), interact with prompts that need stdin input, or keep a shell alive across multiple turns.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Unique name for the session",
        },
        command: {
          type: "string",
          description: "Command to run (defaults to the user's shell)",
        },
        cwd: {
          type: "string",
          description: "Working directory for the session",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "send_input",
    description:
      "Send text/keystrokes to a terminal session's stdin. Use \\n for Enter, \\x03 for Ctrl+C, \\x04 for Ctrl+D.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Session name",
        },
        text: {
          type: "string",
          description: "Text or control characters to send",
        },
      },
      required: ["name", "text"],
    },
  },
  {
    name: "read_output",
    description:
      "Read recent output from a terminal session's scrollback buffer.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Session name",
        },
        lines: {
          type: "number",
          description: "Number of recent lines to return (default 50)",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "kill_session",
    description: "Kill a terminal session and clean up its resources.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Session name",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "list_sessions",
    description: "List all active terminal sessions.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// Register list-tools handler
server.setRequestHandler(
  ListToolsRequestSchema,
  async () => ({ tools: TOOLS })
);

// Register call-tool handler
server.setRequestHandler(
  CallToolRequestSchema,
  async (request) => {
    const { name, arguments: args = {} } = request.params;

    let result;
    try {
      switch (name) {
        case "create_session":
          result = await callManager("create_session", {
            name: args.name,
            command: args.command,
            cwd: args.cwd,
          });
          break;

        case "send_input":
          result = await callManager("send_input", {
            name: args.name,
            text: args.text,
          });
          break;

        case "read_output":
          result = await callManager("read_output", {
            name: args.name,
            lines: args.lines !== undefined ? args.lines : 50,
          });
          break;

        case "kill_session":
          result = await callManager("kill_session", { name: args.name });
          break;

        case "list_sessions":
          result = await callManager("list_sessions", {});
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: err.message }, null, 2),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function main() {
  connectWS();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
