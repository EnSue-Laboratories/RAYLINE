/** Active OpenCode runs (both `run` and `serve` modes), finish and cancel. */

import type { ChildProcess } from "node:child_process";
import type { AgentEventSink } from "../../agent-sink";
import { createLogger } from "../common/boundary";
import { donePayload } from "../common/done";
import { errorMessage } from "../common/json";
import type { OpenCodeServerStreamState } from "./parser";
import { openCodeRequest } from "./server-client";

export const OPENCODE_PROVIDER = "opencode";
export const log = createLogger("opencode-agent-manager");

interface OpenCodeStateBase {
  readonly conversationId: string;
  readonly sink: AgentEventSink;
  child: ChildProcess | null;
  cancelled: boolean;
  done: boolean;
  sawJsonEvent: boolean;
  configCleanup: () => void;
}

export interface OpenCodeCliRunState extends OpenCodeStateBase {
  readonly mode: "run";
  sessionId: string | null;
  lastErrorMessage: string | null;
}

export interface OpenCodeServerRunState extends OpenCodeStateBase {
  readonly mode: "server";
  readonly cwd: string;
  serverUrl: string;
  promptStarted: boolean;
  abortController: AbortController | null;
  /** SSE reassembly state; `stream.sessionId` is the native session id. */
  readonly stream: OpenCodeServerStreamState;
}

export type OpenCodeRunState = OpenCodeCliRunState | OpenCodeServerRunState;

export const activeAgents = new Map<string, OpenCodeRunState>();

export function sessionIdOf(state: OpenCodeRunState): string | null {
  return state.mode === "server" ? state.stream.sessionId : state.sessionId;
}

export function isActive(state: OpenCodeRunState): boolean {
  return activeAgents.get(state.conversationId) === state;
}

export function runConfigCleanup(state: OpenCodeRunState): void {
  const cleanup = state.configCleanup;
  state.configCleanup = () => {};
  try {
    cleanup();
  } catch (err) {
    log("Failed to remove temporary OpenCode config:", errorMessage(err));
  }
}

export interface FinishOptions {
  exitCode?: number | null;
  signal?: string | null;
  error?: string;
}

/** Ends a run once: stops the server/stream, cleans up, emits error + done. */
export function finishOpenCodeRun(state: OpenCodeRunState, { exitCode = 0, signal = null, error = "" }: FinishOptions = {}): void {
  if (!isActive(state)) return;
  activeAgents.delete(state.conversationId);
  state.done = true;
  if (state.mode === "server" && state.abortController && !state.cancelled) state.abortController.abort();
  if (state.child && state.child.exitCode === null && !state.child.killed) state.child.kill("SIGTERM");
  runConfigCleanup(state);
  if (error && !state.cancelled) state.sink.error({ conversationId: state.conversationId, error });
  state.sink.done(donePayload(OPENCODE_PROVIDER, state.conversationId, exitCode, { signal, threadId: sessionIdOf(state) }));
}

export function cancelOpenCodeAgent(conversationId: string): void {
  const state = activeAgents.get(conversationId);
  if (!state || state.cancelled) return;
  log("Cancelling opencode agent:", conversationId);
  state.cancelled = true;
  if (state.mode === "server") {
    state.abortController?.abort();
    const sessionId = state.stream.sessionId;
    if (state.serverUrl && sessionId) {
      openCodeRequest(state.serverUrl, `/session/${encodeURIComponent(sessionId)}/abort`, { method: "POST", directory: state.cwd }).catch(() => {});
    }
  }
  if (state.child) state.child.kill("SIGTERM");
  else finishOpenCodeRun(state, { exitCode: null, signal: "SIGTERM" });
}

export function cancelAllOpenCode(): void {
  for (const state of [...activeAgents.values()]) {
    state.cancelled = true;
    if (state.mode === "server") state.abortController?.abort();
    if (state.child) state.child.kill("SIGTERM");
    runConfigCleanup(state);
  }
}
