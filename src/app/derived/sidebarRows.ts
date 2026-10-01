/**
 * Sidebar rows = conversation rows + live streaming state. Built outside
 * React on store changes (PERF #10):
 *  - unchanged rows keep their object identity (memoized rows skip),
 *  - the array itself is reused when every row is reused,
 *  - streaming previews refresh at most every 500 ms (`isStreaming` flips
 *    immediately, the final preview is exact).
 */

import type { Conversation, ConversationData } from "@shared/chat/types";
import { getSidebarMessagePreview } from "../conversation/archive";
import { hasConversationMessages } from "../conversation/sessions";

export const SIDEBAR_PREVIEW_THROTTLE_MS = 500;

export interface SidebarRow extends Conversation {
  lastPreview: string;
  isStreaming: boolean;
  /** The conversation row this sidebar row was built from. */
  __source: Conversation;
}

interface PreviewMeta {
  preview: string;
  ts: number;
}

export interface SidebarRowCache {
  rows: Map<string, SidebarRow>;
  previews: Map<string, PreviewMeta>;
  last: SidebarRow[];
}

export function createSidebarRowCache(): SidebarRowCache {
  return { rows: new Map(), previews: new Map(), last: [] };
}

export interface SidebarRowsInput {
  convos: readonly Conversation[];
  activeId: string | null;
  getLive: (id: string) => ConversationData;
  /** Transcript still on disk (v2 lazy load): the row has messages even if none are loaded. */
  isTranscriptPending: (id: string) => boolean;
  now: number;
  throttleMs?: number;
}

export interface SidebarRowsResult {
  rows: SidebarRow[];
  /** A streaming preview was held back; rebuild after the throttle window. */
  pendingFlush: boolean;
}

function emitPreview(
  id: string,
  livePreview: string,
  isStreaming: boolean,
  previews: Map<string, PreviewMeta>,
  now: number,
  throttleMs: number,
): { preview: string; held: boolean } {
  const meta = previews.get(id);
  if (!isStreaming || !meta) {
    previews.set(id, { preview: livePreview, ts: now });
    return { preview: livePreview, held: false };
  }
  if (livePreview === meta.preview) return { preview: meta.preview, held: false };
  if (now - meta.ts >= throttleMs) {
    previews.set(id, { preview: livePreview, ts: now });
    return { preview: livePreview, held: false };
  }
  // Hold the previously emitted preview; the caller schedules a flush so the
  // latest streamed text appears even if commits pause.
  return { preview: meta.preview, held: true };
}

export function buildSidebarRows(input: SidebarRowsInput, cache: SidebarRowCache): SidebarRowsResult {
  const throttleMs = input.throttleMs ?? SIDEBAR_PREVIEW_THROTTLE_MS;
  const rows: SidebarRow[] = [];
  const seen = new Set<string>();
  let pendingFlush = false;

  for (const c of input.convos) {
    const data = input.getLive(c.id);
    if (c.id !== input.activeId && !input.isTranscriptPending(c.id) && !hasConversationMessages(c, data)) continue;
    seen.add(c.id);

    const msgs = data.messages;
    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    const isStreaming = Boolean(data.isStreaming);
    const livePreview = getSidebarMessagePreview(lastMsg) || c.lastPreview || "Empty";
    const { preview, held } = emitPreview(c.id, livePreview, isStreaming, cache.previews, input.now, throttleMs);
    if (held) pendingFlush = true;

    const prevRow = cache.rows.get(c.id);
    if (prevRow && prevRow.__source === c && prevRow.lastPreview === preview && prevRow.isStreaming === isStreaming) {
      rows.push(prevRow);
      continue;
    }
    const row: SidebarRow = { ...c, lastPreview: preview, isStreaming, __source: c };
    cache.rows.set(c.id, row);
    rows.push(row);
  }

  for (const id of [...cache.rows.keys()]) {
    if (!seen.has(id)) cache.rows.delete(id);
  }
  for (const id of [...cache.previews.keys()]) {
    if (!seen.has(id)) cache.previews.delete(id);
  }

  const reused = rows.length === cache.last.length && rows.every((row, i) => row === cache.last[i]);
  if (!reused) cache.last = rows;
  return { rows: cache.last, pendingFlush };
}
