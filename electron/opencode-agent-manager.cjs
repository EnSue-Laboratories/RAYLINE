const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");
const { buildSpawnPath, isExecutable, resolveCliBin, spawnCli } = require("./cli-bin-resolver.cjs");
const { createLogger } = require("./logger.cjs");

const activeAgents = new Map();
const TERMINAL_CLI_PATH = path.join(__dirname, "../scripts/claudi-terminal.cjs");
const log = createLogger("opencode-agent-manager");

function isDirectory(dirPath) {
  try {
    return !!dirPath && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

let cachedOpenCodeBin = null;

function resolveOpenCodeBin() {
  if (cachedOpenCodeBin && isExecutable(cachedOpenCodeBin)) return cachedOpenCodeBin;
  cachedOpenCodeBin = resolveCliBin("opencode", { envVarName: "OPENCODE_BIN" });
  return cachedOpenCodeBin;
}

function buildRayLinePrompt(prompt, files) {
  let fullPrompt = prompt;

  if (files && files.length > 0) {
    const filePaths = files.map((f) => f.path).filter(Boolean).join("\n");
    if (filePaths) fullPrompt = `[Attached files:\n${filePaths}]\n\n${fullPrompt}`;
  }

  return `System context for this run:
You are running inside RayLine, a desktop GUI client for coding agents.
The user is interacting via a chat interface, not a terminal.
Keep responses concise and conversational.
Use markdown formatting; the client renders headings, code blocks, tables, lists, and mermaid diagrams.
When showing diagrams, prefer mermaid code blocks.
Do not ask the user to run terminal commands when you can do the work yourself.
For math, use LaTeX: $inline$ and $$block$$. Never wrap LaTeX in code blocks.

Terminal sessions:
RayLine's terminal means the dedicated terminal window inside the app. Sessions created there are user-visible and remain available across turns.
Use RayLine's terminal when you want the user to see or interact with a shell, when a process should keep running, or when stdin needs to be sent over time.
If terminal-session MCP tools are not exposed, use the local terminal CLI exposed via $CLAUDI_TERMINAL_CLI.

The text below is the actual user prompt.
--- USER PROMPT ---
${fullPrompt}`;
}

function extractSessionId(event) {
  if (!event || typeof event !== "object") return null;
  return (
    event.sessionID ||
    event.session_id ||
    event.sessionId ||
    event.session?.id ||
    event.part?.sessionID ||
    null
  );
}

function extractErrorMessage(event) {
  if (!event || typeof event !== "object") return null;
  if (typeof event.message === "string" && event.message.trim()) return event.message.trim();
  if (typeof event.error === "string" && event.error.trim()) return event.error.trim();
  if (typeof event.error?.message === "string" && event.error.message.trim()) return event.error.message.trim();
  if (typeof event.error?.data?.message === "string" && event.error.data.message.trim()) {
    return event.error.data.message.trim();
  }
  return null;
}

function shouldEmitStderrError({ stderrBuffer, exitCode, signal, cancelled, sawJsonEvent }) {
  if (!stderrBuffer.trim()) return false;
  if (cancelled) return false;
  if (exitCode === 0 && !signal && sawJsonEvent) return false;
  return exitCode !== 0 || Boolean(signal) || !sawJsonEvent;
}

function inferThinkingModel(model) {
  const value = String(model || "").toLowerCase();
  return (
    /deepseek.*(?:r1|reasoner|v4|v3[._-]?[12])/.test(value) ||
    /(?:^|[/:._-])r1(?:$|[/:._-])/.test(value) ||
    value.includes("reasoning") ||
    value.includes("thinking") ||
    value.includes("qwq") ||
    value.includes("qwen3") ||
    value.includes("glm-4.6")
  );
}

function shouldEnableThinking(model, thinking) {
  if (thinking === true) return true;
  if (thinking === false) return false;
  return inferThinkingModel(model);
}

function buildOpenCodeEnv(extra = {}) {
  return {
    ...process.env,
    FORCE_COLOR: "0",
    PATH: buildSpawnPath(),
    OPENCODE_CLIENT: "rayline",
    CLAUDI_TERMINAL_CLI: TERMINAL_CLI_PATH,
    CLAUDI_TERMINAL_PORT: global.terminalWsPort ? String(global.terminalWsPort) : "",
    CLAUDI_TERMINAL_MCP_CONFIG: global.mcpConfigPath || "",
    ...extra,
  };
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function withDirectoryQuery(url, directory) {
  if (!directory) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}directory=${encodeURIComponent(directory)}`;
}

async function readResponseText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function openCodeRequest(baseUrl, route, { method = "GET", body, directory, signal } = {}) {
  const response = await fetch(withDirectoryQuery(`${baseUrl}${route}`, directory), {
    method,
    signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await readResponseText(response);
  if (!response.ok) {
    throw new Error(text || `OpenCode server request failed: ${response.status}`);
  }
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseOpenCodeModel(model) {
  if (typeof model !== "string") return null;
  const slashIndex = model.indexOf("/");
  if (slashIndex <= 0 || slashIndex >= model.length - 1) return null;
  return {
    providerID: model.slice(0, slashIndex),
    modelID: model.slice(slashIndex + 1),
  };
}

function safeConfigString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOpenCodeRuntimeConfig(openCodeConfig, model) {
  const parsedModel = parseOpenCodeModel(model);
  const providerId = safeConfigString(openCodeConfig?.providerId) || parsedModel?.providerID || "";
  const modelId = safeConfigString(openCodeConfig?.modelId) || parsedModel?.modelID || "";
  const apiKey = safeConfigString(openCodeConfig?.apiKey);
  const baseURL = safeConfigString(openCodeConfig?.baseURL);
  if (!providerId || !/^[a-zA-Z0-9_.-]+$/.test(providerId)) return null;
  if (!apiKey && !baseURL) return null;
  return { providerId, modelId, apiKey, baseURL };
}

function createOpenCodeRuntimeEnv(openCodeConfig, model) {
  const normalized = normalizeOpenCodeRuntimeConfig(openCodeConfig, model);
  if (!normalized) return { env: buildOpenCodeEnv(), cleanup: () => {} };

  const envPatch = {};
  const providerOptions = {};
  if (normalized.apiKey) {
    envPatch.RAYLINE_OPENCODE_API_KEY = normalized.apiKey;
    providerOptions.apiKey = "{env:RAYLINE_OPENCODE_API_KEY}";
  }
  if (normalized.baseURL) {
    envPatch.RAYLINE_OPENCODE_BASE_URL = normalized.baseURL;
    providerOptions.baseURL = "{env:RAYLINE_OPENCODE_BASE_URL}";
  }

  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "rayline-opencode-"));
  const configPath = path.join(configDir, "opencode.json");
  fs.writeFileSync(configPath, JSON.stringify({
    "$schema": "https://opencode.ai/config.json",
    provider: {
      [normalized.providerId]: { options: providerOptions },
    },
  }, null, 2) + "\n", { mode: 0o600 });

  return {
    env: buildOpenCodeEnv({
      ...envPatch,
      OPENCODE_CONFIG: configPath,
    }),
    cleanup: () => {
      fs.rmSync(configDir, { recursive: true, force: true });
    },
  };
}

function cleanupOpenCodeRuntime(state) {
  if (!state?.configCleanup) return;
  const cleanup = state.configCleanup;
  state.configCleanup = null;
  try {
    cleanup();
  } catch (error) {
    log("Failed to remove temporary OpenCode config:", error.message);
  }
}

function buildPromptParts(fullPrompt, images) {
  const parts = [{ type: "text", text: fullPrompt }];
  if (!Array.isArray(images)) return parts;

  for (let i = 0; i < images.length; i += 1) {
    const dataUrl = images[i];
    if (typeof dataUrl !== "string") continue;
    const match = dataUrl.match(/^data:([^;]+);base64,/);
    if (!match) continue;
    parts.push({
      type: "file",
      mime: match[1],
      filename: `rayline-image-${i + 1}`,
      url: dataUrl,
    });
  }

  return parts;
}

function waitForOpenCodeServerUrl(child, state, fallbackPort) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdoutBuffer = "";

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off("data", onStdout);
      child.off("error", onError);
      child.off("close", onClose);
    };
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const onStdout = (chunk) => {
      const text = chunk.toString();
      log("serve stdout:", text.trim());
      stdoutBuffer += text;
      const match = stdoutBuffer.match(/listening on (https?:\/\/[^\s]+)/i);
      if (match) finish(resolve, match[1]);
    };
    const onError = (err) => finish(reject, err);
    const onClose = (code, signal) => {
      if (state.cancelled) return finish(reject, new Error("OpenCode server cancelled."));
      finish(reject, new Error(`OpenCode server exited before ready: ${code ?? signal ?? "unknown"}`));
    };
    const timeout = setTimeout(() => {
      finish(resolve, `http://127.0.0.1:${fallbackPort}`);
    }, 8000);

    child.stdout.on("data", onStdout);
    child.once("error", onError);
    child.once("close", onClose);
  });
}

function partToOpenCodeEvents(part) {
  if (!part || typeof part !== "object") return [];
  const base = {
    part,
    sessionID: part.sessionID,
    timestamp: Date.now(),
  };

  if (part.type === "step-start") return [{ ...base, type: "step_start" }];
  if (part.type === "step-finish") return [{ ...base, type: "step_finish", reason: part.reason }];
  if (part.type === "tool") return [{ ...base, type: "tool_use" }];
  if (part.type === "reasoning") return [{ ...base, type: "reasoning", reasoning: part.text || "" }];
  if (part.type === "text") return [{ ...base, type: "text", text: part.text || "" }];
  return [];
}

function normalizeOpenCodeServerEvent(event, state) {
  if (!event || typeof event !== "object") return [];
  const properties = event.properties || {};

  if (event.type === "message.updated") {
    const info = properties.info || {};
    if (info.id && info.role) state.messageRoles.set(info.id, info.role);
    return [];
  }

  if (event.type === "message.part.updated") {
    const part = properties.part;
    if (!part?.id) return [];
    if (state.messageRoles.get(part.messageID) === "user") return [];
    if (part.sessionID) state.sessionId = part.sessionID;
    if (part.type) state.partTypes.set(part.id, part.type);
    if (part.time?.start) state.partStarts.set(part.id, part.time.start);
    if (typeof part.text === "string") state.partText.set(part.id, part.text);
    return partToOpenCodeEvents(part);
  }

  if (event.type === "message.part.delta") {
    const partID = properties.partID;
    const delta = typeof properties.delta === "string" ? properties.delta : "";
    const partType = state.partTypes.get(partID);
    if (state.messageRoles.get(properties.messageID) === "user") return [];
    if (!partID || !delta || (partType !== "reasoning" && partType !== "text")) return [];

    const text = `${state.partText.get(partID) || ""}${delta}`;
    state.partText.set(partID, text);
    const part = {
      id: partID,
      sessionID: properties.sessionID,
      messageID: properties.messageID,
      type: partType,
      text,
      time: { start: state.partStarts.get(partID) || Date.now() },
    };
    return partToOpenCodeEvents(part);
  }

  if (event.type === "session.error") {
    const message =
      properties.error?.message ||
      properties.error ||
      properties.message ||
      "OpenCode run failed.";
    return [{ type: "error", message, error: message, sessionID: properties.sessionID }];
  }

  return [];
}

async function approveOpenCodePermission(baseUrl, directory, sessionId, permissionId) {
  if (!sessionId || !permissionId) return;
  try {
    await openCodeRequest(baseUrl, `/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}`, {
      method: "POST",
      directory,
      body: { response: "always" },
    });
  } catch (err) {
    log("Permission auto-approve failed:", err.message);
  }
}

async function streamOpenCodeServerEvents({ baseUrl, conversationId, state, directory, webContents }) {
  const controller = new AbortController();
  state.abortController = controller;
  const response = await fetch(withDirectoryQuery(`${baseUrl}/event`, directory), {
    signal: controller.signal,
  });
  if (!response.ok) {
    throw new Error(await readResponseText(response) || `OpenCode event stream failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (!state.cancelled) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:\s?/, ""))
        .join("\n");
      if (!data.trim()) continue;

      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }

      if (event.type === "permission.updated") {
        const permission = event.properties || {};
        if (!state.sessionId || permission.sessionID === state.sessionId) {
          void approveOpenCodePermission(baseUrl, directory, permission.sessionID || state.sessionId, permission.id);
        }
      }

      const normalizedEvents = normalizeOpenCodeServerEvent(event, state);
      for (const normalized of normalizedEvents) {
        state.sawJsonEvent = true;
        const nextSessionId = extractSessionId(normalized);
        if (nextSessionId) state.sessionId = nextSessionId;
        log("Parsed server event type:", event.type, "as", normalized.type);
        webContents.send("agent-stream", { conversationId, event: normalized });
      }

      const sessionID = event.properties?.sessionID;
      if (
        state.promptStarted &&
        (event.type === "session.idle" || event.type === "session.status") &&
        (!sessionID || !state.sessionId || sessionID === state.sessionId) &&
        (event.type === "session.idle" || event.properties?.status?.type === "idle")
      ) {
        return;
      }
    }
  }
}

function finishOpenCodeAgent(conversationId, state, webContents, { exitCode = 0, signal = null, error = "" } = {}) {
  if (activeAgents.get(conversationId) !== state) return;
  activeAgents.delete(conversationId);
  state.done = true;
  if (state.abortController && !state.cancelled) state.abortController.abort();
  if (state.child && !state.child.killed) state.child.kill("SIGTERM");
  cleanupOpenCodeRuntime(state);
  if (error && !state.cancelled) webContents.send("agent-error", { conversationId, error });
  webContents.send("agent-done", {
    conversationId,
    exitCode,
    signal,
    provider: "opencode",
    threadId: state.sessionId,
  });
}

function startOpenCodeServerAgent({ conversationId, prompt, model, openCodeConfig, images, files, sessionId, resumeSessionId, forkSession }, webContents, openCodeBin, launchCwd) {
  const nativeSessionId = resumeSessionId || sessionId;
  const runtime = createOpenCodeRuntimeEnv(openCodeConfig, model);
  const state = {
    child: null,
    webContents,
    cancelled: false,
    done: false,
    sawJsonEvent: false,
    sessionId: nativeSessionId || null,
    cwd: launchCwd,
    serverUrl: "",
    promptStarted: false,
    abortController: null,
    partTypes: new Map(),
    partStarts: new Map(),
    partText: new Map(),
    messageRoles: new Map(),
    configCleanup: runtime.cleanup,
  };

  activeAgents.set(conversationId, state);

  (async () => {
    const port = await getAvailablePort();
    if (state.cancelled) return;

    const args = ["serve", "--hostname", "127.0.0.1", "--port", String(port)];
    log("Starting opencode server-stream agent:", { conversationId, model, cwd: launchCwd, sessionId: nativeSessionId || null });
    log("Server args:", args.join(" "));

    const child = spawnCli(openCodeBin, args, {
      cwd: launchCwd,
      env: runtime.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    state.child = child;

    let stderrBuffer = "";
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      log("serve stderr:", text.trim());
      stderrBuffer += text;
    });
    child.on("close", (exitCode, signal) => {
      if (state.done || activeAgents.get(conversationId) !== state) return;
      if (state.cancelled) {
        finishOpenCodeAgent(conversationId, state, webContents, { exitCode, signal });
        return;
      }
      const error = stderrBuffer.trim() || `OpenCode server exited: ${exitCode ?? signal ?? "unknown"}`;
      finishOpenCodeAgent(conversationId, state, webContents, { exitCode: exitCode ?? -1, signal, error });
    });
    child.on("error", (err) => {
      if (state.done || activeAgents.get(conversationId) !== state) return;
      finishOpenCodeAgent(conversationId, state, webContents, { exitCode: -1, error: err.message });
    });

    const baseUrl = await waitForOpenCodeServerUrl(child, state, port);
    state.serverUrl = baseUrl;
    log("OpenCode server ready:", baseUrl);

    const streamPromise = streamOpenCodeServerEvents({
      baseUrl,
      conversationId,
      state,
      directory: launchCwd,
      webContents,
    });

    let runSessionId = nativeSessionId || "";
    if (runSessionId && forkSession) {
      const forked = await openCodeRequest(baseUrl, `/session/${encodeURIComponent(runSessionId)}/fork`, {
        method: "POST",
        directory: launchCwd,
        body: {},
      });
      runSessionId = forked?.id || runSessionId;
    } else if (!runSessionId) {
      const created = await openCodeRequest(baseUrl, "/session", {
        method: "POST",
        directory: launchCwd,
        body: { title: String(prompt || "").slice(0, 80) || "RayLine chat" },
      });
      runSessionId = created?.id || "";
    }

    if (!runSessionId) throw new Error("OpenCode server did not create a session.");
    state.sessionId = runSessionId;

    const fullPrompt = buildRayLinePrompt(prompt, files);
    const body = {
      parts: buildPromptParts(fullPrompt, images),
    };
    const parsedModel = parseOpenCodeModel(model);
    if (parsedModel) body.model = parsedModel;

    log("Starting opencode prompt_async:", { conversationId, sessionId: runSessionId, model });
    await openCodeRequest(baseUrl, `/session/${encodeURIComponent(runSessionId)}/prompt_async`, {
      method: "POST",
      directory: launchCwd,
      body,
    });
    state.promptStarted = true;

    await streamPromise;
    if (!state.cancelled) {
      finishOpenCodeAgent(conversationId, state, webContents, { exitCode: 0 });
    }
  })().catch((err) => {
    if (state.cancelled || activeAgents.get(conversationId) !== state) return;
    finishOpenCodeAgent(conversationId, state, webContents, { exitCode: -1, error: err.message });
  });

  return state;
}

function startOpenCodeAgent({ conversationId, prompt, model, thinking, openCodeConfig, cwd, images, files, sessionId, resumeSessionId, forkSession }, webContents) {
  cancelOpenCodeAgent(conversationId);

  const openCodeBin = resolveOpenCodeBin();
  if (!openCodeBin) {
    const error = "Unable to locate the OpenCode CLI binary";
    log(error);
    webContents.send("agent-error", { conversationId, error });
    webContents.send("agent-done", { conversationId, exitCode: -1, provider: "opencode" });
    return null;
  }

  let launchCwd = process.cwd();
  if (cwd && isDirectory(cwd)) {
    launchCwd = cwd;
  } else if (cwd) {
    const error = `Invalid working directory: ${cwd}`;
    log(error);
    webContents.send("agent-error", { conversationId, error });
    webContents.send("agent-done", { conversationId, exitCode: -1, provider: "opencode" });
    return null;
  }

  const args = ["run", "--format", "json", "--dangerously-skip-permissions", "--dir", launchCwd];
  const nativeSessionId = resumeSessionId || sessionId;
  const thinkingEnabled = shouldEnableThinking(model, thinking);

  if (thinkingEnabled) {
    return startOpenCodeServerAgent({ conversationId, prompt, model, openCodeConfig, cwd, images, files, sessionId, resumeSessionId, forkSession }, webContents, openCodeBin, launchCwd);
  }

  if (nativeSessionId) {
    args.push("--session", nativeSessionId);
    if (forkSession) args.push("--fork");
  }
  if (model) args.push("--model", model);
  if (thinkingEnabled) args.push("--thinking");

  const promptFiles = Array.isArray(files) ? [...files] : [];
  if (Array.isArray(images) && images.length > 0) {
    for (let i = 0; i < images.length; i += 1) {
      const dataUrl = images[i];
      const match = typeof dataUrl === "string"
        ? dataUrl.match(/^data:image\/([\w+.-]+);base64,(.+)$/)
        : null;
      if (!match) continue;
      const ext = match[1] === "jpeg" ? "jpg" : match[1];
      const tmpPath = path.join(os.tmpdir(), `rayline-opencode-img-${Date.now()}-${i}.${ext}`);
      fs.writeFileSync(tmpPath, Buffer.from(match[2], "base64"));
      promptFiles.push({ path: tmpPath });
    }
  }

  for (const file of promptFiles) {
    if (file?.path) args.push("--file", file.path);
  }

  const fullPrompt = buildRayLinePrompt(prompt, files);
  args.push("--", fullPrompt);
  const runtime = createOpenCodeRuntimeEnv(openCodeConfig, model);

  log("Starting opencode agent:", { conversationId, model, thinking: thinkingEnabled, cwd: launchCwd, sessionId: nativeSessionId || null });
  log("Full args:", args.filter((arg) => arg !== fullPrompt).join(" "));
  log("Prompt:", fullPrompt.slice(0, 100));

  const child = spawnCli(openCodeBin, args, {
    cwd: launchCwd,
    env: runtime.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const state = {
    child,
    cancelled: false,
    sawJsonEvent: false,
    sessionId: nativeSessionId || null,
    lastErrorMessage: null,
    configCleanup: runtime.cleanup,
  };

  activeAgents.set(conversationId, state);
  log("Spawned PID:", child.pid);

  let buffer = "";
  let stderrBuffer = "";

  const parseLine = (line) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line);
      state.sawJsonEvent = true;
      const nextSessionId = extractSessionId(event);
      if (nextSessionId) state.sessionId = nextSessionId;
      const error = event.type === "error" ? extractErrorMessage(event) : null;
      if (error) state.lastErrorMessage = error;
      log("Parsed event type:", event.type);
      webContents.send("agent-stream", { conversationId, event });
    } catch {
      webContents.send("agent-stream", {
        conversationId,
        event: { type: "opencode_stdout", text: `${line}\n` },
      });
    }
  };

  child.stdout.on("data", (chunk) => {
    if (activeAgents.get(conversationId) !== state) return;
    const raw = chunk.toString();
    log("stdout chunk:", raw.slice(0, 300));
    buffer += raw;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) parseLine(line);
  });

  child.stderr.on("data", (chunk) => {
    if (activeAgents.get(conversationId) !== state && !state.cancelled) return;
    const text = chunk.toString();
    log("stderr:", text);
    stderrBuffer += text;
  });

  child.on("close", (exitCode, signal) => {
    const isCurrentState = activeAgents.get(conversationId) === state;
    log("Process closed", { conversationId, exitCode, signal, cancelled: state.cancelled, current: isCurrentState });

    if (isCurrentState && buffer.trim()) {
      parseLine(buffer);
    }

    if (state.cancelled) {
      if (isCurrentState) {
        activeAgents.delete(conversationId);
        cleanupOpenCodeRuntime(state);
        webContents.send("agent-done", {
          conversationId,
          exitCode,
          signal,
          provider: "opencode",
          threadId: state.sessionId,
        });
      }
      return;
    }

    if (!isCurrentState) return;

    if (state.lastErrorMessage || shouldEmitStderrError({
      stderrBuffer,
      exitCode,
      signal,
      cancelled: state.cancelled,
      sawJsonEvent: state.sawJsonEvent,
    })) {
      const error = state.lastErrorMessage || stderrBuffer.trim();
      if (error) webContents.send("agent-error", { conversationId, error });
    }

    activeAgents.delete(conversationId);
    cleanupOpenCodeRuntime(state);
    webContents.send("agent-done", {
      conversationId,
      exitCode,
      signal,
      provider: "opencode",
      threadId: state.sessionId,
    });
  });

  child.on("error", (err) => {
    const isCurrentState = activeAgents.get(conversationId) === state;
    log("Spawn error:", err.message);
    if (isCurrentState) activeAgents.delete(conversationId);
    cleanupOpenCodeRuntime(state);
    webContents.send("agent-error", { conversationId, error: err.message });
    if (isCurrentState) {
      webContents.send("agent-done", { conversationId, exitCode: -1, provider: "opencode" });
    }
  });

  return child;
}

function cancelOpenCodeAgent(conversationId) {
  const state = activeAgents.get(conversationId);
  if (!state) return;
  if (state.cancelled) return;
  log("Cancelling opencode agent:", conversationId);
  state.cancelled = true;
  if (state.abortController) state.abortController.abort();
  if (state.serverUrl && state.sessionId) {
    void openCodeRequest(state.serverUrl, `/session/${encodeURIComponent(state.sessionId)}/abort`, {
      method: "POST",
      directory: state.cwd,
    }).catch(() => {});
  }
  if (state.child) {
    state.child.kill("SIGTERM");
  } else if (state.webContents) {
    finishOpenCodeAgent(conversationId, state, state.webContents, { signal: "SIGTERM" });
  }
}

function cancelAllOpenCode() {
  for (const [, state] of activeAgents) {
    state.cancelled = true;
    if (state.abortController) state.abortController.abort();
    if (state.child) state.child.kill("SIGTERM");
    cleanupOpenCodeRuntime(state);
  }
}

module.exports = {
  startOpenCodeAgent,
  cancelOpenCodeAgent,
  cancelAllOpenCode,
  resolveOpenCodeBin,
  buildOpenCodeEnv,
  createOpenCodeRuntimeEnv,
  shouldEnableThinking,
};
