/**
 * MCP "terminal-sessions" server definition: tool list and the mapping of
 * tool calls onto terminal-manager WebSocket requests. No Electron imports —
 * bundled into the standalone electron/mcp-terminal-server entry.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { TerminalWsAction } from "@shared/terminal/types";
import type { TerminalWsClient } from "./ws-client";

const SESSION_NAME = { type: "string", description: "Session name" } as const;

export const TOOLS = [
  {
    name: "create_session",
    description:
      "Create a new persistent terminal session. Use this instead of the Bash tool when you need to: run long-lived processes (dev servers, watchers), interact with prompts that need stdin input, or keep a shell alive across multiple turns. A `command` (e.g. \"npm run dev\") is run inside an interactive shell, so the session stays open after it exits.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Unique name for the session" },
        command: { type: "string", description: "Command line to run (defaults to just the user's shell)" },
        cwd: { type: "string", description: "Working directory for the session" },
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
        name: SESSION_NAME,
        text: { type: "string", description: "Text or control characters to send" },
      },
      required: ["name", "text"],
    },
  },
  {
    name: "read_output",
    description: "Read recent output from a terminal session's scrollback buffer.",
    inputSchema: {
      type: "object",
      properties: {
        name: SESSION_NAME,
        lines: { type: "number", description: "Number of recent lines to return (default 50)" },
      },
      required: ["name"],
    },
  },
  {
    name: "kill_session",
    description: "Kill a terminal session and clean up its resources.",
    inputSchema: { type: "object", properties: { name: SESSION_NAME }, required: ["name"] },
  },
  {
    name: "list_sessions",
    description: "List all active terminal sessions.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
] as const;

type ToolName = (typeof TOOLS)[number]["name"];

const TOOL_NAMES: ReadonlySet<string> = new Set(TOOLS.map((tool) => tool.name));

function isToolName(name: string): name is ToolName {
  return TOOL_NAMES.has(name);
}

/** Map a tool call onto a terminal-manager request (forwarding only known params). */
export function toManagerRequest(
  tool: ToolName,
  args: Record<string, unknown>,
): { action: TerminalWsAction; params: Record<string, unknown> } {
  switch (tool) {
    case "create_session":
      return { action: "create_session", params: { name: args.name, command: args.command, cwd: args.cwd } };
    case "send_input":
      return { action: "send_input", params: { name: args.name, text: args.text } };
    case "read_output":
      return { action: "read_output", params: { name: args.name, lines: args.lines ?? 50 } };
    case "kill_session":
      return { action: "kill_session", params: { name: args.name } };
    case "list_sessions":
      return { action: "list_sessions", params: {} };
    default: {
      const unknownTool: never = tool;
      throw new Error(`Unknown tool: ${String(unknownTool)}`);
    }
  }
}

function textResult(value: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) ?? "null" }],
    ...(isError ? { isError: true } : {}),
  };
}

function hasError(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && typeof (value as { error?: unknown }).error === "string";
}

export function createTerminalMcpServer(client: Pick<TerminalWsClient, "call">): Server {
  const server = new Server({ name: "terminal-manager", version: "1.0.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [...TOOLS] }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args = {} } = request.params;
    try {
      if (!isToolName(name)) throw new Error(`Unknown tool: ${name}`);
      const { action, params } = toManagerRequest(name, args);
      const result = await client.call(action, params);
      // Surface manager-side failures ({ error }) as tool errors, not successes.
      return textResult(result, hasError(result));
    } catch (err) {
      return textResult({ error: err instanceof Error ? err.message : String(err) }, true);
    }
  });

  return server;
}
