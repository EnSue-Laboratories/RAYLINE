/**
 * Dispatch auto-fill planner: asks a one-shot CLI run to split a batch brief
 * into Custom Dispatch rows.
 */

import type { DispatchPlan, DispatchPlanRequest } from "@shared/chat/types";
import { isPlannerProviderId, type PlannerProviderId } from "@shared/models/options";
import type { DispatchModelPayload } from "@shared/models/types";
import { errorMessage } from "../errors";
import { parseDispatchPlanJson } from "./parse";
import { buildDispatchPlannerPrompt, buildDispatchPlannerRepairPrompt } from "./prompt";
import { runClaudeDispatchPlanner, runCodexDispatchPlanner, runOpenCodeDispatchPlanner, type PlannerRun } from "./runners";

function runPlanner(provider: PlannerProviderId, run: PlannerRun): Promise<string> {
  switch (provider) {
    case "codex":
      return runCodexDispatchPlanner(run);
    case "opencode":
      return runOpenCodeDispatchPlanner(run);
    case "claude":
      return runClaudeDispatchPlanner(run);
    default: {
      const unreachable: never = provider;
      throw new Error(`Unknown planner provider: ${String(unreachable)}`);
    }
  }
}

/** `dispatch-plan` — rejects when the brief is empty or no rows come back. */
export async function runDispatchPlanner(request: Partial<DispatchPlanRequest> | null | undefined): Promise<DispatchPlan> {
  const instructions = typeof request?.instructions === "string" ? request.instructions : "";
  if (!instructions.trim()) throw new Error("Add a batch brief before auto-filling dispatch.");

  const plannerModel: Partial<DispatchModelPayload> = request?.plannerModel ?? {};
  const cwd = request?.cwd ?? null;
  const prompt = buildDispatchPlannerPrompt({
    instructions,
    cwd,
    targetModels: request?.targetModels,
    defaultTargetModel: request?.defaultTargetModel,
  });
  // Planner-capable providers come from shared PLANNER_PROVIDERS (ported from PR #230's
  // planner-capabilities.json); SSH-hosted models cannot plan.
  const provider = plannerModel.provider || "claude";
  if (!isPlannerProviderId(provider) || plannerModel.remoteRuntime) {
    throw new Error(`Dispatch planning is not supported by ${provider}.`);
  }
  const text = await runPlanner(provider, { prompt, plannerModel, cwd });

  try {
    return parseDispatchPlanJson(text);
  } catch (error) {
    if (provider !== "opencode") throw error;
    const repairPrompt = buildDispatchPlannerRepairPrompt({
      plannerPrompt: prompt,
      invalidOutput: text,
      parseError: errorMessage(error),
    });
    return parseDispatchPlanJson(await runOpenCodeDispatchPlanner({ prompt: repairPrompt, plannerModel, cwd }));
  }
}
