/** Project-root / drafts-folder path rules for conversations. */

import type { Conversation } from "@shared/chat/types";
import type { ProjectMeta } from "@shared/state/types";
import { getMainRepoRoot } from "../../utils/cwdRecovery";

export { getMainRepoRoot };

export function isDraftProjectRoot(dir: string | null | undefined, draftsPath: string | null | undefined): boolean {
  if (!dir || !draftsPath) return false;
  return getMainRepoRoot(dir) === getMainRepoRoot(draftsPath);
}

export function getProjectRootOrUndefined(dir: string | null | undefined, draftsPath: string | null | undefined): string | undefined {
  const root = getMainRepoRoot(dir);
  if (!root || isDraftProjectRoot(root, draftsPath)) return undefined;
  return root;
}

/** `null` = drafts, `undefined` = app default, otherwise the project root. */
export function normalizeConversationCreationCwd(
  dir: string | null | undefined,
  draftsPath: string | null | undefined,
): string | null | undefined {
  if (dir === null) return null;
  if (dir === undefined) return undefined;
  return getProjectRootOrUndefined(dir, draftsPath);
}

/** The directory an agent run for `conversation` should use. */
export function getEffectiveConversationCwd(
  conversation: Pick<Conversation, "cwd"> | null | undefined,
  appCwd: string | null | undefined,
  draftsPath: string | null | undefined,
): string | undefined {
  const convoCwd: string | null | undefined = conversation?.cwd;
  if (convoCwd === null) return draftsPath || undefined;
  if (convoCwd !== undefined) return convoCwd || undefined;
  return appCwd || undefined;
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

/** Merge worktree entries into their repo roots (root entries win for `name`). */
export function normalizeProjectsMeta(projectsMeta: Record<string, ProjectMeta> | null | undefined): Record<string, ProjectMeta> {
  const normalized: Record<string, ProjectMeta> = {};
  const entries = Object.entries(projectsMeta ?? {}).sort(([a], [b]) => {
    const aIsRoot = a === getMainRepoRoot(a);
    const bIsRoot = b === getMainRepoRoot(b);
    return Number(aIsRoot) - Number(bIsRoot);
  });

  for (const [path, meta] of entries) {
    const root = getMainRepoRoot(path);
    if (!root) continue;
    const prev = normalized[root] ?? {};
    normalized[root] = {
      ...prev,
      ...meta,
      name: path === root ? (meta.name || basename(root)) : (prev.name || basename(root)),
      manual: Boolean(prev.manual || meta.manual),
    };
  }
  return normalized;
}

/** Subset of project meta shown by the project chooser (stable across unrelated edits). */
export type ChooserProjects = Record<string, Pick<ProjectMeta, "name" | "hidden" | "manual">>;

export function getProjectChooserSignature(projects: Record<string, ProjectMeta>): string {
  return Object.entries(projects)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([projectPath, meta]) => [projectPath, meta.name || "", meta.hidden ? "1" : "0", meta.manual ? "1" : "0"].join("\u0000"))
    .join("\u0001");
}

export function buildProjectChooserProjects(projects: Record<string, ProjectMeta>): ChooserProjects {
  const chooserProjects: ChooserProjects = {};
  for (const [projectPath, meta] of Object.entries(projects).sort(([a], [b]) => a.localeCompare(b))) {
    chooserProjects[projectPath] = {
      ...(meta.name ? { name: meta.name } : {}),
      ...(meta.hidden ? { hidden: true } : {}),
      ...(meta.manual ? { manual: true } : {}),
    };
  }
  return chooserProjects;
}

/** Project roots for the new-chat / dispatch pickers (no drafts, no worktrees). */
export function collectCwdRoots(
  convos: readonly Pick<Conversation, "cwd">[],
  chooserProjects: ChooserProjects,
  draftsPath: string | null,
): string[] {
  const roots = new Set<string>();
  for (const c of convos) {
    const root = getMainRepoRoot(c.cwd);
    if (root && !isDraftProjectRoot(root, draftsPath)) roots.add(root);
  }
  for (const r of Object.keys(chooserProjects)) {
    const root = getMainRepoRoot(r);
    if (root && !isDraftProjectRoot(root, draftsPath)) roots.add(root);
  }
  return [...roots].filter((r) => r && !r.includes("/.worktrees/"));
}

/**
 * Default project for the new-chat card: an explicit project (project-row
 * "new chat"), else the active conversation's, the app cwd, or the first
 * conversation with a project.
 */
export function resolveNewChatDefaultCwd(input: {
  explicitProject: string | null | undefined;
  activeCwd: string | null | undefined;
  appCwd: string | null;
  convos: readonly Pick<Conversation, "cwd">[];
  draftsPath: string | null;
}): string | null {
  const { explicitProject, activeCwd, appCwd, convos, draftsPath } = input;
  if (explicitProject !== undefined) return explicitProject;
  if (activeCwd && !isDraftProjectRoot(activeCwd, draftsPath)) return getMainRepoRoot(activeCwd);
  if (appCwd && !isDraftProjectRoot(appCwd, draftsPath)) return getMainRepoRoot(appCwd);
  for (const c of convos) {
    if (c.cwd && !isDraftProjectRoot(c.cwd, draftsPath)) return getMainRepoRoot(c.cwd);
  }
  return null;
}
