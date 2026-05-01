const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const IS_WINDOWS = process.platform === "win32";

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function patchClaudeSettingsWin32(config, model) {
  if (!IS_WINDOWS) return;
  try {
    const claudeDir = path.join(os.homedir(), ".claude");
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }
    const settingsPath = path.join(claudeDir, "settings.json");
    
    let settings = { env: {} };
    if (fs.existsSync(settingsPath)) {
      try {
        const content = fs.readFileSync(settingsPath, "utf8");
        const cleaned = content.replace(/\/\/.*$/gm, ""); // strip line comments
        if (cleaned.trim()) {
           settings = JSON.parse(cleaned);
        }
      } catch (e) {}
    }
    
    settings.env = settings.env || {};
    
    if (config.baseURL) settings.env.ANTHROPIC_BASE_URL = config.baseURL;
    if (config.apiKey) {
      settings.env.ANTHROPIC_AUTH_TOKEN = config.apiKey;
    }
    
    if (model) {
      settings.env.ANTHROPIC_MODEL = model;
      settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
      settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL = model;
      settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;
    }
    
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  } catch (err) {
    console.warn("Failed to patch ~/.claude/settings.json:", err);
  }
}

function patchClaudeConfigWin32() {
  if (!IS_WINDOWS) return;
  try {
    const configPath = path.join(os.homedir(), ".claude.json");
    let config = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      } catch (e) {}
    }
    config.hasCompletedOnboarding = true;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  } catch (err) {
    console.warn("Failed to patch .claude.json:", err);
  }
}



function normalizeOpenAIBaseURL(value) {
  const raw = safeString(value).replace(/\/+$/, "");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, "");
    if (!path || path === "/") {
      url.pathname = "/v1";
      return url.toString().replace(/\/+$/, "");
    }
    if (path.split("/").pop() !== "v1") {
      url.pathname = `${path}/v1`;
    } else {
      url.pathname = path;
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return raw;
  }
}

function normalizeProviderUpstreamConfig(input, provider) {
  if (!input || typeof input !== "object") return null;
  const normalizedProvider = safeString(input.provider || provider).toLowerCase();
  if (provider && normalizedProvider !== provider) return null;

  const baseURL = safeString(input.baseURL || input.baseUrl);
  const apiKey = safeString(input.apiKey);
  const modelList = Array.isArray(input.modelList)
    ? input.modelList.map((model) => safeString(model)).filter(Boolean)
    : [];
  if (!baseURL && !apiKey && modelList.length === 0) return null;

  return {
    provider: normalizedProvider,
    baseURL,
    apiKey,
    modelList,
  };
}

function buildClaudeUpstreamEnv(input) {
  const config = normalizeProviderUpstreamConfig(input, "claude");
  if (!config) return {};

  const env = {};
  if (config.baseURL) env.ANTHROPIC_BASE_URL = config.baseURL;
  if (config.apiKey) {
    env.ANTHROPIC_AUTH_TOKEN = config.apiKey;
    env.ANTHROPIC_API_KEY = "";
  }
  return env;
}

function cleanCodexProviderKey(raw) {
  const cleaned = safeString(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "rayline";
}

function joinOpenAIPath(baseURL, path) {
  const url = new URL(baseURL);
  const basePath = url.pathname.replace(/\/+$/, "");
  const suffix = safeString(path).replace(/^\/+/, "");
  url.pathname = `${basePath}/${suffix}`;
  return url.toString();
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function parseSseBlock(block) {
  const eventLines = [];
  const dataLines = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.startsWith("event:")) eventLines.push(line.slice(6).trimStart());
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  return {
    event: eventLines[eventLines.length - 1] || "",
    data: dataLines.join("\n"),
  };
}

function responsesContentToChatContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "input_text" || item.type === "output_text" || typeof item.text === "string") {
      parts.push({ type: "text", text: safeString(item.text) });
      continue;
    }
    const imageUrl = item.image_url?.url || item.image_url || item.url;
    if (item.type === "input_image" && imageUrl) {
      parts.push({ type: "image_url", image_url: { url: imageUrl } });
    }
  }

  const hasImages = parts.some((part) => part.type === "image_url");
  if (hasImages) return parts.filter((part) => part.type === "image_url" || part.text);
  return parts.map((part) => part.text).filter(Boolean).join("\n");
}

function responsesInputToChatMessages(body) {
  const messages = [];
  const instructions = safeString(body.instructions);
  if (instructions) {
    messages.push({ role: "system", content: instructions });
  }

  const input = Array.isArray(body.input) ? body.input : [{ type: "message", role: "user", content: body.input || "" }];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "message") {
      const role = item.role === "assistant" ? "assistant" : item.role === "tool" ? "tool" : item.role === "user" ? "user" : "system";
      messages.push({ role, content: responsesContentToChatContent(item.content) });
    } else if (item.type === "function_call") {
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: safeString(item.call_id) || safeString(item.id) || `call_${messages.length}`,
          type: "function",
          function: {
            name: safeString(item.name) || "tool",
            arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments || {}),
          },
        }],
      });
    } else if (item.type === "function_call_output") {
      messages.push({
        role: "tool",
        tool_call_id: safeString(item.call_id) || safeString(item.id),
        content: typeof item.output === "string" ? item.output : JSON.stringify(item.output ?? ""),
      });
    }
  }

  return messages;
}

function responsesToolsToChatTools(tools) {
  if (!Array.isArray(tools)) return undefined;
  const converted = tools
    .filter((tool) => tool?.type === "function" && tool.name)
    .map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: tool.parameters || { type: "object", properties: {} },
        ...(typeof tool.strict === "boolean" ? { strict: tool.strict } : {}),
      },
    }));
  return converted.length ? converted : undefined;
}

function buildChatRequestBody(body) {
  const chatBody = {
    model: body.model,
    messages: responsesInputToChatMessages(body),
    stream: Boolean(body.stream),
  };

  const tools = responsesToolsToChatTools(body.tools);
  if (tools) {
    chatBody.tools = tools;
    if (body.tool_choice) chatBody.tool_choice = body.tool_choice;
    if (typeof body.parallel_tool_calls === "boolean") {
      chatBody.parallel_tool_calls = body.parallel_tool_calls;
    }
  }
  if (typeof body.temperature === "number") chatBody.temperature = body.temperature;
  if (typeof body.top_p === "number") chatBody.top_p = body.top_p;
  if (Number.isFinite(body.max_output_tokens)) chatBody.max_tokens = body.max_output_tokens;
  if (chatBody.stream) chatBody.stream_options = { include_usage: true };

  return chatBody;
}

function createResponseShell(body, status = "in_progress", output = [], usage = null) {
  return {
    id: `resp_${crypto.randomUUID()}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status,
    model: body.model,
    output,
    ...(usage ? { usage } : {}),
  };
}

function chatUsageToResponsesUsage(usage) {
  if (!usage || typeof usage !== "object") return undefined;
  const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: usage.total_tokens ?? inputTokens + outputTokens,
    input_tokens_details: {
      cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens ?? 0,
    },
  };
}

function chatMessageToResponseOutput(message) {
  const output = [];
  const text = safeString(message?.content);
  if (text) {
    output.push({
      id: `msg_${crypto.randomUUID()}`,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text, annotations: [] }],
    });
  }
  for (const toolCall of message?.tool_calls || []) {
    output.push({
      id: safeString(toolCall.id) || `fc_${crypto.randomUUID()}`,
      type: "function_call",
      status: "completed",
      call_id: safeString(toolCall.id) || `call_${crypto.randomUUID()}`,
      name: safeString(toolCall.function?.name) || "tool",
      arguments: typeof toolCall.function?.arguments === "string" ? toolCall.function.arguments : "{}",
    });
  }
  return output;
}

function chatCompletionToResponse(body, chatCompletion) {
  const message = chatCompletion?.choices?.[0]?.message || {};
  const output = chatMessageToResponseOutput(message);
  return createResponseShell(body, "completed", output, chatUsageToResponsesUsage(chatCompletion?.usage));
}

function shouldFallbackResponses(status, text) {
  if (status === 404) return true;
  return /not implemented|convert_request_failed|responses?.*(unsupported|not supported|not implemented)|unsupported.*responses?/i.test(text || "");
}

function upstreamHeaders(req, config, extra = {}) {
  const headers = {
    "content-type": "application/json",
    ...extra,
  };
  if (config.apiKey) {
    headers.authorization = `Bearer ${config.apiKey}`;
  } else if (req.headers.authorization) {
    headers.authorization = req.headers.authorization;
  }
  return headers;
}

async function proxyReadable(upstreamResponse, res) {
  res.writeHead(upstreamResponse.status, {
    "content-type": upstreamResponse.headers.get("content-type") || "application/json",
  });
  if (!upstreamResponse.body) {
    res.end(await upstreamResponse.text());
    return;
  }
  for await (const chunk of upstreamResponse.body) {
    res.write(Buffer.from(chunk));
  }
  res.end();
}

async function handleChatJsonFallback(req, res, config, body) {
  const chatResponse = await fetch(joinOpenAIPath(config.baseURL, "/chat/completions"), {
    method: "POST",
    headers: upstreamHeaders(req, config),
    body: JSON.stringify({ ...buildChatRequestBody(body), stream: false }),
  });
  const text = await chatResponse.text();
  if (!chatResponse.ok) {
    res.writeHead(chatResponse.status, { "content-type": chatResponse.headers.get("content-type") || "application/json" });
    res.end(text);
    return;
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    sendJson(res, 502, { error: { message: "Upstream returned invalid JSON" } });
    return;
  }
  sendJson(res, 200, chatCompletionToResponse(body, payload));
}

async function handleChatStreamFallback(req, res, config, body) {
  const chatResponse = await fetch(joinOpenAIPath(config.baseURL, "/chat/completions"), {
    method: "POST",
    headers: upstreamHeaders(req, config, { accept: "text/event-stream" }),
    body: JSON.stringify(buildChatRequestBody({ ...body, stream: true })),
  });

  if (!chatResponse.ok) {
    res.writeHead(chatResponse.status, { "content-type": chatResponse.headers.get("content-type") || "application/json" });
    res.end(await chatResponse.text());
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });

  const responseBase = createResponseShell(body);
  sendSse(res, "response.created", { type: "response.created", response: responseBase });
  sendSse(res, "response.in_progress", { type: "response.in_progress", response: responseBase });

  const output = [];
  let usage = null;
  let buffer = "";
  let messageItem = null;
  let messageText = "";
  let nextOutputIndex = 0;
  const toolCalls = new Map();

  function publicItem(item) {
    const { output_index, ...rest } = item;
    return rest;
  }

  function ensureMessageItem() {
    if (messageItem) return messageItem;
    messageItem = {
      id: `msg_${crypto.randomUUID()}`,
      type: "message",
      status: "in_progress",
      role: "assistant",
      content: [],
      output_index: nextOutputIndex++,
    };
    sendSse(res, "response.output_item.added", { type: "response.output_item.added", output_index: messageItem.output_index, item: publicItem(messageItem) });
    sendSse(res, "response.content_part.added", {
      type: "response.content_part.added",
      item_id: messageItem.id,
      output_index: messageItem.output_index,
      content_index: 0,
      part: { type: "output_text", text: "", annotations: [] },
    });
    return messageItem;
  }

  function appendMessageDelta(delta) {
    if (!delta) return;
    const item = ensureMessageItem();
    messageText += delta;
    sendSse(res, "response.output_text.delta", {
      type: "response.output_text.delta",
      item_id: item.id,
      output_index: item.output_index,
      content_index: 0,
      delta,
    });
  }

  function ensureToolCall(index, delta = {}) {
    if (toolCalls.has(index)) return toolCalls.get(index);
    const callId = safeString(delta.id) || `call_${crypto.randomUUID()}`;
    const item = {
      id: `fc_${crypto.randomUUID()}`,
      type: "function_call",
      status: "in_progress",
      call_id: callId,
      name: safeString(delta.function?.name) || "tool",
      arguments: "",
      output_index: nextOutputIndex++,
    };
    toolCalls.set(index, item);
    sendSse(res, "response.output_item.added", {
      type: "response.output_item.added",
      output_index: item.output_index,
      item: publicItem(item),
    });
    return item;
  }

  function appendToolDelta(delta) {
    const index = Number.isFinite(delta.index) ? delta.index : 0;
    const item = ensureToolCall(index, delta);
    if (delta.id && !item.call_id) item.call_id = delta.id;
    if (delta.function?.name) item.name = delta.function.name;
    if (typeof delta.function?.arguments === "string" && delta.function.arguments) {
      item.arguments += delta.function.arguments;
      sendSse(res, "response.function_call_arguments.delta", {
        type: "response.function_call_arguments.delta",
        item_id: item.id,
        output_index: item.output_index,
        delta: delta.function.arguments,
      });
    }
  }

  function finishOutputItems() {
    if (messageItem) {
      const completed = {
        ...messageItem,
        status: "completed",
        content: [{ type: "output_text", text: messageText, annotations: [] }],
      };
      sendSse(res, "response.output_text.done", {
        type: "response.output_text.done",
        item_id: completed.id,
        output_index: completed.output_index,
        content_index: 0,
        text: messageText,
      });
      sendSse(res, "response.content_part.done", {
        type: "response.content_part.done",
        item_id: completed.id,
        output_index: completed.output_index,
        content_index: 0,
        part: completed.content[0],
      });
      sendSse(res, "response.output_item.done", { type: "response.output_item.done", output_index: completed.output_index, item: publicItem(completed) });
      output.push(completed);
      messageItem = null;
    }

    for (const item of [...toolCalls.values()].sort((a, b) => a.output_index - b.output_index)) {
      const completed = { ...item, status: "completed" };
      sendSse(res, "response.function_call_arguments.done", {
        type: "response.function_call_arguments.done",
        item_id: completed.id,
        output_index: completed.output_index,
        arguments: completed.arguments,
      });
      sendSse(res, "response.output_item.done", { type: "response.output_item.done", output_index: completed.output_index, item: publicItem(completed) });
      output.push(completed);
    }
    toolCalls.clear();
  }

  async function processBlock(block) {
    const parsed = parseSseBlock(block);
    if (!parsed.data || parsed.data === "[DONE]") return;
    let chunk;
    try {
      chunk = JSON.parse(parsed.data);
    } catch {
      return;
    }
    if (chunk.usage) usage = chatUsageToResponsesUsage(chunk.usage);
    for (const choice of chunk.choices || []) {
      const delta = choice.delta || {};
      if (typeof delta.content === "string") appendMessageDelta(delta.content);
      for (const toolCallDelta of delta.tool_calls || []) appendToolDelta(toolCallDelta);
    }
  }

  for await (const rawChunk of chatResponse.body) {
    buffer += Buffer.from(rawChunk).toString("utf8");
    buffer = buffer.replace(/\r\n/g, "\n");
    let index = buffer.indexOf("\n\n");
    while (index >= 0) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      await processBlock(block);
      index = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim()) await processBlock(buffer);

  finishOutputItems();
  sendSse(res, "response.completed", {
    type: "response.completed",
    response: {
      ...responseBase,
      status: "completed",
      output: output.sort((a, b) => a.output_index - b.output_index).map(publicItem),
      usage: usage || { input_tokens: 0, output_tokens: 0, total_tokens: 0, input_tokens_details: { cached_tokens: 0 } },
    },
  });
  res.end();
}

function startCodexResponsesBridge(input) {
  const config = normalizeProviderUpstreamConfig(input, "codex");
  if (!config?.baseURL) return Promise.resolve(null);
  const bridgeConfig = {
    ...config,
    baseURL: normalizeOpenAIBaseURL(config.baseURL),
  };
  const bridgeApiKey = `rayline-bridge-${crypto.randomBytes(18).toString("hex")}`;
  const state = { responsesUnsupported: false };

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== "POST" || !new URL(req.url, "http://127.0.0.1").pathname.endsWith("/responses")) {
        sendJson(res, 404, { error: { message: "Not found" } });
        return;
      }

      const rawBody = await readRequestBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      if (!state.responsesUnsupported) {
        const upstreamResponse = await fetch(joinOpenAIPath(bridgeConfig.baseURL, "/responses"), {
          method: "POST",
          headers: upstreamHeaders(req, bridgeConfig, { accept: req.headers.accept || "application/json" }),
          body: JSON.stringify(body),
        });
        if (upstreamResponse.ok) {
          await proxyReadable(upstreamResponse, res);
          return;
        }
        const text = await upstreamResponse.text();
        if (!shouldFallbackResponses(upstreamResponse.status, text)) {
          res.writeHead(upstreamResponse.status, { "content-type": upstreamResponse.headers.get("content-type") || "application/json" });
          res.end(text);
          return;
        }
        state.responsesUnsupported = true;
      }

      if (body.stream || String(req.headers.accept || "").includes("text/event-stream")) {
        await handleChatStreamFallback(req, res, bridgeConfig, body);
      } else {
        await handleChatJsonFallback(req, res, bridgeConfig, body);
      }
    } catch (error) {
      if (!res.headersSent) {
        sendJson(res, 502, { error: { message: error?.message || "Codex upstream bridge failed" } });
      } else {
        res.end();
      }
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        resolve(null);
        return;
      }

      resolve({
        apiKey: bridgeApiKey,
        baseURL: `http://127.0.0.1:${address.port}/v1`,
        targetBaseURL: bridgeConfig.baseURL,
        close: () => server.close(),
      });
    });
  });
}

async function appendCodexUpstreamArgs(args, input, model, options = {}) {
  const config = normalizeProviderUpstreamConfig(input, "codex");
  if (!config || !config.baseURL) return null;

  const bridge = options.bridge === false ? null : await startCodexResponsesBridge(config);
  const baseURL = bridge?.baseURL || normalizeOpenAIBaseURL(config.baseURL);
  const key = cleanCodexProviderKey(baseURL);
  
  const models = Array.from(new Set([...config.modelList, model].filter(Boolean)));

  if (IS_WINDOWS) {
    // Revert to non-windows logic for Codex, because Codex uses proxy and model_providers
    args.push("-c", `model_provider=${JSON.stringify(key)}`);
    args.push("-c", `model_providers.${key}.name=${JSON.stringify(key)}`);
    args.push("-c", `model_providers.${key}.base_url=${JSON.stringify(baseURL)}`);
    args.push("-c", `model_providers.${key}.wire_api=${JSON.stringify("responses")}`);
    args.push("-c", `model_providers.${key}.env_key=${JSON.stringify("OPENAI_API_KEY")}`);
    if (models.length > 0) {
      args.push("-c", `model_providers.${key}.models=${JSON.stringify(models)}`);
    }
  } else {
    args.push("-c", `model_provider=${JSON.stringify(key)}`);
    args.push("-c", `model_providers.${key}.name=${JSON.stringify(key)}`);
    args.push("-c", `model_providers.${key}.base_url=${JSON.stringify(baseURL)}`);
    args.push("-c", `model_providers.${key}.wire_api=${JSON.stringify("responses")}`);
    args.push("-c", `model_providers.${key}.env_key=${JSON.stringify("OPENAI_API_KEY")}`);
    if (models.length > 0) {
      args.push("-c", `model_providers.${key}.models=${JSON.stringify(models)}`);
    }
  }
  
  return { ...config, baseURL, targetBaseURL: bridge?.targetBaseURL || normalizeOpenAIBaseURL(config.baseURL), providerKey: key, bridge };
}

function appendClaudeUpstreamArgs(args, input, model) {
  const config = normalizeProviderUpstreamConfig(input, "claude");
  if (!config || !config.baseURL) return null;

  const baseURL = config.baseURL;
  const key = cleanCodexProviderKey(baseURL); // reuse the same sanitization logic
  
  const models = Array.from(new Set([...config.modelList, model].filter(Boolean)));

  if (IS_WINDOWS) {
    // 1. Write environment variables to ~/.claude/settings.json
    patchClaudeSettingsWin32({ baseURL, apiKey: config.apiKey }, model);
    
    // 2. Mark onboarding as completed
    patchClaudeConfigWin32();
  }
  // On Mac/Linux, we don't modify args because buildClaudeUpstreamEnv sets ANTHROPIC_BASE_URL.
  // Actually, we could do `-c` here for Mac too, but it's working fine currently.

  return { ...config, baseURL, providerKey: key };
}

function buildCodexUpstreamEnv(input, runtime = null) {
  if (runtime?.bridge?.apiKey) return { OPENAI_API_KEY: runtime.bridge.apiKey };
  const config = normalizeProviderUpstreamConfig(input, "codex");
  if (!config?.apiKey) return {};
  return { OPENAI_API_KEY: config.apiKey };
}

function summarizeProviderUpstream(input, provider) {
  const config = normalizeProviderUpstreamConfig(input, provider);
  if (!config) return null;
  return {
    provider: config.provider,
    hasBaseURL: Boolean(config.baseURL),
    hasApiKey: Boolean(config.apiKey),
    modelCount: config.modelList.length,
  };
}

module.exports = {
  buildClaudeUpstreamEnv,
  appendCodexUpstreamArgs,
  appendClaudeUpstreamArgs,
  buildCodexUpstreamEnv,
  normalizeOpenAIBaseURL,
  normalizeProviderUpstreamConfig,
  summarizeProviderUpstream,
  patchClaudeSettingsWin32,
  patchClaudeConfigWin32,
  cleanCodexProviderKey,
};
