/**
 * Load state of each conversation's persisted transcript. With v2 split
 * persistence, transcripts are loaded lazily when a conversation is opened;
 * until then `conversation.archivedMessages` is an empty placeholder that
 * must never be written back to disk.
 */

import { createStore, useStore } from "../../store/createStore";

export type TranscriptStatus = "unloaded" | "loading" | "loaded";

export const transcriptStatusStore = createStore<ReadonlyMap<string, TranscriptStatus>>(new Map());

/** Ids not in the map are "loaded" (created this session, or legacy full load). */
export function getTranscriptStatus(id: string): TranscriptStatus {
  return transcriptStatusStore.getState().get(id) ?? "loaded";
}

export function isTranscriptPending(id: string): boolean {
  return getTranscriptStatus(id) !== "loaded";
}

export function setTranscriptStatus(id: string, status: TranscriptStatus): void {
  transcriptStatusStore.setState((prev) => {
    if ((prev.get(id) ?? "loaded") === status) return prev;
    const next = new Map(prev);
    if (status === "loaded") next.delete(id);
    else next.set(id, status);
    return next;
  });
}

export function markTranscriptsUnloaded(ids: readonly string[]): void {
  transcriptStatusStore.setState(() => new Map(ids.map((id) => [id, "unloaded" as const])));
}

export function useTranscriptLoading(id: string | null): boolean {
  return useStore(transcriptStatusStore, (map) => (id ? map.get(id) === "loading" : false));
}
