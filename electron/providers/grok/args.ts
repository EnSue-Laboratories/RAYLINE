/**
 * Pure Grok Build CLI arguments (ported from PR #230):
 * `grok --cwd <dir> --output-format streaming-json --always-approve
 *  [--model <slug>] [--resume <id> [--fork-session] | --continue]
 *  --single <prompt>`.
 */

import { GROK_DEFAULT_MODEL_ID } from "@shared/models";

export interface GrokArgsOptions {
  cwd: string;
  /** `--model` value; empty / `grok-default` = CLI default (no flag). */
  model?: string | null;
  sessionId?: string | null;
  resumeSessionId?: string | null;
  forkSession?: boolean;
  /** `--continue` the most recent session when there is no id to resume. */
  grokContinue?: boolean;
  prompt: string;
}

export function resolveGrokModelFlag(model: string | null | undefined): string | null {
  const value = typeof model === "string" ? model.trim() : "";
  return value && value !== GROK_DEFAULT_MODEL_ID ? value : null;
}

export function buildGrokArgs(options: GrokArgsOptions): string[] {
  const args = ["--cwd", options.cwd, "--output-format", "streaming-json", "--always-approve"];
  const model = resolveGrokModelFlag(options.model);
  if (model) args.push("--model", model);
  const nativeSessionId = options.resumeSessionId || options.sessionId;
  if (nativeSessionId) {
    args.push("--resume", nativeSessionId);
    if (options.forkSession) args.push("--fork-session");
  } else if (options.grokContinue) {
    args.push("--continue");
  }
  args.push("--single", options.prompt);
  return args;
}
