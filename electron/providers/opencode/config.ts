/**
 * Pure OpenCode helpers: model parsing, thinking-mode inference, per-run
 * provider credentials and `opencode run` arguments.
 */

import type { ImageInput } from "../common/images";
import { imageDataUrlOf } from "../common/images";
import { isRecord, safeString } from "../common/json";

export interface OpenCodeModelRef {
  providerID: string;
  modelID: string;
}

/** `provider/model` → `{ providerID, modelID }`; null when malformed. */
export function parseOpenCodeModel(model: unknown): OpenCodeModelRef | null {
  if (typeof model !== "string") return null;
  const slashIndex = model.indexOf("/");
  if (slashIndex <= 0 || slashIndex >= model.length - 1) return null;
  return { providerID: model.slice(0, slashIndex), modelID: model.slice(slashIndex + 1) };
}

export function inferThinkingModel(model: unknown): boolean {
  const value = typeof model === "string" ? model.toLowerCase() : "";
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

/** Explicit `thinking` wins; otherwise inferred from the model id. */
export function shouldEnableThinking(model: unknown, thinking: unknown): boolean {
  if (thinking === true) return true;
  if (thinking === false) return false;
  return inferThinkingModel(model);
}

export interface NormalizedOpenCodeRuntimeConfig {
  providerId: string;
  modelId: string;
  apiKey: string;
  baseURL: string;
}

/** Per-run credentials; null unless a valid provider id plus key or URL is given. */
export function normalizeOpenCodeRuntimeConfig(openCodeConfig: unknown, model: unknown): NormalizedOpenCodeRuntimeConfig | null {
  const config = isRecord(openCodeConfig) ? openCodeConfig : {};
  const parsedModel = parseOpenCodeModel(model);
  const providerId = safeString(config.providerId) || parsedModel?.providerID || "";
  const modelId = safeString(config.modelId) || parsedModel?.modelID || "";
  const apiKey = safeString(config.apiKey);
  const baseURL = safeString(config.baseURL);
  if (!providerId || !/^[a-zA-Z0-9_.-]+$/.test(providerId)) return null;
  if (!apiKey && !baseURL) return null;
  return { providerId, modelId, apiKey, baseURL };
}

export interface OpenCodeConfigOverlay {
  /** Env vars holding the secrets (referenced from the config file). */
  env: Record<string, string>;
  /** Contents of the temporary `opencode.json`. */
  configJson: string;
}

/**
 * Temporary OpenCode config that injects the credentials via `{env:…}`
 * references, so secrets never land on disk. Null when not needed.
 */
export function buildOpenCodeConfigOverlay(openCodeConfig: unknown, model: unknown): OpenCodeConfigOverlay | null {
  const normalized = normalizeOpenCodeRuntimeConfig(openCodeConfig, model);
  if (!normalized) return null;
  const env: Record<string, string> = {};
  const options: Record<string, string> = {};
  if (normalized.apiKey) {
    env.RAYLINE_OPENCODE_API_KEY = normalized.apiKey;
    options.apiKey = "{env:RAYLINE_OPENCODE_API_KEY}";
  }
  if (normalized.baseURL) {
    env.RAYLINE_OPENCODE_BASE_URL = normalized.baseURL;
    options.baseURL = "{env:RAYLINE_OPENCODE_BASE_URL}";
  }
  const config = { $schema: "https://opencode.ai/config.json", provider: { [normalized.providerId]: { options } } };
  return { env, configJson: `${JSON.stringify(config, null, 2)}\n` };
}

export interface OpenCodeRunArgsOptions {
  cwd: string;
  sessionId?: string | null;
  forkSession?: boolean;
  model?: string | null;
  /** `--file` attachments (files + decoded images). */
  filePaths: readonly string[];
  prompt: string;
}

/** `opencode run --format json …` (non-thinking mode). */
export function buildOpenCodeRunArgs({ cwd, sessionId, forkSession, model, filePaths, prompt }: OpenCodeRunArgsOptions): string[] {
  const args = ["run", "--format", "json", "--dangerously-skip-permissions", "--dir", cwd];
  if (sessionId) {
    args.push("--session", sessionId);
    if (forkSession) args.push("--fork");
  }
  if (model) args.push("--model", model);
  for (const filePath of filePaths) args.push("--file", filePath);
  args.push("--", prompt);
  return args;
}

export function buildOpenCodeServeArgs(port: number): string[] {
  return ["serve", "--hostname", "127.0.0.1", "--port", String(port)];
}

export interface OpenCodeTextPartInput {
  type: "text";
  text: string;
}

export interface OpenCodeFilePartInput {
  type: "file";
  mime: string;
  filename: string;
  url: string;
}

export type OpenCodePromptPart = OpenCodeTextPartInput | OpenCodeFilePartInput;

/** `prompt_async` body parts: the text plus inline data-URL images. */
export function buildPromptParts(fullPrompt: string, images: readonly ImageInput[] | null | undefined): OpenCodePromptPart[] {
  const parts: OpenCodePromptPart[] = [{ type: "text", text: fullPrompt }];
  (images ?? []).forEach((image, index) => {
    const dataUrl = imageDataUrlOf(image);
    const mime = dataUrl ? /^data:([^;]+);base64,/.exec(dataUrl)?.[1] : undefined;
    if (!dataUrl || !mime) return;
    parts.push({ type: "file", mime, filename: `rayline-image-${index + 1}`, url: dataUrl });
  });
  return parts;
}
