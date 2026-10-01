/** Prompts for the Dispatch auto-fill planner (pure). */

import type { DispatchModelPayload } from "@shared/models/types";

export const DISPATCH_PLANNER_SYSTEM_PROMPT = `You are RayLine's Dispatch auto-fill planner.

Turn the user's high-level request into editable Custom Dispatch rows.

Output only valid JSON with this shape:
{"rows":[{"title":"short label","prompt":"self-contained agent task","branch":"kebab-case-branch","model":"exact-model-id"}]}

Do not output markdown, prose, caveats, questions, explanations, chain-of-thought, thinking tags, or reasoning text.
Your entire final answer must be parseable by JSON.parse.

Rules:
- Create 1 to 6 rows. Use one row when the work is not safely parallelizable.
- Do not create GitHub issue rows. This planner only fills the Custom dispatch screen.
- Each prompt must be self-contained, specific, and ready to send to an agent in its own worktree.
- Branch names must be lowercase kebab-case and unique.
- Choose model ids only from the provided target model list.
- Prefer Codex/GPT models for bug finding, regressions, CI/test failures, correctness checks, code review, refactors, and repo-wide reasoning.
- Prefer Claude models for creative/product work, UX strategy, new feature design, frontend implementation, visual polish, copy, and exploratory UI iteration.
- Prefer higher-reasoning variants for architecture, risky migrations, or unclear requirements; prefer medium/default variants for straightforward implementation.
- If no exact model is clearly best, use the user's default target model.
- If the user's request is ambiguous, make the most reasonable rows anyway instead of asking a question.`;

export interface CompactDispatchModel {
  id: string;
  name: string;
  tag?: string;
  provider: string;
  effort?: string;
  guide: string;
}

/** Loose view of a target model as sent by the renderer (fields validated here). */
export type DispatchModelLike = Partial<Record<keyof DispatchModelPayload | "label", unknown>>;

export function compactDispatchModel(model: DispatchModelLike | null | undefined): CompactDispatchModel | null {
  const id = typeof model?.id === "string" ? model.id : "";
  if (!id) return null;
  const provider = typeof model?.provider === "string" ? model.provider : "claude";
  const name = typeof model?.name === "string" ? model.name : typeof model?.label === "string" ? model.label : id;
  const lower = `${id} ${name} ${provider}`.toLowerCase();
  let guide = "General coding agent.";
  if (provider === "codex" || lower.includes("gpt")) {
    guide = "Strong for bug checking, repo reasoning, tests, regressions, correctness, refactors, and code review.";
  } else if (provider === "claude") {
    guide = "Strong for creative/product work, UX, frontend design, visual polish, copy, and feature implementation.";
  } else if (provider === "multica") {
    guide = "Use only when the agent name or runtime clearly matches the task.";
  }
  return {
    id,
    name,
    tag: typeof model?.tag === "string" ? model.tag : undefined,
    provider,
    effort: typeof model?.effort === "string" ? model.effort : undefined,
    guide,
  };
}

export interface PlannerPromptInput {
  instructions: string;
  cwd?: string | null;
  targetModels?: readonly DispatchModelLike[] | null;
  defaultTargetModel?: string | null;
}

export function buildDispatchPlannerPrompt({ instructions, cwd, targetModels, defaultTargetModel }: PlannerPromptInput): string {
  const models = (Array.isArray(targetModels) ? targetModels : [])
    .map(compactDispatchModel)
    .filter((model): model is CompactDispatchModel => model !== null);
  return [
    `Working directory: ${cwd || "(none selected)"}`,
    `Default target model id: ${defaultTargetModel || "(none)"}`,
    "Available target models:",
    JSON.stringify(models, null, 2),
    "User batch brief:",
    instructions.trim(),
  ].join("\n\n");
}

export function stripPlannerReasoningBlocks(text: string): string {
  return text
    .replace(/<(?:think|thinking|reasoning)>[\s\S]*?<\/(?:think|thinking|reasoning)>/gi, "")
    .replace(/^Thinking:\s*[\s\S]*?(?=^```|^[{[])/gim, "")
    .trim();
}

export function buildDispatchPlannerRepairPrompt(input: {
  plannerPrompt: string;
  invalidOutput: string;
  parseError: string;
}): string {
  return [
    "Your previous dispatch planner response was not valid JSON.",
    `Parse error: ${input.parseError || "(unknown)"}`,
    "Convert the original request into the required JSON shape now.",
    "Return only valid JSON. Do not include markdown, prose, explanations, chain-of-thought, thinking tags, or reasoning text.",
    "Original planner request:",
    input.plannerPrompt,
    "Previous invalid response with known reasoning blocks removed:",
    stripPlannerReasoningBlocks(input.invalidOutput).slice(0, 4000),
  ].join("\n\n");
}
