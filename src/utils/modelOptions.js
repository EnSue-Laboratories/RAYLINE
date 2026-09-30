import { normalizeModelId } from "../data/models.js";
import plannerCapabilities from "../../electron/planner-capabilities.json" with { type: "json" };

export const MODEL_INSTALL_GUIDES = {
  claude: "https://code.claude.com/docs/en/setup",
  codex: "https://developers.openai.com/codex/cli",
  grok: "https://docs.x.ai/docs/grok-code",
  agy: "https://antigravity.google/docs/cli",
  opencode: "https://opencode.ai/docs/cli/",
};
export const MODEL_PROVIDER_ORDER = ["inherit", "claude", "codex", "grok", "agy", "remote-claude", "remote-codex", "opencode", "multica"];

export function visibleModels(models, installed = {}, retainedIds = []) {
  const retained = new Set(retainedIds.map(normalizeModelId));
  return models.filter(model => (!model.legacy || retained.has(model.id)) && (!model.unavailable || retained.has(model.id)) &&
    (!MODEL_INSTALL_GUIDES[model.provider] || installed[model.provider] !== false || model.remoteRuntime));
}
export function isPlannerModel(model) {
  return Boolean(model && !model.unavailable && !model.remoteRuntime && plannerCapabilities.providers.includes(model.provider));
}
export function defaultPlannerModel(models, preferred) {
  const available = models.filter(isPlannerModel);
  return available.find(model => model.id === normalizeModelId(preferred))?.id
    || available.find(model => model.id === "sonnet")?.id
    || available[0]?.id || "";
}
export function modelLabel(model, { short = false } = {}) {
  if (!model) return "";
  return `${(short && model.tag) || model.name || model.id}${model.effort ? ` · ${model.effort}` : ""}`;
}
