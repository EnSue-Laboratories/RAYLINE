/** One-shot `claude --print` helpers (quick explain, commit messages). */

import type { GitCommitMessageOk, GitOpResult } from "@shared/git/types";
import type { QuickExplainRequest } from "@shared/chat/types";
import { buildSpawnPath, resolveCliBinAsync, spawnCli } from "../cli-bin-resolver";
import { collectChildOutput, type CollectedOutput } from "./child-output";
import { errorMessage } from "./errors";
import { git } from "./git-ops";

const QUICK_EXPLAIN_TIMEOUT_MS = 30000;
const COMMIT_MESSAGE_TIMEOUT_MS = 45000;
const COMMIT_DIFF_LIMIT = 48 * 1024;

const COMMIT_SYSTEM_PROMPT =
  "You write concise conventional git commit messages. Output ONLY the commit message — no quotes, no code fences, no preamble, no trailing commentary. Prefer a single subject line under 72 chars in the form 'type: summary' (type ∈ feat, fix, refactor, chore, docs, test, style, perf). Only include a body if genuinely useful, separated by one blank line.";

interface ClaudePrintOptions {
  claudeBin: string;
  model: string;
  systemPrompt: string;
  prompt: string;
  cwd?: string;
  timeoutMs: number;
}

function runClaudePrint(options: ClaudePrintOptions): Promise<CollectedOutput> {
  const args = [
    "--print",
    "--output-format", "text",
    "--tools", "",
    "--model", options.model,
    "--no-session-persistence",
    "--system-prompt", options.systemPrompt,
    options.prompt,
  ];
  const child = spawnCli(options.claudeBin, args, {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    env: { ...process.env, FORCE_COLOR: "0", PATH: buildSpawnPath() },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return collectChildOutput(child, { timeoutMs: options.timeoutMs });
}

/** `quick-explain` — markdown, "Error: …" or "Timed out". Never rejects. */
export async function quickExplain(request: Partial<QuickExplainRequest> | null | undefined): Promise<string> {
  try {
    const claudeBin = await resolveCliBinAsync("claude", { envVarName: "CLAUDE_BIN" });
    if (!claudeBin) return "Error: Unable to locate the Claude CLI binary";
    const out = await runClaudePrint({
      claudeBin,
      model: request?.model || "sonnet",
      systemPrompt: "You are a concise explainer. Give 1-3 sentence explanations. Use markdown for formatting.",
      prompt: `Explain this briefly:\n\n${request?.text ?? ""}`,
      timeoutMs: QUICK_EXPLAIN_TIMEOUT_MS,
    });
    if (out.error) return `Error: ${out.error.message}`;
    if (out.timedOut) return out.stdout.trim() || "Timed out";
    return out.stdout.trim();
  } catch (error) {
    return `Error: ${errorMessage(error)}`;
  }
}

async function collectDiffForMessage(cwd: string): Promise<string> {
  // Prefer the staged diff; fall back to the working diff, then untracked files.
  let diff = await git(["diff", "--cached"], cwd).catch(() => "");
  if (!diff.trim()) diff = await git(["diff", "HEAD"], cwd).catch(() => "");
  if (!diff.trim()) {
    const untracked = await git(["ls-files", "--others", "--exclude-standard"], cwd).catch(() => "");
    if (untracked.trim()) diff = `# Untracked files:\n${untracked}`;
  }
  return diff.length > COMMIT_DIFF_LIMIT ? diff.slice(0, COMMIT_DIFF_LIMIT) : diff;
}

/** `git-gen-commit-message` — summarizes the staged (or working) diff with Claude Sonnet. */
export async function generateCommitMessage(cwd: string): Promise<GitOpResult<GitCommitMessageOk>> {
  try {
    const diff = await collectDiffForMessage(cwd);
    if (!diff.trim()) return { ok: false, stderr: "No changes to summarize" };
    const claudeBin = await resolveCliBinAsync("claude", { envVarName: "CLAUDE_BIN" });
    if (!claudeBin) return { ok: false, stderr: "Unable to locate the Claude CLI binary" };
    const out = await runClaudePrint({
      claudeBin,
      model: "sonnet",
      systemPrompt: COMMIT_SYSTEM_PROMPT,
      prompt: `Write a commit message for the following diff:\n\n${diff}`,
      cwd,
      timeoutMs: COMMIT_MESSAGE_TIMEOUT_MS,
    });
    if (out.timedOut) return { ok: false, stderr: "Timed out generating commit message" };
    if (out.error) return { ok: false, stderr: out.error.message };
    const message = out.stdout.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
    if (!message) return { ok: false, stderr: out.stderr.trim() || `exit ${String(out.code)}` };
    return { ok: true, message };
  } catch (err) {
    return { ok: false, stderr: errorMessage(err) };
  }
}
