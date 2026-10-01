/**
 * Claude Code run lifecycle: spawn (local or over SSH), stream stdout through
 * the pure parser to the sink, bridge tool-permission prompts over the
 * stdin control protocol, and cancel.
 */

import type { ChildProcess } from "node:child_process";
import type { ClaudeCanUseToolRequest, ClaudeCliEvent, ClaudeResultEvent } from "@shared/agent/events";
import { ASK_USER_QUESTION_TOOL, type AgentPermissionResponse, type AgentStartRequest } from "@shared/chat/types";
import type { AgentEventSink } from "../../agent-sink";
import { fetchClaudeUsage } from "../../claude-usage-fetcher";
import { buildClaudeUpstreamEnv, prepareClaudeUpstream, summarizeProviderUpstream } from "../../provider-upstreams";
import { createLogger, describeRemoteRuntime, moveSession, normalizeRemoteRuntime, spawnCli, spawnRemoteCommand } from "../common/boundary";
import { donePayload, emitCancelled, emitLaunchFailure } from "../common/done";
import { writeImagesToTemp } from "../common/images";
import { errorMessage } from "../common/json";
import { LineSplitter } from "../common/line-splitter";
import { cleanupRemoteAttachments, disposeRemoteChannel, finishRemoteChannel, prepareRemoteRun, type RemoteRunResources } from "../common/remote-run";
import { baseCliEnv, getExistingMcpConfigPath } from "../common/runtime-env";
import { buildClaudeArgs, buildClaudePrompt, resolveClaudeModelChoice } from "./args";
import { inspectClaudeEvent, parseClaudeStdoutLine, shouldEmitClaudeStderr, summarizeClaudeResult } from "./parser";
import { buildControlResponse, buildPermissionRequest, buildUserTurn } from "./permissions";
import { resolveClaudeBin, resolveLaunchCwd } from "./rewind";
import { buildClaudeAppendPrompt } from "./system-prompt";

const PROVIDER = "claude";
const STDERR_LIMIT = 256 * 1024;
const log = createLogger("agent-manager");

interface PendingPermission {
  request: ClaudeCanUseToolRequest;
  allowKey: string;
}

type TimingKey = "firstStdoutMs" | "firstEventMs" | "firstAssistantTextMs" | "firstToolUseMs";

interface ClaudeRunState extends RemoteRunResources {
  readonly conversationId: string;
  readonly sink: AgentEventSink;
  readonly startedAt: number;
  child: ChildProcess | null;
  cancelled: boolean;
  /** An AskUserQuestion tool_use is streaming; stop once it is complete. */
  waitingForQuestion: boolean;
  stoppedForQuestion: boolean;
  latestSessionId: string | null;
  stdinClosed: boolean;
  readonly timings: Record<TimingKey, number | null>;
  readonly pendingPermissions: Map<string, PendingPermission>;
  /** "Allow for session" keys; survives a replacement run in the same chat. */
  readonly sessionAllowlist: Set<string>;
}

const activeAgents = new Map<string, ClaudeRunState>();

function isCurrent(state: ClaudeRunState): boolean {
  return !state.cancelled && activeAgents.get(state.conversationId) === state;
}

function markFirst(state: ClaudeRunState, key: TimingKey): void {
  if (state.timings[key] === null) state.timings[key] = Date.now() - state.startedAt;
}

function writeStdinLine(state: ClaudeRunState, payload: object): boolean {
  const stdin = state.child?.stdin;
  if (!stdin || stdin.destroyed || state.stdinClosed) return false;
  try {
    stdin.write(`${JSON.stringify(payload)}\n`);
    return true;
  } catch (err) {
    log("stdin write failed:", errorMessage(err));
    return false;
  }
}

function endStdin(state: ClaudeRunState): void {
  if (state.stdinClosed) return;
  state.stdinClosed = true;
  try {
    state.child?.stdin?.end();
  } catch {
    // already closed
  }
}

function handleCanUseTool(state: ClaudeRunState, requestId: string, request: ClaudeCanUseToolRequest): void {
  const payload = buildPermissionRequest(state.conversationId, requestId, request);
  if (state.sessionAllowlist.has(payload.allowKey)) {
    log("Auto-allowing via session allowlist:", payload.allowKey);
    writeStdinLine(state, buildControlResponse(requestId, { behavior: "allow", updatedInput: request.input ?? {} }));
    return;
  }
  state.pendingPermissions.set(requestId, { request, allowKey: payload.allowKey });
  state.sink.permissionRequest(payload);
}

/** After a turn, attach the Claude plan quota (cached; Pro/Max only). */
function emitPlanQuota(state: ClaudeRunState): void {
  fetchClaudeUsage()
    .then((rateLimits) => {
      // Emitted even if the run moved on, so the now-frozen message updates.
      if (!rateLimits || state.sink.isClosed()) return;
      state.sink.stream({ conversationId: state.conversationId, event: { type: "rate_limits", rate_limits: rateLimits } });
    })
    .catch((err: unknown) => log("fetchClaudeUsage failed:", errorMessage(err)));
}

function attachProcess(state: ClaudeRunState, child: ChildProcess, prompt: string): void {
  const { conversationId, sink } = state;
  const runStartedAt = Date.now();
  const stdoutLines = new LineSplitter();
  let stderr = "";
  let result: ClaudeResultEvent | null = null;

  state.child = child;
  state.stdinClosed = false;
  child.stdin?.on("error", (err) => log("stdin error:", errorMessage(err)));
  writeStdinLine(state, buildUserTurn(prompt));
  log("Spawned PID:", child.pid);

  const handleEvent = (event: ClaudeCliEvent): void => {
    const signals = inspectClaudeEvent(event);
    if (!signals.thinkingDelta) log("Parsed event type:", event.type);
    if (signals.assistantText) markFirst(state, "firstAssistantTextMs");
    if (signals.toolUseStarted) {
      markFirst(state, "firstToolUseMs");
      if (signals.toolUseStarted === ASK_USER_QUESTION_TOOL) state.waitingForQuestion = true;
    }
    if (state.waitingForQuestion && signals.blockStopped) {
      log("AskUserQuestion fully streamed — killing process to wait for user answer");
      state.waitingForQuestion = false;
      state.stoppedForQuestion = true;
      child.kill("SIGTERM");
    }
    if (signals.result) {
      result = signals.result;
      state.latestSessionId = signals.result.session_id || state.latestSessionId;
      log("Result summary:", summarizeClaudeResult(signals.result));
      // No further turns in this run: close stdin so the CLI exits cleanly.
      endStdin(state);
    }
    sink.stream({ conversationId, event });
    if (signals.result) emitPlanQuota(state);
  };

  const handleLine = (line: string): void => {
    if (!isCurrent(state)) return;
    const parsed = parseClaudeStdoutLine(line);
    if (!parsed) return;
    if (parsed.kind !== "invalid") markFirst(state, "firstEventMs");
    switch (parsed.kind) {
      case "invalid":
        log("Failed to parse JSON line:", parsed.preview);
        return;
      case "ignored":
      case "control-other":
        return;
      case "permission-request":
        handleCanUseTool(state, parsed.requestId, parsed.request);
        return;
      case "permission-cancel":
        if (parsed.requestId && state.pendingPermissions.delete(parsed.requestId)) {
          sink.permissionCancelled({ conversationId, requestId: parsed.requestId });
        }
        return;
      case "event":
        handleEvent(parsed.event);
        return;
      default: {
        const exhaustive: never = parsed;
        return exhaustive;
      }
    }
  };

  child.stdout?.on("data", (chunk: Buffer) => {
    if (!isCurrent(state)) return;
    if (state.timings.firstStdoutMs === null) {
      markFirst(state, "firstStdoutMs");
      log("First stdout received", { conversationId, firstStdoutMs: state.timings.firstStdoutMs });
    }
    for (const line of stdoutLines.push(chunk)) handleLine(line);
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    if (!isCurrent(state)) return;
    const text = chunk.toString();
    log("stderr:", text);
    stderr = (stderr + text).slice(-STDERR_LIMIT);
  });

  child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
    if (activeAgents.get(conversationId) === state) {
      const rest = stdoutLines.flush();
      if (rest.trim()) handleLine(rest);
    }
    const isCurrentState = activeAgents.get(conversationId) === state;
    log("Process closed", {
      conversationId,
      exitCode,
      signal,
      durationMs: Date.now() - runStartedAt,
      result: summarizeClaudeResult(result),
      timings: state.timings,
    });
    cleanupRemoteAttachments(state, log);
    finishRemoteChannel(state, log);

    if (!isCurrentState) {
      log(state.cancelled ? "Cancelled run closed after replacement; ignoring" : "Stale run closed after replacement; ignoring");
      return;
    }
    activeAgents.delete(conversationId);
    if (!state.cancelled && shouldEmitClaudeStderr({ stderr, result, exitCode, signal, cancelled: state.cancelled, stoppedForQuestion: state.stoppedForQuestion })) {
      log("Full stderr:", stderr);
      sink.error({ conversationId, error: stderr.trim() });
    }
    sink.done(donePayload(PROVIDER, conversationId, exitCode, { signal }));
  });

  child.on("error", (err) => {
    const isCurrentState = activeAgents.get(conversationId) === state;
    log("Spawn error:", err.message);
    cleanupRemoteAttachments(state, log);
    disposeRemoteChannel(state, log);
    if (isCurrentState) activeAgents.delete(conversationId);
    sink.error({ conversationId, error: err.message });
    if (isCurrentState) sink.done(donePayload(PROVIDER, conversationId, -1));
  });
}

export async function startAgent(request: AgentStartRequest, sink: AgentEventSink): Promise<ChildProcess | null> {
  const { conversationId } = request;
  cancelAgent(conversationId);

  const agentSessionId = request.resumeSessionId || request.sessionId || null;
  const remote = normalizeRemoteRuntime(request.remoteRuntime);
  const claudeBin = remote ? remote.commandPath || "claude" : resolveClaudeBin();
  if (!claudeBin) {
    const error = "Unable to locate the Claude CLI binary";
    log(error);
    emitLaunchFailure(sink, PROVIDER, conversationId, error);
    return null;
  }

  const previous = activeAgents.get(conversationId);
  const state: ClaudeRunState = {
    conversationId,
    sink,
    startedAt: Date.now(),
    child: null,
    cancelled: false,
    waitingForQuestion: false,
    stoppedForQuestion: false,
    latestSessionId: agentSessionId,
    stdinClosed: false,
    timings: { firstStdoutMs: null, firstEventMs: null, firstAssistantTextMs: null, firstToolUseMs: null },
    pendingPermissions: new Map(),
    sessionAllowlist: previous?.sessionAllowlist ?? new Set(),
    remoteAttachmentCleanup: null,
    remoteChannel: null,
  };
  activeAgents.set(conversationId, state);

  const fail = (error: string): null => {
    if (activeAgents.get(conversationId) === state) activeAgents.delete(conversationId);
    cleanupRemoteAttachments(state, log);
    disposeRemoteChannel(state, log);
    emitLaunchFailure(sink, PROVIDER, conversationId, error);
    return null;
  };

  try {
    const launchCwd = remote ? remote.cwd || process.cwd() : await resolveLaunchCwd(request.cwd, agentSessionId);
    if (!isCurrent(state)) return null;

    let imagePaths: string[];
    let files = request.files ?? [];
    if (remote) {
      const prepared = await prepareRemoteRun({
        remote,
        conversationId,
        provider: PROVIDER,
        images: request.images,
        files: request.files,
        resources: state,
        isCurrent: () => isCurrent(state),
        log,
      });
      if (prepared.kind === "stale") return null;
      if (prepared.kind === "error") {
        log(prepared.error);
        return fail(prepared.error);
      }
      imagePaths = prepared.staged?.images ?? [];
      files = prepared.staged?.files ?? [];
    } else {
      imagePaths = await writeImagesToTemp(request.images, "ensue-img");
    }

    const mcpConfigPath = remote ? null : await getExistingMcpConfigPath();
    const upstream = prepareClaudeUpstream(request.providerUpstreamConfig, request.model, { patchLocalSettings: !remote });
    const upstreamEnv = buildClaudeUpstreamEnv(request.providerUpstreamConfig);
    const choice = resolveClaudeModelChoice(request.model, request.effort, Boolean(upstream?.baseURL));
    const args = buildClaudeArgs({
      model: choice.model,
      effort: choice.effort,
      sessionId: request.sessionId,
      resumeSessionId: request.resumeSessionId,
      forkSession: request.forkSession,
      mcpConfigPath,
      appendSystemPrompt: buildClaudeAppendPrompt({
        remote: Boolean(remote),
        remoteChannelInstructions: state.remoteChannel?.instructions,
        projectContext: request.projectContext,
      }),
    });
    const prompt = buildClaudePrompt({
      prompt: request.prompt,
      imageCount: request.images?.length ?? 0,
      imagePaths,
      files,
      remote: Boolean(remote),
    });

    if (!remote && request.resumeSessionId) {
      try {
        const prepared = await moveSession(request.resumeSessionId, launchCwd);
        log("Prepared resume session for launch cwd", { conversationId, resumeSessionId: request.resumeSessionId, cwd: launchCwd, prepared });
      } catch (err) {
        log("Failed to prepare resume session for launch cwd", { conversationId, cwd: launchCwd, error: errorMessage(err) });
      }
    }
    if (!isCurrent(state)) return null;

    log("Starting agent:", {
      conversationId,
      model: choice.model,
      effort: choice.effort,
      cwd: launchCwd,
      sessionId: request.sessionId,
      resumeSessionId: request.resumeSessionId,
      forkSession: request.forkSession,
      upstream: summarizeProviderUpstream(request.providerUpstreamConfig, "claude"),
      remote: describeRemoteRuntime(remote),
    });
    log("Prompt:", prompt.slice(0, 100));

    const child = remote
      ? spawnRemoteCommand(
          remote,
          claudeBin,
          args,
          { cwd: process.cwd(), env: baseCliEnv(), stdio: ["pipe", "pipe", "pipe"] },
          { env: { FORCE_COLOR: "0", ...upstreamEnv, ...(state.remoteChannel?.env ?? {}) }, cwd: remote.cwd, sshArgs: state.remoteChannel?.sshArgs },
        )
      : spawnCli(claudeBin, args, { cwd: launchCwd, env: baseCliEnv(upstreamEnv), stdio: ["pipe", "pipe", "pipe"] });
    attachProcess(state, child, prompt);
    return child;
  } catch (err) {
    if (!isCurrent(state)) return null;
    log("Failed to start agent:", errorMessage(err));
    return fail(errorMessage(err));
  }
}

export function respondPermission({ conversationId, requestId, behavior, message, updatedInput, scope }: AgentPermissionResponse): boolean {
  const state = activeAgents.get(conversationId);
  if (!state) {
    log("respondPermission: no active agent for", conversationId);
    return false;
  }
  const pending = state.pendingPermissions.get(requestId);
  if (!pending) {
    log("respondPermission: no pending request", requestId);
    return false;
  }
  state.pendingPermissions.delete(requestId);

  if (behavior === "allow") {
    if (scope === "session" && pending.allowKey) {
      state.sessionAllowlist.add(pending.allowKey);
      log("Added to session allowlist:", pending.allowKey);
    }
    return writeStdinLine(state, buildControlResponse(requestId, { behavior: "allow", updatedInput: updatedInput || pending.request.input || {} }));
  }
  return writeStdinLine(state, buildControlResponse(requestId, { behavior: "deny", message: message || "User denied permission" }));
}

function cancelState(state: ClaudeRunState): void {
  state.cancelled = true;
  for (const requestId of state.pendingPermissions.keys()) {
    writeStdinLine(state, buildControlResponse(requestId, { behavior: "deny", message: "Cancelled" }));
  }
  state.pendingPermissions.clear();
  cleanupRemoteAttachments(state, log);
  finishRemoteChannel(state, log);

  if (state.child) {
    endStdin(state);
    state.child.kill("SIGTERM");
    return;
  }
  // Still preparing (no process yet): finish the run here.
  activeAgents.delete(state.conversationId);
  emitCancelled(state.sink, PROVIDER, state.conversationId);
}

export function cancelAgent(conversationId: string): void {
  const state = activeAgents.get(conversationId);
  if (!state || state.cancelled) return;
  log("Cancelling agent:", conversationId);
  cancelState(state);
}

export function cancelAll(): void {
  for (const state of [...activeAgents.values()]) {
    if (!state.cancelled) cancelState(state);
  }
}
