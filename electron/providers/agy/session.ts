/**
 * Antigravity CLI run lifecycle (ported from PR #230): system-proxy env,
 * 45 s startup watchdog (no structured event yet → timed out), SIGKILL 3 s
 * after an unanswered cancel, and a failed exit whenever no `result` arrived.
 */

import type { ChildProcess } from "node:child_process";
import type { AgentStartRequest } from "@shared/chat/types";
import type { AgentEventSink } from "../../agent-sink";
import { spawnCli } from "../../cli-bin-resolver";
import { createLogger } from "../../logger";
import { donePayload, emitLaunchFailure } from "../common/done";
import { errorMessage } from "../common/json";
import { LineSplitter } from "../common/line-splitter";
import { baseCliEnv, createCliBinResolver, isDirectory, terminalEnv } from "../common/runtime-env";
import { withSystemProxy } from "../runtime-env";
import { buildAgyArgs } from "./args";
import { createAgyStreamState, parseAgyLine, type AgyStreamState } from "./parser";

const PROVIDER = "agy";
const STARTUP_TIMEOUT_MS = 45_000;
const KILL_GRACE_MS = 3000;
const STDERR_TAIL = 16_000;
const log = createLogger("agy-agent-manager");

export const resolveAgyBin = createCliBinResolver("agy", "AGY_BIN");

interface AgyRunState {
  readonly conversationId: string;
  readonly sink: AgentEventSink;
  readonly child: ChildProcess;
  readonly stream: AgyStreamState;
  cancelled: boolean;
  settled: boolean;
  sawEvent: boolean;
  startupTimer: NodeJS.Timeout | null;
  killTimer: NodeJS.Timeout | null;
}

const activeAgents = new Map<string, AgyRunState>();

function clearTimers(state: AgyRunState): void {
  if (state.startupTimer) clearTimeout(state.startupTimer);
  if (state.killTimer) clearTimeout(state.killTimer);
  state.startupTimer = null;
  state.killTimer = null;
}

/** `agent-done` exit code: a failed run never reports 0. */
export function agyExitCode(failed: boolean, exitCode: number | null): number | null {
  return failed ? exitCode || 1 : exitCode;
}

function attach(state: AgyRunState): void {
  const { conversationId, sink, child, stream } = state;
  const stdoutLines = new LineSplitter();
  let stderr = "";
  const isCurrent = (): boolean => activeAgents.get(conversationId) === state;

  const handleLine = (line: string): void => {
    if (!isCurrent()) return;
    const parsed = parseAgyLine(line, stream);
    if (!parsed) return;
    if (parsed.isEvent && !state.sawEvent) {
      state.sawEvent = true;
      if (state.startupTimer) clearTimeout(state.startupTimer);
      state.startupTimer = null;
    }
    for (const event of parsed.events) sink.stream({ conversationId, event });
  };

  state.startupTimer = setTimeout(() => {
    if (state.sawEvent || state.cancelled) return;
    stream.failed = true;
    sink.error({ conversationId, error: "AGY startup timed out. Check its login and network connection in the terminal." });
    child.kill("SIGTERM");
  }, STARTUP_TIMEOUT_MS);
  state.startupTimer.unref();

  child.stdout?.on("data", (chunk: Buffer) => {
    for (const line of stdoutLines.push(chunk)) handleLine(line);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL);
  });

  child.on("error", (err) => {
    clearTimers(state);
    if (state.settled || !isCurrent()) return;
    state.settled = true;
    activeAgents.delete(conversationId);
    sink.error({ conversationId, error: err.message });
    sink.done(donePayload(PROVIDER, conversationId, -1));
  });

  child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
    clearTimers(state);
    if (state.settled || !isCurrent()) return;
    const rest = stdoutLines.flush();
    if (rest.trim()) handleLine(rest);
    state.settled = true;
    activeAgents.delete(conversationId);
    if (!state.cancelled && !stream.failed && (exitCode !== 0 || !stream.resultSeen)) {
      stream.failed = true;
      sink.error({ conversationId, error: stderr.trim() || "AGY exited without a completed response." });
    }
    sink.done(donePayload(PROVIDER, conversationId, agyExitCode(stream.failed, exitCode), { signal, threadId: stream.sessionId }));
  });
}

export async function startAgyAgent(request: AgentStartRequest, sink: AgentEventSink): Promise<ChildProcess | null> {
  const { conversationId } = request;
  cancelAgyAgent(conversationId);
  try {
    const bin = resolveAgyBin();
    if (!bin) throw new Error("Unable to locate Antigravity CLI (agy).");
    const cwd = request.cwd || process.cwd();
    if (!(await isDirectory(cwd))) throw new Error(`Invalid working directory: ${cwd}`);
    const args = buildAgyArgs(request);
    const env = await withSystemProxy(baseCliEnv({ NO_COLOR: "1", ...terminalEnv() }));
    log("Starting agy agent:", { conversationId, model: request.model, cwd, conversation: request.resumeSessionId || request.sessionId || null });

    const child = spawnCli(bin, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    const state: AgyRunState = {
      conversationId,
      sink,
      child,
      stream: createAgyStreamState(),
      cancelled: false,
      settled: false,
      sawEvent: false,
      startupTimer: null,
      killTimer: null,
    };
    activeAgents.set(conversationId, state);
    attach(state);
    return child;
  } catch (err) {
    log("AGY launch failed:", errorMessage(err));
    emitLaunchFailure(sink, PROVIDER, conversationId, errorMessage(err));
    return null;
  }
}

export function cancelAgyAgent(conversationId: string): void {
  const state = activeAgents.get(conversationId);
  if (!state || state.cancelled) return;
  state.cancelled = true;
  state.child.kill("SIGTERM");
  state.killTimer = setTimeout(() => {
    if (state.child.exitCode === null && state.child.signalCode === null) state.child.kill("SIGKILL");
  }, KILL_GRACE_MS);
  state.killTimer.unref();
}

export function cancelAllAgy(): void {
  for (const conversationId of [...activeAgents.keys()]) cancelAgyAgent(conversationId);
}
