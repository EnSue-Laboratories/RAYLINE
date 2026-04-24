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
        } catch {}
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
        } catch {}
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
        await startOpenCodeCLIAgent({ binary: modelId, providerKey, conversationId, prompt, messages, webContents, controller });
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
  const wsUrl = baseUrl.replace(/^http/, "ws") + "/acp";
  const apiKey = providerKey?.apiKey;
  log("Connecting to OpenCode:", wsUrl);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, {
      headers: apiKey ? { "Authorization": `Bearer ${apiKey}` } : {},
    });

    let sessionId = null;
    let initialized = false;
    let requestId = 1;

    const send = (method, params) => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: requestId++, method, params }));
    };

    ws.on("open", () => {
      send("initialize", { protocolVersion: "1", capabilities: {} });
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.error) {
        webContents.send("agent-error", { conversationId, error: msg.error.message || "OpenCode error" });
        ws.close();
        return;
      }

      if (!initialized && msg.method === undefined) {
        // Initialize response
        initialized = true;
        send("session/new", { workingDirectory: process.cwd() });
        return;
      }

      if (initialized && !sessionId && msg.result?.sessionId) {
        sessionId = msg.result.sessionId;
        // Start the chat
        send("session/chat", { sessionId, message: prompt });
        return;
      }

      // Handle stream events from ACP
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

async function startOpenCodeCLIAgent({ binary: providedBinary, providerKey, conversationId, prompt, messages, webContents, controller }) {
  const binary = providedBinary || "opencode";
  
  const env = { ...process.env, NO_COLOR: "1" };
  if (providerKey?.apiKey) {
    // Inject based on likely provider
    if (providerKey.id === "anthropic" || providerKey.name?.toLowerCase().includes("anthropic")) {
      env.ANTHROPIC_API_KEY = providerKey.apiKey;
    } else {
      env.OPENAI_API_KEY = providerKey.apiKey;
    }
  }
  if (providerKey?.baseUrl) {
    env.OPENAI_BASE_URL = providerKey.baseUrl;
  }

  log("Spawning OpenCode CLI:", binary, "with injected env vars");

  return new Promise((resolve, reject) => {
    const cp = spawn(binary, ["acp"], {
      cwd: process.cwd(),
      env,
    });

    const agentEntry = activeAgents.get(conversationId);
    if (agentEntry) agentEntry.cp = cp;

    let sessionId = null;
    let initialized = false;
    let requestId = 1;
    let buffer = "";

    const send = (method, params) => {
      cp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId++, method, params }) + "\n");
    };

    cp.stdout.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.error) {
            webContents.send("agent-error", { conversationId, error: msg.error.message || "OpenCode CLI error" });
            cp.kill();
            return;
          }

          if (!initialized && msg.method === undefined) {
            initialized = true;
            send("session/new", { workingDirectory: process.cwd() });
            return;
          }

          if (initialized && !sessionId && msg.result?.sessionId) {
            sessionId = msg.result.sessionId;
            send("session/chat", { sessionId, message: prompt });
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
              cp.kill();
            }
          }
        } catch (e) {
          log("Failed to parse ACP line:", line, e.message);
        }
      }
    });

    cp.stderr.on("data", (data) => {
      log("OpenCode CLI stderr:", data.toString());
    });

    cp.on("close", (code) => {
      log("OpenCode CLI closed with code:", code);
      resolve();
    });

    cp.on("error", (err) => {
      log("OpenCode CLI spawn error:", err.message);
      reject(err);
    });

    controller.signal.addEventListener("abort", () => {
      cp.kill();
    });
  });
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
  const { apiKey: providedKey, baseUrl: providedBaseUrl, endpoint, modelId, providerId } = opts;
  
  let apiKey = providedKey;
  let baseUrl = providedBaseUrl;
  
  // If editing existing, try to get key/baseUrl from store if not provided
  if (providerId && (!apiKey || !baseUrl)) {
    const { getByokKeyForProvider } = require("./byok-store.cjs");
    const stored = getByokKeyForProvider(providerId);
    if (stored) {
      if (!apiKey) apiKey = stored.apiKey;
      if (!baseUrl) baseUrl = stored.baseUrl;
    }
  }

  if (!apiKey) return { ok: false, error: "API key is required for testing" };

  const isAnthropic = endpoint === "anthropic" || (endpoint === "custom" && baseUrl?.includes("anthropic"));
  const url = isAnthropic ? `${baseUrl}/v1/messages` : `${baseUrl}/v1/chat/completions`;

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

    const response = await fetch(url, {
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

module.exports = { startByokAgent, cancelByokAgent, cancelAllByok, testByokConnectivity };
