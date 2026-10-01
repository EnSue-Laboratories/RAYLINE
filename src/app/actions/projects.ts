/** Sidebar project actions (collapse, hide, context, manual registration). */

import { setAppSetting } from "../../store/appSettings";
import { getMainRepoRoot } from "../conversation/paths";

function basename(path: string): string | undefined {
  return path.split("/").pop();
}

export function toggleProjectCollapse(cwdRoot: string, nextCollapsed?: boolean): void {
  const projectRoot = getMainRepoRoot(cwdRoot);
  setAppSetting("projects", (prev) => {
    const current = prev[projectRoot]?.collapsed ?? false;
    const collapsed = typeof nextCollapsed === "boolean" ? nextCollapsed : !current;
    if (current === collapsed) return prev;
    return { ...prev, [projectRoot]: { ...prev[projectRoot], collapsed } };
  });
}

export function hideProject(cwdRoot: string): void {
  const projectRoot = getMainRepoRoot(cwdRoot);
  setAppSetting("projects", (prev) => ({ ...prev, [projectRoot]: { ...prev[projectRoot], hidden: true } }));
}

export function editProjectContext(cwdRoot: string, context: string): void {
  const projectRoot = getMainRepoRoot(cwdRoot);
  setAppSetting("projects", (prev) => {
    const existing = prev[projectRoot] ?? {};
    return {
      ...prev,
      [projectRoot]: {
        ...existing,
        name: existing.name || basename(projectRoot),
        context: typeof context === "string" ? context.trim() : "",
      },
    };
  });
}

/** NewProjectModal: a cloned repo or picked local folder becomes a visible manual project. */
export function registerManualProject(projectPath: string, context?: string): void {
  if (!projectPath) return;
  const projectRoot = getMainRepoRoot(projectPath);
  setAppSetting("projects", (prev) => {
    const existing = prev[projectRoot] ?? {};
    return {
      ...prev,
      [projectRoot]: {
        ...existing,
        name: existing.name || basename(projectRoot),
        manual: true,
        hidden: false,
        ...(typeof context === "string" && context.trim() ? { context: context.trim() } : {}),
      },
    };
  });
}

export function handleClonedRepo(clonedPath: string, context?: string): void {
  if (clonedPath) registerManualProject(clonedPath, context);
}
