const { getByokKeyForProvider } = require("./byok-store.cjs");

const activeAgents = new Map();

function log(...args) {
  console.log("[byok-agent-manager]", ...args);
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
    apiMessages.push({ role: "user", content: prompt });
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
    apiMessages.push({ role: "user", content: prompt });
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

async function streamAnthropicSSE({ baseUrl, apiKey, body, conversationId, webContents, controller }) {
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/messages`;
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
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
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

      if (isAnthropic) {
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

function cancelByokAgent(conversationId) {
  const agent = activeAgents.get(conversationId);
  if (agent) {
    log("Cancelling BYOK agent:", conversationId);
    agent.controller.abort();
    activeAgents.delete(conversationId);
  }
}

function cancelAllByok() {
  for (const [id, agent] of activeAgents) {
    agent.controller.abort();
    activeAgents.delete(id);
  }
}

module.exports = { startByokAgent, cancelByokAgent, cancelAllByok };
