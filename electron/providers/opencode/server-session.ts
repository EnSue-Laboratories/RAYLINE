/**
 * OpenCode "thinking" mode: start a private `opencode serve`, create / fork
 * a session, send the prompt with `prompt_async`, and translate the SSE
 * event stream until the session goes idle. Used because `opencode run`
 * does not stream reasoning.
 */

import type { AgentStartRequest } from "@shared/chat/types";
import type { AgentEventSink } from "../../agent-sink";
import { spawnCli } from "../common/boundary";
import { buildAgentCliPrompt } from "../common/agent-prompt";
import { errorMessage, readString } from "../common/json";
import { buildOpenCodeServeArgs, buildPromptParts, parseOpenCodeModel } from "./config";
import { createOpenCodeServerStreamState, extractOpenCodeSessionId, isOpenCodeIdleEvent, normalizeOpenCodeServerEvent, readPermissionRequest } from "./parser";
import { activeAgents, finishOpenCodeRun, isActive, log, runConfigCleanup, type OpenCodeServerRunState } from "./registry";
import { createOpenCodeRuntimeEnvAsync } from "./runtime-env";
import { getAvailablePort, openCodeRequest, readOpenCodeEvents, waitForOpenCodeServerUrl } from "./server-client";

async function approvePermission(baseUrl: string, directory: string, sessionId: string, permissionId: string): Promise<void> {
  try {
    await openCodeRequest(baseUrl, `/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}`, {
      method: "POST",
      directory,
      body: { response: "always" },
    });
  } catch (err) {
    log("Permission auto-approve failed:", errorMessage(err));
  }
}

function streamEvents(state: OpenCodeServerRunState, baseUrl: string): Promise<void> {
  const controller = new AbortController();
  state.abortController = controller;
  return readOpenCodeEvents(baseUrl, state.cwd, controller.signal, (event) => {
    if (state.cancelled) return "stop";
    const permission = readPermissionRequest(event, state.stream.sessionId);
    if (permission) void approvePermission(baseUrl, state.cwd, permission.sessionId, permission.permissionId);

    for (const normalized of normalizeOpenCodeServerEvent(event, state.stream)) {
      state.sawJsonEvent = true;
      const nextSessionId = extractOpenCodeSessionId(normalized);
      if (nextSessionId) state.stream.sessionId = nextSessionId;
      log("Parsed server event as", normalized.type);
      state.sink.stream({ conversationId: state.conversationId, event: normalized });
    }
    return state.promptStarted && isOpenCodeIdleEvent(event, state.stream.sessionId) ? "stop" : "continue";
  });
}

async function runServer(state: OpenCodeServerRunState, request: AgentStartRequest, openCodeBin: string): Promise<void> {
  const runtime = await createOpenCodeRuntimeEnvAsync(request.openCodeConfig, request.model);
  if (state.cancelled || !isActive(state)) {
    runtime.cleanup();
    return;
  }
  state.configCleanup = runtime.cleanup;
  const port = await getAvailablePort();
  if (state.cancelled || !isActive(state)) {
    runConfigCleanup(state);
    return;
  }

  const args = buildOpenCodeServeArgs(port);
  log("Starting opencode server-stream agent:", { conversationId: state.conversationId, model: request.model, cwd: state.cwd, sessionId: state.stream.sessionId });
  const child = spawnCli(openCodeBin, args, { cwd: state.cwd, env: runtime.env, stdio: ["ignore", "pipe", "pipe"] });
  state.child = child;

  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    log("serve stderr:", text.trim());
    stderr = (stderr + text).slice(-64 * 1024);
  });
  child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
    if (state.done || !isActive(state)) return;
    if (state.cancelled) {
      finishOpenCodeRun(state, { exitCode, signal });
      return;
    }
    finishOpenCodeRun(state, { exitCode: exitCode ?? -1, signal, error: stderr.trim() || `OpenCode server exited: ${exitCode ?? signal ?? "unknown"}` });
  });
  child.on("error", (err) => {
    if (state.done || !isActive(state)) return;
    finishOpenCodeRun(state, { exitCode: -1, error: err.message });
  });

  const baseUrl = await waitForOpenCodeServerUrl(child, () => state.cancelled, port, log);
  state.serverUrl = baseUrl;
  log("OpenCode server ready:", baseUrl);
  const streamDone = streamEvents(state, baseUrl);

  let runSessionId = state.stream.sessionId ?? "";
  if (runSessionId && request.forkSession) {
    const forked = await openCodeRequest(baseUrl, `/session/${encodeURIComponent(runSessionId)}/fork`, { method: "POST", directory: state.cwd, body: {} });
    runSessionId = readString(forked, "id") || runSessionId;
  } else if (!runSessionId) {
    const created = await openCodeRequest(baseUrl, "/session", {
      method: "POST",
      directory: state.cwd,
      body: { title: String(request.prompt || "").slice(0, 80) || "RayLine chat" },
    });
    runSessionId = readString(created, "id") ?? "";
  }
  if (!runSessionId) throw new Error("OpenCode server did not create a session.");
  state.stream.sessionId = runSessionId;

  const body: { parts: ReturnType<typeof buildPromptParts>; model?: { providerID: string; modelID: string } } = {
    parts: buildPromptParts(buildAgentCliPrompt(request.prompt, request.files), request.images),
  };
  const parsedModel = parseOpenCodeModel(request.model);
  if (parsedModel) body.model = parsedModel;

  log("Starting opencode prompt_async:", { conversationId: state.conversationId, sessionId: runSessionId, model: request.model });
  await openCodeRequest(baseUrl, `/session/${encodeURIComponent(runSessionId)}/prompt_async`, { method: "POST", directory: state.cwd, body });
  state.promptStarted = true;

  await streamDone;
  if (!state.cancelled) finishOpenCodeRun(state, { exitCode: 0 });
}

export function startOpenCodeServerAgent(request: AgentStartRequest, sink: AgentEventSink, openCodeBin: string, launchCwd: string): OpenCodeServerRunState {
  const state: OpenCodeServerRunState = {
    mode: "server",
    conversationId: request.conversationId,
    sink,
    child: null,
    cancelled: false,
    done: false,
    sawJsonEvent: false,
    configCleanup: () => {},
    cwd: launchCwd,
    serverUrl: "",
    promptStarted: false,
    abortController: null,
    stream: createOpenCodeServerStreamState(request.resumeSessionId || request.sessionId || null),
  };
  activeAgents.set(request.conversationId, state);

  runServer(state, request, openCodeBin).catch((err: unknown) => {
    if (state.cancelled || !isActive(state)) return;
    finishOpenCodeRun(state, { exitCode: -1, error: errorMessage(err) });
  });
  return state;
}
