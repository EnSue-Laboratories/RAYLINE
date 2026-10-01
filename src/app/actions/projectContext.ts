import { getAppSettings } from "../../store/appSettings";
import { getMainRepoRoot } from "../conversation/paths";

/** Per-project context appended to the agent system prompt, if any. */
export function resolveProjectContext(cwdPath: string | null | undefined): string | undefined {
  if (!cwdPath) return undefined;
  const root = getMainRepoRoot(cwdPath);
  if (!root) return undefined;
  const ctx = getAppSettings().projects[root]?.context;
  return typeof ctx === "string" && ctx.trim() ? ctx : undefined;
}
