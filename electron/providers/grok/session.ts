/**
 * Grok Build CLI run lifecycle (ported from PR #230). A CLI failure is shown
 * once: when the stream already carried a structured `error` event, the
 * duplicate stderr text is not re-sent as `agent-error`.
 */

import type { ChildProcess } from "node:child_process";
import type { AgentStartRequest } from "@shared/chat/types";
import type { AgentEventSink } from "../../agent-sink";
import { buildAgentCliPrompt } from "../common/agent-prompt";
import { createLogger, spawnCli } from "../common/boundary";
import { donePayload, emitLaunchFailure } from "../common/done";
import { errorMessage } from "../common/json";
import { LineSplitter } from "../common/line-splitter";
import { baseCliEnv, createCliBinResolver, isDirectory, terminalEnv } from "../common/runtime-env";
import { buildGrokArgs } from "./args";
import { createGrokStreamState, parseGrokLine, type GrokStreamState } from "./parser";

const PROVIDER = "grok";
const STDERR_LIMIT = 256 * 1024;
const log = createLogger("grok-agent-manager");

export const resolveGrokBin = createCliBinResolver("grok", "GROK_BIN");

interface GrokRunState {
  readonly conversationId: string;
  readonly sink: AgentEventSink;
  readonly child: ChildProcess;
  readonly stream: GrokStreamState;
  cancelled: boolean;
  sawJsonEvent: boolean;
  lastErrorMessage: string | null;
  /** A structured error already reached the renderer. */
  emittedStreamError: boolean;
}

const activeAgents = new Map<string, GrokRunState>();

function shouldEmitStderr(stderr: string, exitCode: number | null, signal: string | null, sawJsonEvent: boolean): boolean {
  if (!stderr.trim()) return false;
  if (exitCode === 0 && !signal && sawJsonEvent) return false;
  return exitCode !== 0 || Boolean(signal) || !sawJsonEvent;
}

function attach(state: GrokRunState): void {
  const { conversationId, sink, child } = state;
  const stdoutLines = new LineSplitter();
  let stderr = "";

  const handleLine = (line: string): void => {
    const parsed = parseGrokLine(line, state.stream);
    if (!parsed) return;
    if (parsed.kind === "text") {
      sink.stream({ conversationId, event: parsed.event });
      return;
    }
    state.sawJsonEvent = true;
    for (const event of parsed.events) {
      if (event.type === "error") {
        state.lastErrorMessage = event.message ?? null;
        state.emittedStreamError = true;
      }
      sink.stream({ conversationId, event });
    }
  };

  child.stdout?.on("data", (chunk: Buffer) => {
    if (activeAgents.get(conversationId) !== state) return;
    for (const line of stdoutLines.push(chunk)) handleLine(line);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    if (activeAgents.get(conversationId) !== state && !state.cancelled) return;
    const text = chunk.toString();
    log("stderr:", text);
    stderr = (stderr + text).slice(-STDERR_LIMIT);
  });

  child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
    const isCurrentState = activeAgents.get(conversationId) === state;
    log("Process closed", { conversationId, exitCode, signal, cancelled: state.cancelled, current: isCurrentState });
    if (!isCurrentState) return;
    const rest = stdoutLines.flush();
    if (rest.trim()) handleLine(rest);
    activeAgents.delete(conversationId);

    const terminalError =
      !state.cancelled && !state.emittedStreamError && (state.lastErrorMessage || shouldEmitStderr(stderr, exitCode, signal, state.sawJsonEvent));
    if (terminalError) {
      const error = state.lastErrorMessage || stderr.trim();
      if (error) sink.error({ conversationId, error });
    }
    sink.done(donePayload(PROVIDER, conversationId, exitCode, { signal, threadId: state.stream.sessionId }));
  });

  child.on("error", (err) => {
    const isCurrentState = activeAgents.get(conversationId) === state;
    log("Spawn error:", err.message);
    if (isCurrentState) activeAgents.delete(conversationId);
    sink.error({ conversationId, error: err.message });
    if (isCurrentState) sink.done(donePayload(PROVIDER, conversationId, -1, { threadId: state.stream.sessionId }));
  });
}

export async function startGrokAgent(request: AgentStartRequest, sink: AgentEventSink): Promise<ChildProcess | null> {
  const { conversationId } = request;
  cancelGrokAgent(conversationId);

  const grokBin = resolveGrokBin();
  if (!grokBin) {
    log("Unable to locate the Grok CLI binary");
    emitLaunchFailure(sink, PROVIDER, conversationId, "Unable to locate the Grok CLI binary");
    return null;
  }

  let launchCwd = process.cwd();
  if (request.cwd && (await isDirectory(request.cwd))) {
    launchCwd = request.cwd;
  } else if (request.cwd) {
    log(`Invalid working directory: ${request.cwd}`);
    emitLaunchFailure(sink, PROVIDER, conversationId, `Invalid working directory: ${request.cwd}`);
    return null;
  }

  const nativeSessionId = request.resumeSessionId || request.sessionId || null;
  const args = buildGrokArgs({
    cwd: launchCwd,
    model: request.model,
    sessionId: request.sessionId,
    resumeSessionId: request.resumeSessionId,
    forkSession: request.forkSession,
    grokContinue: request.grokContinue,
    prompt: buildAgentCliPrompt(request.prompt, request.files, request.projectContext),
  });
  log("Starting grok agent:", {
    conversationId,
    model: request.model,
    cwd: launchCwd,
    sessionId: nativeSessionId,
    continuePrevious: Boolean(!nativeSessionId && request.grokContinue),
  });

  let child: ChildProcess;
  try {
    child = spawnCli(grokBin, args, {
      cwd: launchCwd,
      env: baseCliEnv({ NO_COLOR: "1", RAYLINE_CLIENT: "rayline", ...terminalEnv() }),
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    emitLaunchFailure(sink, PROVIDER, conversationId, errorMessage(err));
    return null;
  }
  const state: GrokRunState = {
    conversationId,
    sink,
    child,
    stream: createGrokStreamState(nativeSessionId),
    cancelled: false,
    sawJsonEvent: false,
    lastErrorMessage: null,
    emittedStreamError: false,
  };
  activeAgents.set(conversationId, state);
  log("Spawned PID:", child.pid);
  attach(state);
  return child;
}

export function cancelGrokAgent(conversationId: string): void {
  const state = activeAgents.get(conversationId);
  if (!state || state.cancelled) return;
  log("Cancelling grok agent:", conversationId);
  state.cancelled = true;
  state.child.kill("SIGTERM");
}

export function cancelAllGrok(): void {
  for (const state of activeAgents.values()) {
    state.cancelled = true;
    state.child.kill("SIGTERM");
  }
  activeAgents.clear();
}
