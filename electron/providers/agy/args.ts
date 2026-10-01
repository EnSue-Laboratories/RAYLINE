/**
 * Pure Antigravity CLI arguments (ported from PR #230):
 * `agy --print <prompt> --output-format stream-json [--model <slug>]
 *  [--conversation <id>]`. The user's own AGY permission policy is kept
 * (no auto-approve flag).
 */

import type { FileAttachment } from "@shared/chat/types";
import { AGY_DEFAULT_MODEL_ID, parseAgyModelId } from "@shared/models";
import { buildAgentCliPrompt } from "../common/agent-prompt";

export interface AgyArgsOptions {
  prompt?: string | null;
  /** `--model` slug; "" / `agy:default` = CLI default. `agy:<slug>` ids are accepted too. */
  model?: string | null;
  sessionId?: string | null;
  resumeSessionId?: string | null;
  forkSession?: boolean;
  files?: readonly FileAttachment[] | null;
  images?: readonly unknown[] | null;
  projectContext?: string | null;
}

export function resolveAgyModelFlag(model: string | null | undefined): string | null {
  const value = typeof model === "string" ? model.trim() : "";
  if (!value || value === AGY_DEFAULT_MODEL_ID) return null;
  const parsed = parseAgyModelId(value);
  if (parsed) return parsed.cliFlag || null;
  return value;
}

/** Throws for unsupported requests (branching, image payloads). */
export function buildAgyArgs(options: AgyArgsOptions): string[] {
  if (options.forkSession) {
    throw new Error("AGY does not support branching a native conversation. Start a new chat to create a separate run.");
  }
  if (options.images && options.images.length > 0) {
    throw new Error("AGY image attachments are not supported yet. Attach the image as a local file instead.");
  }
  const args = ["--print", buildAgentCliPrompt(options.prompt, options.files, options.projectContext), "--output-format", "stream-json"];
  const model = resolveAgyModelFlag(options.model);
  if (model) args.push("--model", model);
  const nativeId = options.resumeSessionId || options.sessionId;
  if (nativeId) args.push("--conversation", nativeId);
  return args;
}
