/**
 * Local WebSocket protocol between the terminal manager and its clients (the
 * MCP terminal server and the `claudi-terminal` CLI). Pure: validation and
 * dispatch only, no sockets.
 */

import type {
  TerminalCreateOptions,
  TerminalCreateResult,
  TerminalOpResult,
  TerminalReadResult,
  TerminalSessionInfo,
  TerminalWsAction,
  TerminalWsResponse,
} from "@shared/terminal/types";

export interface TerminalSessionApi {
  readonly createSession: (opts: Partial<TerminalCreateOptions>) => TerminalCreateResult;
  readonly sendInput: (name: string, text: string) => TerminalOpResult;
  readonly readOutput: (name: string, lines?: number) => TerminalReadResult;
  readonly killSession: (name: string) => TerminalOpResult;
  readonly listSessions: () => TerminalSessionInfo[];
  readonly resizeSession: (name: string, cols: number, rows: number) => TerminalOpResult;
}

type Params = Record<string, unknown>;
type RequestId = TerminalWsResponse["id"];

function isRecord(value: unknown): value is Params {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(params: Params, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

function num(params: Params, key: string): number | undefined {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireName(params: Params): string | { error: string } {
  return str(params, "name") ?? { error: "name must be a string" };
}

export function dispatchTerminalAction(api: TerminalSessionApi, action: TerminalWsAction, params: Params): unknown {
  switch (action) {
    case "create_session": {
      const opts: Partial<TerminalCreateOptions> = {};
      const name = str(params, "name");
      const command = str(params, "command");
      const cwd = str(params, "cwd");
      if (name !== undefined) opts.name = name;
      if (command !== undefined) opts.command = command;
      if (cwd !== undefined) opts.cwd = cwd;
      const reveal = params.reveal;
      if (typeof reveal === "boolean" || reveal === "auto") opts.reveal = reveal;
      return api.createSession(opts);
    }
    case "send_input": {
      const name = requireName(params);
      if (typeof name !== "string") return name;
      const text = str(params, "text");
      return text === undefined ? { error: "text must be a string" } : api.sendInput(name, text);
    }
    case "read_output": {
      const name = requireName(params);
      return typeof name === "string" ? api.readOutput(name, num(params, "lines")) : name;
    }
    case "kill_session": {
      const name = requireName(params);
      return typeof name === "string" ? api.killSession(name) : name;
    }
    case "list_sessions":
      return api.listSessions();
    case "resize": {
      const name = requireName(params);
      if (typeof name !== "string") return name;
      const cols = num(params, "cols");
      const rows = num(params, "rows");
      if (cols === undefined || rows === undefined) return { error: "cols and rows must be numbers" };
      return api.resizeSession(name, cols, rows);
    }
    default: {
      const unknownAction: never = action;
      return { error: `Unknown action: ${String(unknownAction)}` };
    }
  }
}

const ACTIONS: ReadonlySet<string> = new Set<TerminalWsAction>([
  "create_session",
  "send_input",
  "read_output",
  "kill_session",
  "list_sessions",
  "resize",
]);

function isAction(value: string): value is TerminalWsAction {
  return ACTIONS.has(value);
}

function requestId(value: unknown): RequestId {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

/** Handle one raw WS message; returns the response to send back. */
export function handleTerminalWsMessage(api: TerminalSessionApi, raw: string): TerminalWsResponse {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return { error: "Invalid JSON" };
  }
  if (!isRecord(msg)) return { error: "Invalid request" };
  const id = requestId(msg.id);
  const action = msg.action;
  if (typeof action !== "string") return { id, error: "action must be a string" };
  if (!isAction(action)) return { id, result: { error: `Unknown action: ${action}` } };
  try {
    return { id, result: dispatchTerminalAction(api, action, isRecord(msg.params) ? msg.params : {}) };
  } catch (err) {
    return { id, result: { error: err instanceof Error ? err.message : String(err) } };
  }
}
