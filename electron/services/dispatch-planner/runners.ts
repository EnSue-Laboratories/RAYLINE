/** Runs the planner prompt through the Claude / Codex / OpenCode CLIs. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DispatchModelPayload } from "@shared/models/types";
import { buildSpawnPath, resolveCliBinAsync, spawnCli } from "../../cli-bin-resolver";
import { openCodeAgentManager } from "../../app/boundaries";
import { collectChildOutput } from "../child-output";
import { resolveOpenCodeBinAsync } from "../opencode-status";
import { DISPATCH_PLANNER_SYSTEM_PROMPT } from "./prompt";
import {
  collectOpenCodePlannerText,
  createOpenCodeTextState,
  extractOpenCodePlannerError,
  openCodeTextResult,
} from "./opencode-text";

export const DISPATCH_PLAN_TIMEOUT_MS = 90000;

export interface PlannerRun {
  prompt: string;
  plannerModel: Partial<DispatchModelPayload>;
  cwd?: string | null;
}

async function launchCwd(cwd: string | null | undefined): Promise<string> {
  if (!cwd) return process.cwd();
  try {
    await fs.promises.access(cwd);
    return cwd;
  } catch {
    return process.cwd();
  }
}

function plainEnv(): NodeJS.ProcessEnv {
  return { ...process.env, FORCE_COLOR: "0", PATH: buildSpawnPath() };
}

const timedOutError = (): Error => new Error("Dispatch planner timed out.");

export async function runClaudeDispatchPlanner({ prompt, plannerModel, cwd }: PlannerRun): Promise<string> {
  const claudeBin = await resolveCliBinAsync("claude", { envVarName: "CLAUDE_BIN" });
  if (!claudeBin) throw new Error("Unable to locate the Claude CLI binary");

  const args = [
    "--print",
    "--output-format", "text",
    "--tools", "",
    "--model", plannerModel.cliFlag || plannerModel.id || "sonnet",
    "--no-session-persistence",
    "--system-prompt", DISPATCH_PLANNER_SYSTEM_PROMPT,
    prompt,
  ];
  const child = spawnCli(claudeBin, args, { cwd: await launchCwd(cwd), env: plainEnv(), stdio: ["ignore", "pipe", "pipe"] });
  const out = await collectChildOutput(child, { timeoutMs: DISPATCH_PLAN_TIMEOUT_MS });
  if (out.timedOut) throw timedOutError();
  if (out.error) throw out.error;
  if (out.code !== 0 && !out.stdout.trim()) {
    throw new Error(out.stderr.trim() || `Claude planner exited with code ${String(out.code)}.`);
  }
  return out.stdout.trim();
}

export async function runCodexDispatchPlanner({ prompt, plannerModel, cwd }: PlannerRun): Promise<string> {
  const codexBin = await resolveCliBinAsync("codex", { envVarName: "CODEX_BIN" });
  if (!codexBin) throw new Error("Unable to locate the Codex CLI binary");

  const outputPath = path.join(
    os.tmpdir(),
    `rayline-dispatch-plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  );
  const args = [
    "exec",
    "--ephemeral",
    "--sandbox", "read-only",
    "--skip-git-repo-check",
    "-m", plannerModel.cliFlag || plannerModel.id || "gpt-5.4",
    "-o", outputPath,
  ];
  if (plannerModel.effort) args.push("-c", `model_reasoning_effort="${plannerModel.effort}"`);
  args.push("--", `${DISPATCH_PLANNER_SYSTEM_PROMPT}\n\n${prompt}`);

  const child = spawnCli(codexBin, args, {
    cwd: await launchCwd(cwd),
    env: plainEnv(),
    // Codex stalls before the first network request when stdin is /dev/null.
    // Give it a pipe and immediately close it so it observes EOF correctly.
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin?.on("error", () => undefined);
  child.stdin?.end();

  try {
    const out = await collectChildOutput(child, { timeoutMs: DISPATCH_PLAN_TIMEOUT_MS });
    if (out.timedOut) throw timedOutError();
    if (out.error) throw out.error;
    let finalText = await fs.promises.readFile(outputPath, "utf-8").catch(() => "");
    if (!finalText.trim()) finalText = out.stdout.trim();
    if (out.code !== 0 && !finalText.trim()) {
      throw new Error(out.stderr.trim() || `Codex planner exited with code ${String(out.code)}.`);
    }
    return finalText.trim();
  } finally {
    void fs.promises.unlink(outputPath).catch(() => undefined);
  }
}

export async function runOpenCodeDispatchPlanner({ prompt, plannerModel, cwd }: PlannerRun): Promise<string> {
  const openCodeBin = await resolveOpenCodeBinAsync();
  if (!openCodeBin) throw new Error("Unable to locate the OpenCode CLI binary");

  const model = plannerModel.cliFlag || (plannerModel.id ?? "").replace(/^opencode:/, "");
  const dir = await launchCwd(cwd);
  const args = ["run", "--format", "json", "--dangerously-skip-permissions", "--dir", dir];
  if (model) args.push("--model", model);
  if (openCodeAgentManager.shouldEnableThinking(model, plannerModel.thinking)) args.push("--thinking");
  args.push("--", `${DISPATCH_PLANNER_SYSTEM_PROMPT}\n\n${prompt}`);
  const runtime = openCodeAgentManager.createOpenCodeRuntimeEnv(plannerModel.openCodeConfig, model);

  const textState = createOpenCodeTextState();
  let plannerError = "";
  let buffer = "";
  const parseLine = (line: string): void => {
    if (!line.trim()) return;
    try {
      const event: unknown = JSON.parse(line);
      collectOpenCodePlannerText(event, textState);
      plannerError = extractOpenCodePlannerError(event) || plannerError;
    } catch {
      textState.chunks.push(`${line}\n`);
    }
  };

  try {
    const child = spawnCli(openCodeBin, args, { cwd: dir, env: runtime.env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) parseLine(line);
    });
    // stdout is consumed above; collect only stderr / exit status here.
    const out = await collectChildOutput(child, { timeoutMs: DISPATCH_PLAN_TIMEOUT_MS });
    if (out.timedOut) throw timedOutError();
    if (out.error) throw out.error;
    if (buffer.trim()) parseLine(buffer);
    const text = openCodeTextResult(textState);
    if (out.code !== 0 && !text) {
      throw new Error(plannerError || out.stderr.trim() || `OpenCode planner exited with code ${String(out.code)}.`);
    }
    if (plannerError && !text) throw new Error(plannerError);
    return text;
  } finally {
    runtime.cleanup();
  }
}
