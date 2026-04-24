/**
 * BYOK (Bring Your Own Key) Agent Manager
 * 
 * DESIGN PHILOSOPHY:
 * This manager implements a dual-path architecture for custom model providers:
 * 
 * 1. SIMPLE STREAMING (SSE): 
 *    Used for standard OpenAI/Anthropic-compatible APIs. It performs a single-turn 
 *    request/response with text streaming. This is ideal for lightweight chat 
 *    and quick answers.
 * 
 * 2. AGENTIC LOOP (ACP - Agent Client Protocol):
 *    Used for "OpenCode" style integrations. Instead of a simple API call, it 
 *    connects to an external agent server (like OpenCode) via WebSockets. 
 *    This enables the full "Observe-Plan-Act" cycle, allowing any model 
 *    (including local ones via Ollama/Groq) to use terminal tools, edit files, 
 *    and run commands within the RAYLINE UI.
 * 
 * This approach makes RAYLINE model-agnostic while preserving the deep 
 * agentic capabilities originally designed for Claude Code.
 */
const { getByokKeyForProvider } = require("./byok-store.cjs");
const WebSocket = require("ws");
const { spawn } = require("child_process");
const { buildSpawnPath, spawnCli } = require("./cli-bin-resolver.cjs");

const activeAgents = new Map();

function log(...args) {
  try {
    const { log: loggerLog } = require("./logger.cjs");
    loggerLog("[byok-agent-manager]", ...args);
  } catch (e) {
    console.log("[byok-agent-manager]", ...args);
  }
}

function parseByokModelId(id) {
  if (!id || typeof id !== "string" || !id.startsWith("byok:")) return null;
  const parts = id.split(":");
  if (parts.length < 3) return null;
  return { endpoint: parts[1], modelId: parts.slice(2).join(":") };
}

function buildAnthropicRequest({ modelId, prompt, messages, systemPrompt }) {
  const apiMessages = [];

  // Build conversation history
  if (messages && messages.length > 0) {
    for (const msg of messages) {
      if (msg.role === "user" || msg.role === "assistant") {
        const text = typeof msg.text === "string" ? msg.text :
          Array.isArray(msg.parts) ? msg.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n") : "";
        if (text) apiMessages.push({ role: msg.role, content: text });
      }
    }
  }

  // Add current prompt
  if (prompt) {
    const lastMsg = apiMessages[apiMessages.length - 1];
    if (lastMsg && lastMsg.role === "user") {
      lastMsg.content = prompt;
    } else {
      apiMessages.push({ role: "user", content: prompt });
    }
  }

  return {
    model: modelId,
    max_tokens: 8192,
    stream: true,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: apiMessages,
  };
}

function buildOpenAIRequest({ modelId, prompt, messages, systemPrompt }) {
  const apiMessages = [];

  if (systemPrompt) {
    apiMessages.push({ role: "system", content: systemPrompt });
  }

  // Build conversation history
  if (messages && messages.length > 0) {
    for (const msg of messages) {
      if (msg.role === "user" || msg.role === "assistant") {
        const text = typeof msg.text === "string" ? msg.text :
          Array.isArray(msg.parts) ? msg.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n") : "";
        if (text) apiMessages.push({ role: msg.role, content: text });
      }
    }
  }

  // Add current prompt
  if (prompt) {
    const lastMsg = apiMessages[apiMessages.length - 1];
    if (lastMsg && lastMsg.role === "user") {
      lastMsg.content = prompt;
    } else {
      apiMessages.push({ role: "user", content: prompt });
    }
  }

  return {
    model: modelId,
    stream: true,
    messages: apiMessages,
  };
}

const BYOK_SYSTEM_PROMPT = `You are running inside RayLine, a desktop GUI client.
The user is interacting via a chat interface, not a terminal.
Keep responses concise and conversational.
Use markdown formatting — the client renders headings, code blocks, tables, lists, and mermaid diagrams.
For math, use LaTeX: $inline$ and $$block$$. Never wrap LaTeX in code blocks.`;

function buildEndpointUrl(base, suffix) {
  let url = base.replace(/\/+$/, "");
  if (url.endsWith(suffix)) return url;
  if (url.endsWith("/v1") && suffix.startsWith("/v1/")) {
    return url + suffix.slice(3);
  }
  return url + suffix;
}

async function streamAnthropicSSE({ baseUrl, apiKey, body, conversationId, webContents, controller }) {
  const url = buildEndpointUrl(baseUrl, "/v1/messages");
  log("Anthropic request:", url, "model:", body.model);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const event = JSON.parse(data);
          // Forward Anthropic SSE events directly — they match Claude CLI's
          // stream_event format (content_block_start, content_block_delta, etc.)
          webContents.send("agent-stream", {
            conversationId,
            event: { type: "stream_event", event },
          });
        } catch { }
      }
    }
  }
}

async function streamOpenAISSE({ baseUrl, apiKey, body, conversationId, webContents, controller }) {
  const url = buildEndpointUrl(baseUrl, "/v1/chat/completions");
  log("OpenAI request:", url, "model:", body.model);

  const headers = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  // Emit a content_block_start to initialize the text block
  webContents.send("agent-stream", {
    conversationId,
    event: {
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    },
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const chunk = JSON.parse(data);
          const delta = chunk.choices?.[0]?.delta;

          if (delta?.content) {
            webContents.send("agent-stream", {
              conversationId,
              event: {
                type: "stream_event",
                event: {
                  type: "content_block_delta",
                  index: 0,
                  delta: { type: "text_delta", text: delta.content },
                },
              },
            });
          }

          if (chunk.usage) {
            usage = {
              input_tokens: chunk.usage.prompt_tokens || 0,
              output_tokens: chunk.usage.completion_tokens || 0,
            };
          }
        } catch { }
      }
    }
  }

  // Emit content_block_stop
  webContents.send("agent-stream", {
    conversationId,
    event: { type: "stream_event", event: { type: "content_block_stop", index: 0 } },
  });

  // Emit usage via message_delta if available
  if (usage) {
    webContents.send("agent-stream", {
      conversationId,
      event: { type: "stream_event", event: { type: "message_delta", usage } },
    });
  }
}

function startByokAgent(opts, webContents) {
  const { conversationId, prompt, model, messages } = opts;
  const parsed = parseByokModelId(model);
  if (!parsed) {
    webContents.send("agent-error", { conversationId, error: `Invalid BYOK model ID: ${model}` });
    webContents.send("agent-done", { conversationId, exitCode: 1 });
    return;
  }

  const { endpoint, modelId } = parsed;

  // Resolve API key — for built-in providers, use the provider id directly;
  // for custom providers, the endpoint IS the provider id
  const providerKey = getByokKeyForProvider(endpoint);
  if (!providerKey && endpoint !== "anthropic" && endpoint !== "openai") {
    // Try loading all providers and find by id prefix match
    // Custom providers have ids like "custom-ollama-1234"
  }

  if (!providerKey) {
    webContents.send("agent-error", { conversationId, error: `No API key configured for provider: ${endpoint}` });
    webContents.send("agent-done", { conversationId, exitCode: 1 });
    return;
  }

  const controller = new AbortController();
  activeAgents.set(conversationId, { controller });

  log("Starting BYOK agent:", { conversationId, endpoint, modelId });

  const run = async () => {
    try {
      const isAnthropic = endpoint === "anthropic";
      const baseUrl = providerKey.baseUrl || (isAnthropic ? "https://api.anthropic.com" : "https://api.openai.com");

      if (endpoint === "opencode") {
        await startOpenCodeAgent({ baseUrl, providerKey, modelId, conversationId, prompt, messages, webContents, controller });
      } else if (endpoint === "opencode-cli") {
        await startOpenCodeCLIAgent({
          binary: providerKey.path || "opencode",
          providerKey,
          modelId,
          provider: providerKey.provider,
          conversationId,
          prompt,
          messages,
          webContents,
          controller
        });
      } else if (isAnthropic) {
        const body = buildAnthropicRequest({ modelId, prompt, messages, systemPrompt: BYOK_SYSTEM_PROMPT });
        await streamAnthropicSSE({ baseUrl, apiKey: providerKey.apiKey, body, conversationId, webContents, controller });
      } else {
        const body = buildOpenAIRequest({ modelId, prompt, messages, systemPrompt: BYOK_SYSTEM_PROMPT });
        await streamOpenAISSE({ baseUrl, apiKey: providerKey.apiKey, body, conversationId, webContents, controller });
      }

      webContents.send("agent-stream", {
        conversationId,
        event: { type: "result", is_error: false, session_id: null },
      });
    } catch (err) {
      if (err.name === "AbortError") {
        log("BYOK agent cancelled:", conversationId);
        webContents.send("agent-stream", {
          conversationId,
          event: { type: "result", is_error: false, session_id: null, stop_reason: "cancelled" },
        });
      } else {
        log("BYOK agent error:", err.message);
        webContents.send("agent-stream", {
          conversationId,
          event: { type: "result", is_error: true, result: err.message, session_id: null },
        });
      }
    } finally {
      activeAgents.delete(conversationId);
      webContents.send("agent-done", { conversationId });
    }
  };

  run();
}

async function startOpenCodeAgent({ baseUrl, providerKey, modelId, conversationId, prompt, messages, webContents, controller }) {
  const apiKey = providerKey?.apiKey;
  const username = providerKey?.username;
  const preferredPath = providerKey?.path;

  // Potential paths to probe
  const pathsToTry = preferredPath ? [preferredPath] : ["/acp", "/v1/acp", "/"];

  const connect = async (path) => {
    const acpPath = path.replace(/^\/*/, "/");
    const wsUrl = baseUrl.replace(/^http/, "ws").replace(/\/$/, "") + acpPath;
    log("Connecting to OpenCode (probing path):", wsUrl);

    const headers = {
      "Host": new URL(baseUrl).host,
      "Origin": baseUrl,
    };
    const effectiveUsername = username || (apiKey ? "opencode" : null);

    if (effectiveUsername && apiKey) {
      const auth = Buffer.from(`${effectiveUsername}:${apiKey}`).toString("base64");
      headers["Authorization"] = `Basic ${auth}`;
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, { headers });

      let initialized = false;
      let requestId = 1;

      const send = (method, params) => {
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: requestId++, method, params }));
      };

      ws.on("open", () => {
        log("WebSocket opened on path:", acpPath);
        send("initialize", { protocolVersion: "1", capabilities: {} });
        resolve({ ws, acpPath });
      });

      ws.on("error", (err) => {
        // If it's a 200 response, it's likely a path mismatch
        if (err.message.includes("200")) {
          reject(new Error("HTTP_200"));
        } else {
          reject(err);
        }
      });
    });
  };

  let activeWs = null;

  for (const path of pathsToTry) {
    try {
      const { ws } = await connect(path);
      activeWs = ws;
      break;
    } catch (err) {
      if (err.message === "HTTP_200") {
        log(`Path ${path} returned 200, trying next...`);
        continue;
      }
      throw err;
    }
  }

  if (!activeWs) {
    log("WebSocket failed, attempting REST fallback for OpenCode...");
    return runOpenCodeRestLoop({ baseUrl, providerKey, modelId, conversationId, prompt, messages, webContents, controller });
  }

  const ws = activeWs;
  return new Promise((resolve, reject) => {
    let sessionId = null;
    let initialized = false;
    let requestId = 2; // initialize was 1

    const send = (method, params) => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: requestId++, method, params }));
    };

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.error) {
        webContents.send("agent-error", { conversationId, error: msg.error.message || "OpenCode error" });
        ws.close();
        return;
      }

      if (!initialized && msg.method === undefined) {
        initialized = true;
        send("session/new", { workingDirectory: process.cwd() });
        return;
      }

      if (initialized && !sessionId && msg.result?.sessionId) {
        sessionId = msg.result.sessionId;
        const agentEntry = activeAgents.get(conversationId);
        if (agentEntry) agentEntry.sessionId = sessionId;

        send("session/chat", {
          sessionId,
          message: prompt,
          // Convert history
          history: messages.slice(0, -1).map(m => ({
            role: m.role,
            content: m.content
          }))
        });
        return;
      }

      if (msg.method === "session/notification" && msg.params?.sessionId === sessionId) {
        const { type, delta, content_block } = msg.params;
        if (type === "content_block_start") {
          webContents.send("agent-stream", {
            conversationId,
            event: { type: "stream_event", event: { type: "content_block_start", index: 0, content_block } },
          });
        } else if (type === "content_block_delta") {
          webContents.send("agent-stream", {
            conversationId,
            event: { type: "stream_event", event: { type: "content_block_delta", index: 0, delta } },
          });
        } else if (type === "content_block_stop") {
          webContents.send("agent-stream", {
            conversationId,
            event: { type: "stream_event", event: { type: "content_block_stop", index: 0 } },
          });
        } else if (type === "chat/done" || type === "session/done") {
          ws.close();
        }
      }
    });

    ws.on("close", () => {
      log("OpenCode connection closed");
      resolve();
    });

    ws.on("error", (err) => {
      log("OpenCode connection error:", err.message);
      reject(err);
    });

    controller.signal.addEventListener("abort", () => {
      ws.close();
    });
  });
}

async function runOpenCodeRestLoop({ baseUrl, providerKey, modelId, conversationId, prompt, messages, webContents, controller }) {
  const apiKey = providerKey?.apiKey;
  const username = providerKey?.username || "opencode";
  const auth = apiKey ? Buffer.from(`${username}:${apiKey}`).toString("base64") : null;
  const sanitizedBaseUrl = baseUrl.replace(/\/$/, "");

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (auth) headers["Authorization"] = `Basic ${auth}`;

  try {
    log(`[REST] Creating session on ${sanitizedBaseUrl}...`);
    const sessionRes = await fetch(`${sanitizedBaseUrl}/session`, {
      method: "POST",
      headers,
      body: JSON.stringify({ title: `Chat ${conversationId}` })
    });

    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      throw new Error(`Session creation failed (${sessionRes.status}): ${errText}`);
    }

    const session = await sessionRes.json();
    const sessionId = session.id;
    log(`[REST] Session created: ${sessionId}. Sending prompt...`);

    const promptRes = await fetch(`${sanitizedBaseUrl}/session/${sessionId}/prompt`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt,
        model: modelId,
        history: messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
      })
    });

    if (!promptRes.ok) {
      const errText = await promptRes.text();
      throw new Error(`Prompt failed (${promptRes.status}): ${errText}`);
    }

    log("[REST] Streaming response...");

    // Use the body as an async iterator for maximum compatibility in Node/Electron
    const decoder = new TextDecoder();
    for await (const chunk of promptRes.body) {
      const text = decoder.decode(chunk, { stream: true });
      if (text) {
        webContents.send("agent-stream", {
          conversationId,
          event: { type: "content_block_delta", delta: { text } }
        });
      }
    }

    log("[REST] Response complete.");
    webContents.send("agent-done", { conversationId });
  } catch (err) {
    log("[REST] Error:", err.message);
    webContents.send("agent-error", { conversationId, error: err.message });
  }
}

async function startOpenCodeCLIAgent({ binary: providedBinary, providerKey, modelId, provider: selectedProvider, conversationId, prompt, messages, webContents, controller }) {
  const startTime = Date.now();
  const log = (...args) => console.log("[byok-agent-manager]", ...args);
  const binary = providedBinary || "opencode";

  const env = {
    ...process.env,
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    PATH: buildSpawnPath(),
  };

  if (providerKey?.apiKey) {
    const key = providerKey.apiKey;
    env.OPENAI_API_KEY = key;
    env.ANTHROPIC_API_KEY = key;
    env.DEEPSEEK_API_KEY = key;
    env.GOOGLE_API_KEY = key;
    env.GROQ_API_KEY = key;
    env.MISTRAL_API_KEY = key;
    
    // Explicit OpenCode env vars
    env.OPENCODE_API_KEY = key;

    if (providerKey.username) {
      env.OPENCODE_SERVER_USERNAME = providerKey.username;
      env.OPENCODE_SERVER_PASSWORD = key;
    }
  }

  if (providerKey?.baseUrl) {
    env.OPENAI_BASE_URL = providerKey.baseUrl;
    env.DEEPSEEK_BASE_URL = providerKey.baseUrl;
    env.ANTHROPIC_BASE_URL = providerKey.baseUrl;
    env.OPENCODE_BASE_URL = providerKey.baseUrl;
  }

  if (selectedProvider) {
    env.OPENCODE_PROVIDER = selectedProvider;
    env.OPENCODE_PROVIDER_ID = selectedProvider;
  }

  // Handle agent vs model selection
  const standardAgents = ["coder", "researcher", "open-interpreter", "interpreter", "automator"];
  if (standardAgents.includes(modelId)) {
    env.OPENCODE_AGENT = modelId;
  } else if (modelId && modelId !== "default" && modelId !== "opencode") {
    env.OPENCODE_MODEL = modelId;
  }

  const { resolveCliBin } = require("./cli-bin-resolver.cjs");
  const fullPath = resolveCliBin(binary);

  if (!fullPath) {
    throw new Error(`Could not find OpenCode binary: "${binary}". Please check your settings.`);
  }

  let pty;
  try {
    pty = require("node-pty");
  } catch (e) {
    log("node-pty failed to load:", e.message);
  }

  log(`Spawning OpenCode CLI (PTY): ${fullPath} acp (Env: Provider=${env.OPENCODE_PROVIDER || "default"}, Agent=${env.OPENCODE_AGENT || "default"})`);

  let cp;
  let isPtyActual = false;
  if (pty) {
    try {
      // Use the user's preferred shell or a standard fallback
      const shell = process.env.SHELL || "/bin/sh";
      // Simplify args for better PTY compatibility
      const command = `${fullPath} acp`;
      const args = ["-c", command];

      log(`Attempting PTY spawn: ${shell} ${args.join(" ")}`);
      log(`Env Provider: ${env.OPENCODE_PROVIDER || "default"}, Agent: ${env.OPENCODE_AGENT || "default"}, Model: ${env.OPENCODE_MODEL || "none"}`);
      
      cp = pty.spawn(shell, args, {
        name: "xterm-256color",
        cols: 100,
        rows: 30,
        cwd: process.cwd(),
        env
      });
      isPtyActual = true;
    } catch (ptyErr) {
      log("pty.spawn failed, falling back to spawnCli:", ptyErr.message);
      const { spawnCli } = require("./cli-bin-resolver.cjs");
      cp = spawnCli(fullPath, ["acp"], {
        cwd: process.cwd(),
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      isPtyActual = false;
    }
  } else {
    const { spawnCli } = require("./cli-bin-resolver.cjs");
    cp = spawnCli(fullPath, ["acp"], {
      cwd: process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    isPtyActual = false;
  }

  const agentEntry = activeAgents.get(conversationId);
  if (agentEntry) agentEntry.cp = cp;

  let buffer = "";
  let stderrBuffer = "";
  let requestId = 1;
  let hasStartedMessage = false;
  let hasStartedThought = false;

  const writeStdin = (obj) => {
    const str = JSON.stringify(obj) + "\n";
    if (isPtyActual && cp.write) {
      cp.write(str);
    } else if (cp.stdin && !cp.stdin.destroyed) {
      cp.stdin.write(str);
    }
  };

  // Perform ACP Handshake
  writeStdin({
    jsonrpc: "2.0",
    id: requestId++,
    method: "initialize",
    params: {
      protocolVersion: 1,
      capabilities: {},
      workspace_root: process.cwd(),
    }
  });

  let sessionId = null;


  const handleData = (chunk) => {
    buffer += chunk.toString();
    // PTYs use \r\n, standard spawn uses \n
    const lines = buffer.split(/\r?\n|\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        log("ACP MSG:", line.slice(0, 500));
        // PTY might include ANSI codes even if we try to disable them
        const cleanLine = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
        const msg = JSON.parse(cleanLine);

        if (msg.error) {
          log("ACP ERROR:", msg.error);
          webContents.send("agent-error", { conversationId, error: msg.error.message || "OpenCode CLI Error" });
          continue;
        }

        // Step 1: Handle Initialization response -> Create Session
        if (msg.id === 1 && msg.result) {
          log("OpenCode CLI Initialized. Creating session...");
          writeStdin({
            jsonrpc: "2.0",
            id: requestId++,
            method: "session/new",
            params: {
              cwd: process.cwd(),
              mcpServers: []
            }
          });
          continue;
        }

        // Step 2: Handle Session creation -> Start Chat
        if (msg.id === 2 && msg.result?.sessionId) {
          sessionId = msg.result.sessionId;
          log(`Session created: ${sessionId}. Starting chat...`);
          writeStdin({
            jsonrpc: "2.0",
            id: requestId++,
            method: "session/prompt",
            params: {
              sessionId,
              prompt: [{ type: "text", text: prompt }],
              history: messages.slice(0, -1).map(m => {
                const text = typeof m.text === "string" ? m.text :
                  (Array.isArray(m.parts) ? m.parts.filter(p => p.type === "text").map(p => p.text).join("\n") : "");
                return { role: m.role, content: text || "" };
              })
            }
          });
          continue;
        }

        // Step 3: Handle streaming notifications (OpenCode uses session/update)
        if (msg.method === "session/update" && msg.params?.sessionId === sessionId) {
          const update = msg.params.update || {};
          const sessionUpdate = update.sessionUpdate;
          const content = update.content || {};

          if (sessionUpdate === "agent_thought_chunk" && content.text) {
            if (!hasStartedThought) {
              webContents.send("agent-stream", {
                conversationId,
                event: { type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } } }
              });
              hasStartedThought = true;
            }
            webContents.send("agent-stream", {
              conversationId,
              event: {
                type: "stream_event",
                event: {
                  type: "content_block_delta",
                  index: 0,
                  delta: { type: "thinking_delta", thinking: content.text }
                }
              }
            });
          } else if (sessionUpdate === "agent_message_chunk" && content.text) {
            if (!hasStartedMessage) {
              webContents.send("agent-stream", {
                conversationId,
                event: { type: "stream_event", event: { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } } }
              });
              hasStartedMessage = true;
            }
            webContents.send("agent-stream", {
              conversationId,
              event: {
                type: "stream_event",
                event: {
                  type: "content_block_delta",
                  index: 1,
                  delta: { type: "text_delta", text: content.text }
                }
              }
            });
          }
        }

        // Handle completion
        if (msg.id === 3 && msg.result) {
          log("Chat session complete (from result).");

          if (hasStartedThought) {
            webContents.send("agent-stream", {
              conversationId,
              event: { type: "stream_event", event: { type: "content_block_stop", index: 0 } }
            });
          }
          if (hasStartedMessage) {
            webContents.send("agent-stream", {
              conversationId,
              event: { type: "stream_event", event: { type: "content_block_stop", index: 1 } }
            });
          }

          webContents.send("agent-stream", {
            conversationId,
            event: { 
              type: "result", 
              subtype: "success", 
              is_error: false, 
              session_id: sessionId, 
              stop_reason: msg.result.stopReason,
              duration_ms: Date.now() - startTime
            }
          });
          if (isPtyActual) {
            cp.kill();
          } else {
            cp.stdin.end();
          }
        }
      } catch (e) {
        log("Failed to parse JSON line:", line.slice(0, 100));
      }
    }
  };

  if (isPtyActual) {
    cp.onData(handleData);
    cp.onExit(({ exitCode }) => {
      activeAgents.delete(conversationId);
      webContents.send("agent-done", { conversationId, exitCode });
    });
  } else {
    cp.stdout.on("data", handleData);
    cp.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
      log("stderr:", chunk.toString());
    });
    cp.on("close", (exitCode) => {
      activeAgents.delete(conversationId);
      if (stderrBuffer && exitCode !== 0) {
        webContents.send("agent-error", { conversationId, error: stderrBuffer });
      }
      webContents.send("agent-done", { conversationId, exitCode });
    });
  }
}

function cancelByokAgent(conversationId) {
  const agent = activeAgents.get(conversationId);
  if (agent) {
    log("Cancelling BYOK agent:", conversationId);
    if (agent.controller) agent.controller.abort();
    if (agent.cp) agent.cp.kill();
    activeAgents.delete(conversationId);
  }
}

function cancelAllByok() {
  for (const [id, agent] of activeAgents) {
    if (agent.controller) agent.controller.abort();
    if (agent.cp) agent.cp.kill();
    activeAgents.delete(id);
  }
}

async function testByokConnectivity(opts) {
  const { apiKey: providedKey, baseUrl: providedBaseUrl, username, endpoint, modelId, providerId, provider } = opts;

  let apiKey = providedKey;
  let baseUrl = providedBaseUrl;
  let effectiveUsername = username;

  if (providerId && (!apiKey || !baseUrl)) {
    const stored = getByokKeyForProvider(providerId);
    if (stored) {
      if (!apiKey) apiKey = stored.apiKey;
      if (!baseUrl) baseUrl = stored.baseUrl;
      if (!effectiveUsername) effectiveUsername = stored.username;
    }
  }

  const isOpenCode = endpoint === "opencode" || endpoint === "opencode-cli" || (baseUrl && (baseUrl.includes(":4096") || baseUrl.includes("/acp")));

  if (isOpenCode) {
    if (endpoint === "opencode-cli") {
      try {
        const { execSync } = require("child_process");
        const binary = opts.binary || "opencode";
        execSync(`${binary} --version`);
        return { ok: true, message: "OpenCode binary found and working" };
      } catch (err) {
        return { ok: false, error: `OpenCode binary not found: ${err.message}. Make sure it is in your PATH.` };
      }
    }

    try {
      const acpPath = (opts.path || "/acp").replace(/^\/*/, "/");
      const url = buildEndpointUrl(baseUrl, acpPath);
      const headers = {};
      const testUsername = effectiveUsername || (apiKey ? "opencode" : null);

      if (testUsername && apiKey) {
        const auth = Buffer.from(`${testUsername}:${apiKey}`).toString("base64");
        headers["Authorization"] = `Basic ${auth}`;
      } else if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const response = await fetch(url, { method: "GET", headers });
      if (response.ok || response.status === 404 || response.status === 200) {
        return { ok: true };
      }
      return { ok: false, error: response.status === 401 ? "Unauthorized" : `HTTP ${response.status}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  if (!apiKey) return { ok: false, error: "API key is required for testing" };

  const isAnthropic = endpoint === "anthropic" || provider === "anthropic" || (endpoint === "custom" && baseUrl?.includes("anthropic"));
  const isDeepSeek = endpoint === "deepseek" || provider === "deepseek" || (endpoint === "custom" && baseUrl?.includes("deepseek"));

  const testUrl = baseUrl || (
    isAnthropic ? "https://api.anthropic.com" :
      isDeepSeek ? "https://api.deepseek.com" :
        "https://api.openai.com"
  );
  const fullUrl = isAnthropic ? `${testUrl}/v1/messages` : `${testUrl}/v1/chat/completions`;

  try {
    const body = isAnthropic ? {
      model: modelId || "claude-3-haiku-20240307",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    } : {
      model: modelId || "gpt-3.5-turbo",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    };

    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(isAnthropic ? {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        } : {
          "Authorization": `Bearer ${apiKey}`,
        }),
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return { ok: true };
    } else {
      const errorData = await response.json().catch(() => ({}));
      return { ok: false, error: errorData.error?.message || response.statusText || `HTTP ${response.status}` };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function getOpenCodeMetadata(binaryArg) {
  const binary = binaryArg || "opencode";
  try {
    const { execSync } = require("child_process");
    const output = execSync(`${binary} providers list`, { env: { ...process.env, NO_COLOR: "1", PATH: buildSpawnPath() } }).toString();

    // Simple parsing for the ASCII table output
    const providers = [];
    const lines = output.split("\n");
    for (const line of lines) {
      const match = line.match(/[●○]\s+([a-zA-Z0-9_-]+)/);
      if (match) {
        providers.push(match[1].trim());
      }
    }

    // Try to find agents in the local share dir
    const agents = ["coder", "researcher", "open-interpreter", "interpreter", "automator"];
    try {
      const fs = require("fs");
      const path = require("path");
      const agentsDir = path.join(require("os").homedir(), ".local/share/opencode/agents");
      if (fs.existsSync(agentsDir)) {
        const localAgents = fs.readdirSync(agentsDir).filter(f => !f.startsWith("."));
        localAgents.forEach(a => { if (!agents.includes(a)) agents.push(a); });
      }
    } catch { }

    // Also try to find a default model if possible
    return {
      providers: providers.length > 0 ? providers : ["openai", "anthropic", "deepseek", "google", "groq", "mistral", "ollama"],
      agents,
      success: true
    };
  } catch (err) {
    log("Failed to fetch OpenCode metadata:", err.message);
    return {
      providers: ["openai", "anthropic", "deepseek", "google", "groq", "mistral", "ollama"],
      success: false,
      error: err.message
    };
  }
}

module.exports = { startByokAgent, cancelByokAgent, cancelAllByok, testByokConnectivity, getOpenCodeMetadata };
