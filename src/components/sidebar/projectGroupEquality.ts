/**
 * memo() comparators for the sidebar's hot lists. Rows are compared by the
 * fields they render, so App handing over a new row object with the same
 * visible data (or a new array of the same rows) doesn't re-render anything.
 */
import type { ExtraModels, ProjectGroupData, SidebarConversation } from "./types";

const NO_TAGS: readonly string[] = [];

export function sameTags(a: readonly string[] = NO_TAGS, b: readonly string[] = NO_TAGS): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((tag, i) => tag === b[i]);
}

/** Same rendered data (title, previews, model tag, streaming badge, tags). */
export function sameConversationData(
  a: SidebarConversation | null | undefined,
  b: SidebarConversation | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.lastPreview === b.lastPreview &&
    a._searchPreview === b._searchPreview &&
    a.model === b.model &&
    a.isStreaming === b.isStreaming &&
    sameTags(a.tags, b.tags)
  );
}

export function sameConversationList(
  a: readonly SidebarConversation[],
  b: readonly SidebarConversation[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((conversation, i) => sameConversationData(conversation, b[i]));
}

export function hasConvoId(convos: readonly SidebarConversation[], id: string | null | undefined): boolean {
  if (!id) return false;
  return convos.some((c) => c.id === id);
}

/** Props the ProjectGroup comparator inspects. */
export interface ProjectGroupCompareProps {
  project: ProjectGroupData;
  active: string | null | undefined;
  searchActive: boolean;
  multicaModels?: ExtraModels;
  locale?: string;
  onSelect: unknown;
  onDelete: unknown;
  onNewInProject: unknown;
  onToggleCollapse: unknown;
  onHideProject: unknown;
  onEditContext?: unknown;
}

export function sameProjectGroupData(a: ProjectGroupData, b: ProjectGroupData): boolean {
  if (a === b) return true;
  return (
    a.cwdRoot === b.cwdRoot &&
    a.name === b.name &&
    a.collapsed === b.collapsed &&
    a.hidden === b.hidden &&
    a.context === b.context &&
    a.latestTs === b.latestTs &&
    sameConversationList(a.convos, b.convos)
  );
}

/**
 * Skips re-rendering a project group when its data, callbacks and settings are
 * unchanged, and when the active-chat change doesn't involve one of its rows.
 */
export function areProjectGroupsEqual(prev: ProjectGroupCompareProps, next: ProjectGroupCompareProps): boolean {
  if (
    prev.onSelect !== next.onSelect ||
    prev.onDelete !== next.onDelete ||
    prev.onNewInProject !== next.onNewInProject ||
    prev.onToggleCollapse !== next.onToggleCollapse ||
    prev.onHideProject !== next.onHideProject ||
    prev.onEditContext !== next.onEditContext ||
    prev.searchActive !== next.searchActive ||
    prev.multicaModels !== next.multicaModels ||
    prev.locale !== next.locale
  ) {
    return false;
  }
  if (!sameProjectGroupData(prev.project, next.project)) return false;
  if (prev.active === next.active) return true;
  return !hasConvoId(prev.project.convos, prev.active) && !hasConvoId(next.project.convos, next.active);
}

/** Props the ConversationRow comparator inspects. */
export interface ConversationRowCompareProps {
  conversation: SidebarConversation;
  isActive: boolean;
  multicaModels: ExtraModels;
  rowHeight: number;
  /** Absolute offset when virtualized. */
  top?: number;
  onSelect: unknown;
  onDelete: unknown;
  s: unknown;
}

export function areConversationRowsEqual(prev: ConversationRowCompareProps, next: ConversationRowCompareProps): boolean {
  return (
    prev.isActive === next.isActive &&
    prev.onSelect === next.onSelect &&
    prev.onDelete === next.onDelete &&
    prev.multicaModels === next.multicaModels &&
    prev.rowHeight === next.rowHeight &&
    prev.top === next.top &&
    prev.s === next.s &&
    sameConversationData(prev.conversation, next.conversation)
  );
}
