/**
 * Pure Claude Code CLI argument / prompt builders.
 *
 * Flags verified against Claude Code 2.1.287 (`claude --help`):
 * `--print --input-format=stream-json --output-format=stream-json --verbose
 * --include-partial-messages --permission-mode --permission-prompt-tool
 * --append-system-prompt --mcp-config --model --effort --resume
 * --fork-session --session-id`. `--rewind-files` is undocumented but parses.
 */

import type { FileAttachment } from "@shared/chat/types";
import { isClaudeEffortLevel, type ClaudeEffortLevel } from "@shared/models";
import { resolveCliModel, resolveRunEffort } from "../common/models";

export interface ClaudeArgsOptions {
  /** `--model` value (registry cliFlag or a raw model name). */
  model?: string | null;
  effort?: ClaudeEffortLevel | null;
  sessionId?: string | null;
  resumeSessionId?: string | null;
  forkSession?: boolean;
  appendSystemPrompt: string;
  /** Local terminal MCP config; omitted for remote runs. */
  mcpConfigPath?: string | null;
}

export const CLAUDE_STREAM_FLAGS: readonly string[] = [
  "--print",
  "--input-format=stream-json",
  "--output-format=stream-json",
  "--verbose",
  "--include-partial-messages",
  "--permission-mode",
  "bypassPermissions",
  "--permission-prompt-tool",
  "stdio",
];

export function buildClaudeArgs(options: ClaudeArgsOptions): string[] {
  const args = [...CLAUDE_STREAM_FLAGS, "--append-system-prompt", options.appendSystemPrompt];
  if (options.mcpConfigPath) args.push("--mcp-config", options.mcpConfigPath);
  if (options.model) args.push("--model", options.model);
  if (options.effort) args.push("--effort", options.effort);

  if (options.resumeSessionId) {
    args.push("--resume", options.resumeSessionId);
    if (options.forkSession) args.push("--fork-session");
  } else if (options.sessionId) {
    args.push("--session-id", options.sessionId);
  }
  return args;
}

/** `claude --print --resume <id> --rewind-files <uuid>` (standalone, exits). */
export function buildClaudeRewindArgs(sessionId: string, messageUuid: string): string[] {
  return ["--print", "--resume", sessionId, "--rewind-files", messageUuid];
}

export interface ClaudeModelChoice {
  model: string | null;
  effort: ClaudeEffortLevel | null;
}

/**
 * Registry-validated `--model` / `--effort`. Effort is dropped for models
 * without effort control (Haiku), for unknown models and when a provider
 * upstream is active.
 */
export function resolveClaudeModelChoice(model: string | null | undefined, effort: unknown, upstreamActive: boolean): ClaudeModelChoice {
  const resolved = resolveCliModel("claude", model);
  const runEffort = resolveRunEffort({
    definition: resolved.definition,
    requested: effort,
    legacyEffort: resolved.legacyEffort,
    upstreamActive,
  });
  return { model: resolved.cliFlag, effort: isClaudeEffortLevel(runEffort) ? runEffort : null };
}

export interface ClaudePromptInput {
  prompt: string;
  /** How many images the user attached. */
  imageCount: number;
  /** Paths the CLI can read (local temp files or staged remote paths). */
  imagePaths: readonly string[];
  files: readonly FileAttachment[] | null | undefined;
  remote: boolean;
}

/** Prefixes the prompt with attachment paths, as the CLI reads files itself. */
export function buildClaudePrompt({ prompt, imageCount, imagePaths, files, remote }: ClaudePromptInput): string {
  let fullPrompt = prompt;
  if (imageCount > 0) {
    if (imagePaths.length > 0) {
      const label = remote ? "Attached images uploaded to the remote SSH host" : "Attached images";
      fullPrompt = `[${label}: ${imagePaths.join(", ")}]\n\n${prompt}`;
    } else if (remote) {
      fullPrompt = `[Attached images were provided in RayLine, but they were not copied to the remote SSH host.]\n\n${prompt}`;
    }
  }

  const filePaths = (files ?? []).map((f) => f.path).filter((p): p is string => Boolean(p));
  if (filePaths.length > 0) {
    const label = remote ? "Attached files uploaded to the remote SSH host" : "Attached files";
    fullPrompt = `[${label}:\n${filePaths.join("\n")}]\n\n${fullPrompt}`;
  }
  return fullPrompt;
}
