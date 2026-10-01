/**
 * Pure `codex exec` argument builder.
 *
 * Verified against codex-cli 0.153.4 (`codex exec --help`,
 * `codex exec resume --help`):
 *  - `--full-auto` is gone ("unexpected argument"). The sandboxed mode now
 *    uses `--sandbox workspace-write` with `approval_policy="never"` (exec is
 *    non-interactive, so commands needing approval fail back to the model).
 *  - `codex exec resume <id>` accepts neither `-C` nor `-s`/`--sandbox`, so a
 *    resumed sandboxed run sets `-c sandbox_mode="workspace-write"` instead.
 *    `--dangerously-bypass-approvals-and-sandbox`, `-m`, `-c`, `-i` and
 *    `--json` are accepted by both.
 *  - Effort: `-c model_reasoning_effort="<level>"` (low…xhigh, max, ultra).
 */

import type { CodexEffortLevel } from "@shared/models";
import { resolveCliModel, resolveRunEffort } from "../common/models";

/** `bypass` = no Codex sandbox (RayLine default); `workspace-write` = sandboxed. */
export type CodexSandboxMode = "bypass" | "workspace-write";

/** `CLAUDI_CODEX_BYPASS_SANDBOX=0` opts into Codex's workspace-write sandbox. */
export function codexSandboxModeFromEnv(env: NodeJS.ProcessEnv): CodexSandboxMode {
  return env.CLAUDI_CODEX_BYPASS_SANDBOX === "0" ? "workspace-write" : "bypass";
}

export function codexExecutionFlags(mode: CodexSandboxMode, resuming: boolean): string[] {
  switch (mode) {
    case "bypass":
      return ["--dangerously-bypass-approvals-and-sandbox"];
    case "workspace-write":
      return resuming
        ? ["-c", 'sandbox_mode="workspace-write"', "-c", 'approval_policy="never"']
        : ["--sandbox", "workspace-write", "-c", 'approval_policy="never"'];
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

export interface CodexArgsOptions {
  resumeSessionId?: string | null;
  sandbox: CodexSandboxMode;
  model?: string | null;
  effort?: CodexEffortLevel | null;
  /** `-c mcp_servers…` pairs. */
  mcpOverrides?: readonly string[];
  /** `-c model_provider…` pairs from a provider upstream. */
  upstreamArgs?: readonly string[];
  /** Working root (`-C`); ignored when resuming. */
  cwd?: string | null;
  imagePaths?: readonly string[];
  prompt: string;
}

export function buildCodexArgs(options: CodexArgsOptions): string[] {
  const resuming = Boolean(options.resumeSessionId);
  const args = ["exec"];
  if (options.resumeSessionId) args.push("resume", options.resumeSessionId);
  args.push("--json", ...codexExecutionFlags(options.sandbox, resuming));
  if (options.model) args.push("-m", options.model);
  if (options.effort) args.push("-c", `model_reasoning_effort="${options.effort}"`);
  args.push(...(options.mcpOverrides ?? []), ...(options.upstreamArgs ?? []));
  if (options.cwd && !resuming) args.push("-C", options.cwd);
  for (const imagePath of options.imagePaths ?? []) args.push("-i", imagePath);
  // `--image` is variadic, so terminate option parsing before the prompt or
  // the prompt may be consumed as another image path.
  args.push("--", options.prompt);
  return args;
}

export interface CodexModelChoice {
  model: string | null;
  effort: CodexEffortLevel | null;
}

/**
 * Registry slug for `-m` (legacy ids like `gpt54-high` map to their current
 * model) and the effort clamped to what that model accepts.
 */
export function resolveCodexModelChoice(model: string | null | undefined, effort: unknown, upstreamActive: boolean): CodexModelChoice {
  const resolved = resolveCliModel("codex", model);
  return {
    model: resolved.cliFlag,
    effort: resolveRunEffort({ definition: resolved.definition, requested: effort, legacyEffort: resolved.legacyEffort, upstreamActive }),
  };
}
