import { describe, expect, it } from "vitest";
import {
  buildClaudeUpstreamEnv,
  buildCodexProviderArgs,
  buildCodexUpstreamEnv,
  cleanCodexProviderKey,
  joinOpenAIPath,
  normalizeOpenAIBaseURL,
  normalizeProviderUpstreamConfig,
  summarizeProviderUpstream,
  upstreamModels,
} from "../config";
import {
  buildChatRequestBody,
  chatCompletionToResponse,
  chatUsageToResponsesUsage,
  parseSseBlock,
  responsesContentToChatContent,
  shouldFallbackResponses,
} from "../responses-chat";
import { ResponsesStreamTranslator } from "../stream-translator";

describe("upstream config", () => {
  it("normalizes and validates configs", () => {
    expect(normalizeProviderUpstreamConfig({ provider: "Codex", baseUrl: " https://x/ ", modelList: [" m1 ", ""] }, "codex")).toEqual({
      provider: "codex",
      baseURL: "https://x/",
      apiKey: "",
      modelList: ["m1"],
    });
    expect(normalizeProviderUpstreamConfig({ provider: "claude", apiKey: "k" }, "codex")).toBeNull();
    expect(normalizeProviderUpstreamConfig({ provider: "codex" }, "codex")).toBeNull();
    expect(normalizeProviderUpstreamConfig({ provider: "other", apiKey: "k" })).toBeNull();
    expect(summarizeProviderUpstream({ provider: "claude", apiKey: "k" }, "claude")).toEqual({ provider: "claude", hasBaseURL: false, hasApiKey: true, modelCount: 0 });
  });

  it("normalizes OpenAI base URLs to /v1", () => {
    expect(normalizeOpenAIBaseURL("https://api.x.com")).toBe("https://api.x.com/v1");
    expect(normalizeOpenAIBaseURL("https://api.x.com/openai/")).toBe("https://api.x.com/openai/v1");
    expect(normalizeOpenAIBaseURL("https://api.x.com/v1/")).toBe("https://api.x.com/v1");
    expect(normalizeOpenAIBaseURL("not a url")).toBe("not a url");
    expect(joinOpenAIPath("https://api.x.com/v1", "/chat/completions")).toBe("https://api.x.com/v1/chat/completions");
  });

  it("builds env and codex provider overrides", () => {
    expect(buildClaudeUpstreamEnv({ provider: "claude", baseURL: "https://a", apiKey: "k" })).toEqual({
      ANTHROPIC_BASE_URL: "https://a",
      ANTHROPIC_AUTH_TOKEN: "k",
      ANTHROPIC_API_KEY: "",
    });
    expect(buildCodexUpstreamEnv({ provider: "codex", apiKey: "k" })).toEqual({ OPENAI_API_KEY: "k" });
    expect(buildCodexUpstreamEnv({ provider: "codex", apiKey: "k" }, "bridge")).toEqual({ OPENAI_API_KEY: "bridge" });
    expect(cleanCodexProviderKey("http://127.0.0.1:5555/v1")).toBe("http_127_0_0_1_5555_v1");
    expect(upstreamModels({ provider: "codex", baseURL: "u", apiKey: "", modelList: ["a", "b"] }, "a")).toEqual(["a", "b"]);
    expect(buildCodexProviderArgs("http://h/v1", ["m"])).toEqual([
      "-c",
      'model_provider="http_h_v1"',
      "-c",
      'model_providers.http_h_v1.name="http_h_v1"',
      "-c",
      'model_providers.http_h_v1.base_url="http://h/v1"',
      "-c",
      'model_providers.http_h_v1.wire_api="responses"',
      "-c",
      'model_providers.http_h_v1.env_key="OPENAI_API_KEY"',
      "-c",
      'model_providers.http_h_v1.models=["m"]',
    ]);
  });
});

describe("Responses <-> Chat translation", () => {
  it("converts input items, tools and sampling options", () => {
    const body = buildChatRequestBody({
      model: "m",
      instructions: "sys",
      stream: true,
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] },
        { type: "function_call", call_id: "c1", name: "ls", arguments: { a: 1 } },
        { type: "function_call_output", call_id: "c1", output: "files" },
      ],
      tools: [{ type: "function", name: "ls", parameters: { type: "object" } }, { type: "web_search" }],
      max_output_tokens: 100,
      temperature: 0.2,
    });
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
      { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "ls", arguments: '{"a":1}' } }] },
      { role: "tool", tool_call_id: "c1", content: "files" },
    ]);
    expect(body.tools).toEqual([{ type: "function", function: { name: "ls", description: "", parameters: { type: "object" } } }]);
    expect(body).toMatchObject({ max_tokens: 100, temperature: 0.2, stream_options: { include_usage: true } });
  });

  it("keeps images as structured content", () => {
    expect(responsesContentToChatContent([{ type: "input_text", text: "see" }, { type: "input_image", image_url: "data:x" }])).toEqual([
      { type: "text", text: "see" },
      { type: "image_url", image_url: { url: "data:x" } },
    ]);
  });

  it("maps a chat completion back to a Responses object", () => {
    const response = chatCompletionToResponse(
      { model: "m" },
      { choices: [{ message: { content: "done", tool_calls: [{ id: "c", function: { name: "f", arguments: "{}" } }] } }], usage: { prompt_tokens: 3, completion_tokens: 2 } },
    );
    expect(response.status).toBe("completed");
    expect(response.output.map((item) => item.type)).toEqual(["message", "function_call"]);
    expect(response.usage).toEqual({ input_tokens: 3, output_tokens: 2, total_tokens: 5, input_tokens_details: { cached_tokens: 0 } });
    expect(chatUsageToResponsesUsage({ prompt_tokens: 1, prompt_tokens_details: { cached_tokens: 1 } })?.input_tokens_details.cached_tokens).toBe(1);
  });

  it("decides when to fall back and parses SSE blocks", () => {
    expect(shouldFallbackResponses(404, "")).toBe(true);
    expect(shouldFallbackResponses(400, "responses API not supported")).toBe(true);
    expect(shouldFallbackResponses(401, "unauthorized")).toBe(false);
    expect(parseSseBlock("event: a\nevent: b\ndata: 1\ndata: 2")).toEqual({ event: "b", data: "1\n2" });
  });
});

describe("ResponsesStreamTranslator", () => {
  it("turns chat deltas into Responses SSE events", () => {
    const events: { event: string; data: unknown }[] = [];
    const translator = new ResponsesStreamTranslator({ model: "m" }, (event, data) => events.push({ event, data }));
    translator.start();
    translator.processChunk({ choices: [{ delta: { content: "Hel" } }] });
    translator.processChunk({ choices: [{ delta: { content: "lo", tool_calls: [{ index: 0, id: "call_1", function: { name: "ls", arguments: '{"a"' } }] } }] });
    translator.processChunk({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ":1}" } }] } }], usage: { prompt_tokens: 5, completion_tokens: 3 } });
    translator.finish();

    expect(events.map((e) => e.event)).toEqual([
      "response.created",
      "response.in_progress",
      "response.output_item.added",
      "response.content_part.added",
      "response.output_text.delta",
      "response.output_text.delta",
      "response.output_item.added",
      "response.function_call_arguments.delta",
      "response.function_call_arguments.delta",
      "response.output_text.done",
      "response.content_part.done",
      "response.output_item.done",
      "response.function_call_arguments.done",
      "response.output_item.done",
      "response.completed",
    ]);
    const completed = events[events.length - 1]?.data;
    expect(completed).toMatchObject({
      response: {
        status: "completed",
        usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
        output: [
          { type: "message", content: [{ type: "output_text", text: "Hello" }] },
          { type: "function_call", call_id: "call_1", name: "ls", arguments: '{"a":1}' },
        ],
      },
    });
    const output = (completed as { response: { output: Record<string, unknown>[] } }).response.output;
    expect(output.every((item) => !("output_index" in item))).toBe(true);
  });
});
