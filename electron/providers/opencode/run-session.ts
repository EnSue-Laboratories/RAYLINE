/**
 * OpenCode entry point: validates the binary / cwd, then either streams
 * `opencode run --format json` (default) or switches to serve mode when
 * thinking is enabled.
 */

import type { ChildProcess } from "node:child_process";
import type { AgentStartRequest } from "@shared/chat/types";
import type { AgentEventSink } from "../../agent-sink";
import { spawnCli } from "../../cli-bin-resolver";
import { buildAgentCliPrompt } from "../common/agent-prompt";
import { donePayload, emitLaunchFailure } from "../common/done";
import { writeImagesToTemp } from "../common/images";
import { errorMessage } from "../common/json";
import { LineSplitter } from "../common/line-splitter";
import { createCliBinResolver, isDirectory } from "../common/runtime-env";
import { buildOpenCodeRunArgs, shouldEnableThinking } from "./config";
import { extractOpenCodeErrorMessage, extractOpenCodeSessionId, parseOpenCodeRunLine } from "./parser";
import { OPENCODE_PROVIDER, activeAgents, cancelOpenCodeAgent, isActive, log, runConfigCleanup, type OpenCodeCliRunState } from "./registry";
import { createOpenCodeRuntimeEnvAsync } from "./runtime-env";
import { startOpenCodeServerAgent } from "./server-session";

export const resolveOpenCodeBin = createCliBinResolver("opencode", "OPENCODE_BIN");

const STDERR_LIMIT = 256 * 1024;

function shouldEmitStderr(stderr: string, exitCode: number | null, signal: string | null, sawJsonEvent: boolean): boolean {
  if (!stderr.trim()) return false;
  if (exitCode === 0 && !signal && sawJsonEvent) return false;
  return exitCode !== 0 || Boolean(signal) || !sawJsonEvent;
}

function attachRunProcess(state: OpenCodeCliRunState, child: ChildProcess): void {
  const { conversationId, sink } = state;
  const stdoutLines = new LineSplitter();
  let stderr = "";

  const handleLine = (line: string): void => {
    const parsed = parseOpenCodeRunLine(line);
    if (!parsed) return;
    switch (parsed.kind) {
      case "ignored":
        log("Ignored event type:", parsed.type);
        return;
      case "event": {
        state.sawJsonEvent = true;
        const nextSessionId = extractOpenCodeSessionId(parsed.event);
        if (nextSessionId) state.sessionId = nextSessionId;
        if (parsed.event.type === "error") state.lastErrorMessage = extractOpenCodeErrorMessage(parsed.event) ?? state.lastErrorMessage;
        log("Parsed event type:", parsed.event.type);
        sink.stream({ conversationId, event: parsed.event });
        return;
      }
      case "stdout":
        sink.stream({ conversationId, event: parsed.event });
        return;
      default: {
        const exhaustive: never = parsed;
        return exhaustive;
      }
    }
  };

  child.stdout?.on("data", (chunk: Buffer) => {
    if (!isActive(state)) return;
    for (const line of stdoutLines.push(chunk)) handleLine(line);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    if (!isActive(state) && !state.cancelled) return;
    const text = chunk.toString();
    log("stderr:", text);
    stderr = (stderr + text).slice(-STDERR_LIMIT);
  });

  child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
    const isCurrentState = isActive(state);
    log("Process closed", { conversationId, exitCode, signal, cancelled: state.cancelled, current: isCurrentState });
    if (!isCurrentState) return;
    const rest = stdoutLines.flush();
    if (rest.trim()) handleLine(rest);
    activeAgents.delete(conversationId);
    runConfigCleanup(state);
    if (!state.cancelled && (state.lastErrorMessage || shouldEmitStderr(stderr, exitCode, signal, state.sawJsonEvent))) {
      const error = state.lastErrorMessage || stderr.trim();
      if (error) sink.error({ conversationId, error });
    }
    sink.done(donePayload(OPENCODE_PROVIDER, conversationId, exitCode, { signal, threadId: state.sessionId }));
  });

  child.on("error", (err) => {
    const isCurrentState = isActive(state);
    log("Spawn error:", err.message);
    if (isCurrentState) activeAgents.delete(conversationId);
    runConfigCleanup(state);
    sink.error({ conversationId, error: err.message });
    if (isCurrentState) sink.done(donePayload(OPENCODE_PROVIDER, conversationId, -1, { threadId: state.sessionId }));
  });
}

export async function startOpenCodeAgent(request: AgentStartRequest, sink: AgentEventSink): Promise<ChildProcess | null> {
  const { conversationId } = request;
  cancelOpenCodeAgent(conversationId);

  const openCodeBin = resolveOpenCodeBin();
  if (!openCodeBin) {
    log("Unable to locate the OpenCode CLI binary");
    emitLaunchFailure(sink, OPENCODE_PROVIDER, conversationId, "Unable to locate the OpenCode CLI binary");
    return null;
  }

  let launchCwd = process.cwd();
  if (request.cwd && (await isDirectory(request.cwd))) {
    launchCwd = request.cwd;
  } else if (request.cwd) {
    log(`Invalid working directory: ${request.cwd}`);
    emitLaunchFailure(sink, OPENCODE_PROVIDER, conversationId, `Invalid working directory: ${request.cwd}`);
    return null;
  }

  if (shouldEnableThinking(request.model, request.thinking)) {
    startOpenCodeServerAgent(request, sink, openCodeBin, launchCwd);
    return null;
  }

  const nativeSessionId = request.resumeSessionId || request.sessionId || null;
  const state: OpenCodeCliRunState = {
    mode: "run",
    conversationId,
    sink,
    child: null,
    cancelled: false,
    done: false,
    sawJsonEvent: false,
    configCleanup: () => {},
    sessionId: nativeSessionId,
    lastErrorMessage: null,
  };
  activeAgents.set(conversationId, state);

  try {
    const imagePaths = await writeImagesToTemp(request.images, "rayline-opencode-img");
    const runtime = await createOpenCodeRuntimeEnvAsync(request.openCodeConfig, request.model);
    state.configCleanup = runtime.cleanup;
    if (state.cancelled || !isActive(state)) {
      runConfigCleanup(state);
      return null;
    }

    const prompt = buildAgentCliPrompt(request.prompt, request.files);
    const filePaths = [...(request.files ?? []).map((f) => f.path).filter((p): p is string => Boolean(p)), ...imagePaths];
    const args = buildOpenCodeRunArgs({ cwd: launchCwd, sessionId: nativeSessionId, forkSession: request.forkSession, model: request.model, filePaths, prompt });

    log("Starting opencode agent:", { conversationId, model: request.model, cwd: launchCwd, sessionId: nativeSessionId });
    log("Full args:", args.slice(0, -1).join(" "));

    const child = spawnCli(openCodeBin, args, { cwd: launchCwd, env: runtime.env, stdio: ["ignore", "pipe", "pipe"] });
    state.child = child;
    log("Spawned PID:", child.pid);
    attachRunProcess(state, child);
    return child;
  } catch (err) {
    if (!isActive(state)) return null;
    activeAgents.delete(conversationId);
    runConfigCleanup(state);
    emitLaunchFailure(sink, OPENCODE_PROVIDER, conversationId, errorMessage(err));
    return null;
  }
}
