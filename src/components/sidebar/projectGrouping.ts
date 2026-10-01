import type { ProjectGroupData, ProjectsMeta, SidebarConversation } from "./types";

const WORKTREES_SEGMENT = "/.worktrees/";

/** `/repo/.worktrees/feature` → `/repo`; other paths unchanged. */
export function getMainRepoRoot(dir: string): string {
  const wtIdx = dir.indexOf(WORKTREES_SEGMENT);
  return wtIdx !== -1 ? dir.slice(0, wtIdx) : dir;
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

/** Drafts have no cwd, or live under the drafts folder (or one of its worktrees). */
export function isDraftConversation(
  conversation: Pick<SidebarConversation, "cwd"> | null | undefined,
  draftsPath: string | null | undefined,
): boolean {
  if (!conversation) return false;
  if (conversation.cwd == null) return true;
  if (!draftsPath) return false;
  return getMainRepoRoot(conversation.cwd) === getMainRepoRoot(draftsPath);
}

function createGroup(root: string, name: string, meta: ProjectsMeta[string] | undefined): ProjectGroupData {
  return {
    cwdRoot: root,
    name,
    collapsed: meta?.collapsed ?? false,
    hidden: meta?.hidden ?? false,
    context: meta?.context || "",
    convos: [],
    latestTs: null,
  };
}

export interface GroupedConversations {
  /** Sorted newest-activity first; duplicate basenames get a `(parent)` suffix. */
  projectGroups: ProjectGroupData[];
  drafts: SidebarConversation[];
}

/**
 * Buckets sidebar rows by main repo root (worktrees fold into their repo),
 * separates drafts, and adds manually registered projects with no chats.
 */
export function groupConvosByProject(
  convos: readonly SidebarConversation[],
  projectsMeta: ProjectsMeta | null | undefined,
  draftsPath: string | null | undefined,
): GroupedConversations {
  const groups = new Map<string, ProjectGroupData & { convos: SidebarConversation[] }>();
  const drafts: SidebarConversation[] = [];

  for (const c of convos) {
    if (isDraftConversation(c, draftsPath)) {
      drafts.push(c);
      continue;
    }
    const root = c.cwd ? getMainRepoRoot(c.cwd) : null;
    if (!root) continue;
    let group = groups.get(root);
    if (!group) {
      const meta = projectsMeta?.[root];
      group = { ...createGroup(root, meta?.name || basename(root), meta), convos: [] };
      groups.set(root, group);
    }
    group.convos.push(c);
    group.latestTs = Math.max(group.latestTs || 0, c.ts || 0);
  }

  // Manually added projects with zero conversations still get a group.
  const draftsRoot = draftsPath ? getMainRepoRoot(draftsPath) : null;
  for (const [projectPath, meta] of Object.entries(projectsMeta ?? {})) {
    const root = getMainRepoRoot(projectPath);
    if (!root || (draftsRoot && root === draftsRoot)) continue;
    if (meta.manual && !groups.has(root)) {
      groups.set(root, { ...createGroup(root, basename(root), meta), convos: [] });
    }
  }

  const sorted: ProjectGroupData[] = [...groups.values()].sort(
    (a, b) => (b.latestTs || 0) - (a.latestTs || 0),
  );

  // Disambiguate duplicate basenames with the parent directory.
  const nameCounts = new Map<string, number>();
  for (const g of sorted) nameCounts.set(g.name, (nameCounts.get(g.name) ?? 0) + 1);
  for (const g of sorted) {
    if ((nameCounts.get(g.name) ?? 0) > 1) {
      const parts = g.cwdRoot.split("/");
      const parent = parts.length >= 2 ? parts[parts.length - 2] : "";
      if (parent) g.name = `${g.name} (${parent})`;
    }
  }

  return { projectGroups: sorted, drafts };
}

/**
 * Applies optimistic collapse toggles (persisted to App after a delay).
 * Groups whose state already matches keep their identity.
 */
export function applyCollapsedOverrides(
  groups: readonly ProjectGroupData[],
  overrides: Readonly<Record<string, boolean>>,
): ProjectGroupData[] {
  return groups.map((group) => {
    if (!Object.hasOwn(overrides, group.cwdRoot)) return group;
    const collapsed = overrides[group.cwdRoot] ?? group.collapsed;
    return collapsed === group.collapsed ? group : { ...group, collapsed };
  });
}

/**
 * Drops rows that belong to a hidden project (by main repo root). Hidden
 * project groups never render, so their rows must not reach search either:
 * they would inflate the hit count and load transcripts nobody can see.
 * Drafts always stay. Returns `rows` itself when nothing is hidden.
 */
export function excludeHiddenProjectRows(
  rows: readonly SidebarConversation[],
  projectsMeta: ProjectsMeta | null | undefined,
  draftsPath: string | null | undefined,
): readonly SidebarConversation[] {
  if (!projectsMeta || !Object.values(projectsMeta).some((meta) => meta.hidden)) return rows;
  const visible = rows.filter(
    (row) => isDraftConversation(row, draftsPath) || !row.cwd || !projectsMeta[getMainRepoRoot(row.cwd)]?.hidden,
  );
  return visible.length === rows.length ? rows : visible;
}

/** While searching only groups with hits show; otherwise empty groups show only if manual. */
export function isProjectGroupListed(
  group: ProjectGroupData,
  searchActive: boolean,
  projectsMeta: ProjectsMeta | null | undefined,
): boolean {
  if (group.convos.length > 0) return true;
  return !searchActive && Boolean(projectsMeta?.[group.cwdRoot]?.manual);
}

/** Footer label: `repo / worktree` inside a worktree, else the last two path segments. */
export function formatCwdShort(cwd: string | null | undefined): string | null {
  if (!cwd) return null;
  const parts = cwd.split(/[\\/]+/);
  const wtIdx = parts.indexOf(".worktrees");
  if (wtIdx >= 0 && wtIdx + 1 < parts.length) {
    return `${parts[wtIdx - 1] ?? ""} / ${parts[wtIdx + 1] ?? ""}`;
  }
  return parts.filter(Boolean).slice(-2).join("/");
}

/** Display name of a project root: its custom name, else the folder name. */
export function getProjectDisplayName(cwdRoot: string, projectsMeta: ProjectsMeta | null | undefined): string {
  return projectsMeta?.[cwdRoot]?.name || basename(cwdRoot);
}

/** Project picker entries: deduped, hidden projects omitted unless currently selected. */
export function listPickerProjectRoots(
  allCwdRoots: readonly string[] | null | undefined,
  projectsMeta: ProjectsMeta | null | undefined,
  selected: string | null | undefined,
): string[] {
  return [...new Set(allCwdRoots ?? [])].filter((root) => !projectsMeta?.[root]?.hidden || root === selected);
}
