/**
 * Codex run lifecycle: build args, spawn `codex exec --json` (local or over
 * SSH), forward parsed events to the sink, and read the usage / quota
 * snapshot back from the session file after exit (exec --json does not
 * stream `token_count`).
 */

import type { ChildProcess } from "node:child_process";
import type { AgentStartRequest } from "@shared/chat/types";
import type { AgentEventSink } from "../../agent-sink";
import { buildCodexUpstreamEnv, prepareCodexUpstream, summarizeProviderUpstream, type CodexUpstreamRuntime } from "../../provider-upstreams";
import { spawnCli } from "../../cli-bin-resolver";
import { createLogger } from "../../logger";
import { describeRemoteRuntime, normalizeRemoteRuntime, spawnRemoteCommand } from "../../remote-runtime";
import { loadSessionMessages } from "../../session-reader";
import { donePayload, emitCancelled, emitLaunchFailure } from "../common/done";
import { writeImagesToTemp } from "../common/images";
import { errorMessage } from "../common/json";
import { LineSplitter } from "../common/line-splitter";
import { cleanupRemoteAttachments, disposeRemoteChannel, finishRemoteChannel, prepareRemoteRun, type RemoteRunResources } from "../common/remote-run";
import { baseCliEnv, createCliBinResolver, getMcpConfigPath, isDirectory, terminalEnv } from "../common/runtime-env";
import { findDiscoveredCodexModel } from "../model-catalog";
import { buildCodexArgs, codexSandboxModeFromEnv, resolveCodexModelChoice } from "./args";
import { buildCodexMcpOverrides, hasTerminalSessionsServer, readConfiguredMcpServers } from "./mcp";
import { inspectCodexEvent, parseCodexLine, shouldEmitCodexStderr } from "./parser";
import { buildCodexPrompt } from "./system-prompt";

const PROVIDER = "codex";
const SESSION_SNAPSHOT_RETRY_DELAYS_MS = [0, 150, 500, 1200, 2500];
const STDERR_LIMIT = 256 * 1024;
const log = createLogger("codex-agent-manager");

export const resolveCodexBin = createCliBinResolver("codex", "CODEX_BIN");

interface CodexRunState extends RemoteRunResources {
  readonly conversationId: string;
  readonly sink: AgentEventSink;
  child: ChildProcess | null;
  cancelled: boolean;
  sawTurnCompleted: boolean;
  lastErrorMessage: string | null;
  threadId: string | null;
  upstream: CodexUpstreamRuntime | null;
}

const activeAgents = new Map<string, CodexRunState>();

function isCurrent(state: CodexRunState): boolean {
  return !state.cancelled && activeAgents.get(state.conversationId) === state;
}

function closeUpstreamBridge(state: CodexRunState): void {
  state.upstream?.bridge?.close();
}

/** Re-reads the session file until it has usage / rate limits (or gives up). */
function scheduleSessionSnapshot(sink: AgentEventSink, conversationId: string, threadId: string | null, attempt = 0): void {
  const delay = SESSION_SNAPSHOT_RETRY_DELAYS_MS[attempt];
  if (!threadId || delay === undefined) return;
  setTimeout(() => {
    loadSessionMessages(threadId)
      .then((result) => {
        const usage = result.usageSnapshot ?? null;
        const rateLimits = result.rateLimitsSnapshot ?? null;
        if (!usage && !rateLimits) {
          scheduleSessionSnapshot(sink, conversationId, threadId, attempt + 1);
          return;
        }
        if (sink.isClosed()) return;
        log("Emitting Codex session snapshot:", { conversationId, threadId, hasUsage: Boolean(usage), hasRateLimits: Boolean(rateLimits) });
        sink.stream({
          conversationId,
          event: { type: "session_snapshot", provider: "codex", thread_id: threadId, usage, rate_limits: rateLimits },
        });
      })
      .catch(() => scheduleSessionSnapshot(sink, conversationId, threadId, attempt + 1));
  }, delay);
}

function attachProcess(state: CodexRunState, child: ChildProcess): void {
  const { conversationId, sink } = state;
  const stdoutLines = new LineSplitter();
  let stderr = "";

  state.child = child;
  // Codex stalls before its first request when stdin is /dev/null; give it a
  // pipe and close it immediately so it sees EOF.
  child.stdin?.on("error", () => {});
  child.stdin?.end();
  log("Spawned PID:", child.pid);
  if (state.upstream?.bridge) {
    child.once("exit", () => closeUpstreamBridge(state));
    child.once("error", () => closeUpstreamBridge(state));
  }

  const handleLine = (line: string): void => {
    const parsed = parseCodexLine(line);
    if (!parsed) return;
    switch (parsed.kind) {
      case "invalid":
        log("Failed to parse JSON line:", parsed.preview);
        return;
      case "ignored":
        log("Ignored event type:", parsed.type);
        return;
      case "event": {
        const signals = inspectCodexEvent(parsed.event);
        if (signals.threadId) state.threadId = signals.threadId;
        if (signals.turnCompleted) state.sawTurnCompleted = true;
        if (signals.errorMessage) state.lastErrorMessage = signals.errorMessage;
        log("Parsed event type:", parsed.event.type);
        sink.stream({ conversationId, event: parsed.event });
        return;
      }
      default: {
        const exhaustive: never = parsed;
        return exhaustive;
      }
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
    log("Process closed, exitCode:", exitCode, "signal:", signal, "cancelled:", state.cancelled, "current:", isCurrentState);
    if (isCurrentState) {
      const rest = stdoutLines.flush();
      if (rest.trim()) handleLine(rest);
    }
    cleanupRemoteAttachments(state, log);
    finishRemoteChannel(state, log);
    if (!isCurrentState) {
      log("Stale codex run closed after replacement; ignoring");
      return;
    }
    activeAgents.delete(conversationId);
    const details = { signal, threadId: state.threadId };
    if (state.cancelled) {
      sink.done(donePayload(PROVIDER, conversationId, exitCode, details));
      return;
    }

    if (state.lastErrorMessage || shouldEmitCodexStderr({ stderr, exitCode, signal, cancelled: false, sawTurnCompleted: state.sawTurnCompleted })) {
      const error = state.lastErrorMessage || stderr.trim();
      log("Codex process error:", error);
      if (stderr.trim() && error !== stderr.trim()) log("Full stderr:", stderr);
      sink.error({ conversationId, error });
    }
    scheduleSessionSnapshot(sink, conversationId, state.threadId);
    sink.done(donePayload(PROVIDER, conversationId, exitCode, details));
  });

  child.on("error", (err) => {
    const isCurrentState = activeAgents.get(conversationId) === state;
    log("Spawn error:", err.message);
    cleanupRemoteAttachments(state, log);
    disposeRemoteChannel(state, log);
    if (isCurrentState) activeAgents.delete(conversationId);
    sink.error({ conversationId, error: err.message });
    if (isCurrentState) sink.done(donePayload(PROVIDER, conversationId, -1, { threadId: state.threadId }));
  });
}

export async function startCodexAgent(request: AgentStartRequest, sink: AgentEventSink): Promise<ChildProcess | null> {
  const { conversationId } = request;
  cancelCodexAgent(conversationId);

  const remote = normalizeRemoteRuntime(request.remoteRuntime);
  const state: CodexRunState = {
    conversationId,
    sink,
    child: null,
    cancelled: false,
    sawTurnCompleted: false,
    lastErrorMessage: null,
    threadId: null,
    upstream: null,
    remoteAttachmentCleanup: null,
    remoteChannel: null,
  };
  activeAgents.set(conversationId, state);

  const fail = (error: string): null => {
    if (activeAgents.get(conversationId) === state) activeAgents.delete(conversationId);
    cleanupRemoteAttachments(state, log);
    disposeRemoteChannel(state, log);
    closeUpstreamBridge(state);
    emitLaunchFailure(sink, PROVIDER, conversationId, error);
    return null;
  };

  try {
    const codexBin = remote ? remote.commandPath || "codex" : resolveCodexBin();
    if (!codexBin) {
      log("Unable to locate the Codex CLI binary");
      return fail("Unable to locate the Codex CLI binary");
    }

    let launchCwd = process.cwd();
    let cwdArg: string | null = null;
    if (remote) {
      launchCwd = remote.cwd || process.cwd();
    } else if (request.cwd && (await isDirectory(request.cwd))) {
      launchCwd = request.cwd;
      cwdArg = request.cwd;
    } else if (request.cwd) {
      log(`Invalid working directory: ${request.cwd}`);
      return fail(`Invalid working directory: ${request.cwd}`);
    }

    try {
      state.upstream = await prepareCodexUpstream(request.providerUpstreamConfig, request.model, { bridge: !remote });
    } catch (err) {
      log("Failed to prepare codex upstream:", errorMessage(err));
      return isCurrent(state) ? fail(errorMessage(err) || "Failed to prepare Codex upstream") : null;
    }
    if (!isCurrent(state)) {
      closeUpstreamBridge(state);
      return null;
    }

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
      if (prepared.kind === "stale") {
        closeUpstreamBridge(state);
        return null;
      }
      if (prepared.kind === "error") {
        log(prepared.error);
        return fail(prepared.error);
      }
      imagePaths = prepared.staged?.images ?? [];
      files = prepared.staged?.files ?? [];
    } else {
      imagePaths = await writeImagesToTemp(request.images, "ensue-codex-img");
    }

    const mcpServers = remote ? [] : await readConfiguredMcpServers(getMcpConfigPath());
    const upstreamActive = Boolean(state.upstream);
    const discovered = upstreamActive || remote ? null : await findDiscoveredCodexModel(request.model);
    const choice = resolveCodexModelChoice(request.model, request.effort, upstreamActive, discovered);
    const prompt = buildCodexPrompt(request.prompt, files, {
      remote: Boolean(remote),
      hasTerminalSessions: hasTerminalSessionsServer(mcpServers),
      remoteChannelInstructions: state.remoteChannel?.instructions,
    });
    const args = buildCodexArgs({
      resumeSessionId: request.resumeSessionId,
      sandbox: codexSandboxModeFromEnv(process.env),
      model: choice.model,
      effort: choice.effort,
      mcpOverrides: buildCodexMcpOverrides(mcpServers),
      upstreamArgs: state.upstream?.args,
      cwd: cwdArg,
      imagePaths,
      prompt,
    });
    if (!isCurrent(state)) {
      closeUpstreamBridge(state);
      return null;
    }

    log("Starting codex agent:", {
      conversationId,
      model: choice.model,
      requestedModel: request.model,
      effort: choice.effort,
      cwd: launchCwd,
      resumeSessionId: request.resumeSessionId,
      mcpServers: mcpServers.map(([name]) => name),
      upstream: summarizeProviderUpstream(request.providerUpstreamConfig, "codex"),
      remote: describeRemoteRuntime(remote),
    });
    log("Full args:", args.slice(0, -1).join(" "));

    const codexEnv = buildCodexUpstreamEnv(request.providerUpstreamConfig, state.upstream?.bridge?.apiKey);
    const child = remote
      ? spawnRemoteCommand(
          remote,
          codexBin,
          args,
          { cwd: process.cwd(), env: baseCliEnv(), stdio: ["pipe", "pipe", "pipe"] },
          { env: { FORCE_COLOR: "0", ...codexEnv, ...(state.remoteChannel?.env ?? {}) }, cwd: remote.cwd, sshArgs: state.remoteChannel?.sshArgs },
        )
      : spawnCli(codexBin, args, { cwd: launchCwd, env: baseCliEnv({ ...codexEnv, ...terminalEnv() }), stdio: ["pipe", "pipe", "pipe"] });
    attachProcess(state, child);
    return child;
  } catch (err) {
    if (!isCurrent(state)) {
      closeUpstreamBridge(state);
      return null;
    }
    log("Failed to start codex agent:", errorMessage(err));
    return fail(errorMessage(err));
  }
}

function cancelState(state: CodexRunState): void {
  state.cancelled = true;
  cleanupRemoteAttachments(state, log);
  finishRemoteChannel(state, log);
  if (state.child) {
    state.child.kill("SIGTERM");
    return;
  }
  activeAgents.delete(state.conversationId);
  closeUpstreamBridge(state);
  emitCancelled(state.sink, PROVIDER, state.conversationId, state.threadId);
}

export function cancelCodexAgent(conversationId: string): void {
  const state = activeAgents.get(conversationId);
  if (!state || state.cancelled) return;
  log("Cancelling codex agent:", conversationId);
  cancelState(state);
}

export function cancelAllCodex(): void {
  for (const state of [...activeAgents.values()]) {
    if (!state.cancelled) cancelState(state);
  }
}
