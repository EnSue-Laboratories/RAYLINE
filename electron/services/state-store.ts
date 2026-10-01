/**
 * Persisted app state (PERF.md hotspot #1).
 *
 * v2 layout (shared/state/types.ts):
 *   <userData>/state-v2/index.json               settings + conversation metadata
 *   <userData>/state-v2/conversations/<id>.json  one transcript each
 *
 * Mode is "legacy" until index.json exists. The first `state:load` migrates
 * the legacy claudi-state.json into v2 (the legacy file is left untouched so
 * older builds still start). Legacy channels keep working in both modes:
 * once v2 exists, `load-state` is assembled from the v2 files (or served from
 * the index for settings-only callers) and `save-state` is split into v2.
 *
 * All async writes are atomic (temp + rename), serialized per file with
 * trailing-write coalescing, compact JSON, and archived tool payloads are
 * truncated to ARCHIVED_TOOL_PAYLOAD_LIMIT.
 */

import fs from "node:fs";
import {
  isPersistedAppState,
  type PersistedAppIndex,
  type PersistedAppState,
  type StateSaveRequest,
} from "@shared/state/types";
import type { PmState } from "@shared/github/types";
import { mapLimit } from "./concurrency";
import { normalizeTranscriptImagesAsync, normalizeTranscriptImagesSync } from "./message-images";
import { normalizeLegacyStateImages, normalizeLegacyStateImagesSync, parseJson, readTextFile } from "./state-disk";
import { StateStoreCore } from "./state-store-core";
import {
  assembleLegacyState,
  emptyIndex,
  isPersistedConversationFile,
  parseSaveRequest,
  settingsOnly,
  truncateLegacyState,
  type ArchivedMessages,
} from "./state-transform";

export type { StateStoreConfig } from "./state-store-core";

/** `full` = with transcripts (main window); `settings` = preferences only (Project Manager). */
export type LegacyLoadScope = "full" | "settings";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class StateStore extends StateStoreCore {
  // ── v2 ────────────────────────────────────────────────────────────────────

  /** `state:load` — index only; migrates the legacy file on first call. null = fresh install. */
  async loadIndex(): Promise<PersistedAppIndex | null> {
    await this.ensureLoaded();
    if (this.mode !== "v2" || this.migration) {
      this.migration ??= this.migrateLegacy();
      await this.migration;
    }
    return this.index;
  }

  /** `state:load-conversation` — [] when nothing is stored. Sees queued (unflushed) writes. */
  async loadConversation(conversationId: unknown): Promise<ArchivedMessages> {
    if (typeof conversationId !== "string" || !conversationId) return [];
    const accepted = this.acceptedTranscripts.get(conversationId);
    if (accepted) return accepted;
    await this.loadIndex();
    const file = this.transcriptPath(conversationId);
    const queued = this.writer.peek(file);
    let text: string | null;
    if (queued) text = queued.kind === "write" ? (typeof queued.data === "function" ? queued.data() : queued.data) : null;
    else text = await readTextFile(file);
    if (!text) return [];
    const parsed = parseJson(text, file);
    return isPersistedConversationFile(parsed) ? parsed.archivedMessages : [];
  }

  /** `state:save` — writes the index and/or changed transcripts. */
  async save(request: StateSaveRequest): Promise<boolean> {
    if (!isRecord(request)) return false;
    const { upserts, deletes } = parseSaveRequest(request);
    for (const { id, archivedMessages } of upserts) this.acceptedTranscripts.set(id, archivedMessages);
    for (const id of deletes) this.acceptedTranscripts.set(id, []);
    try {
      await this.loadIndex();
      const writes: Promise<void>[] = [];
      for (const transcript of upserts) {
        const messages = await normalizeTranscriptImagesAsync(this.imagesDir, transcript.archivedMessages);
        writes.push(this.writeTranscript(transcript.id, messages));
        this.releaseAccepted(transcript.id, transcript.archivedMessages);
      }
      for (const id of deletes) {
        writes.push(this.removeTranscript(id));
        this.acceptedTranscripts.delete(id);
      }
      if (isRecord(request.index)) writes.push(this.writeIndex(this.prepareIndex(request.index)));
      await Promise.all(writes);
      return true;
    } catch (error) {
      console.error("Failed to save state:", error);
      return false;
    } finally {
      for (const { id, archivedMessages } of upserts) this.releaseAccepted(id, archivedMessages);
    }
  }

  private releaseAccepted(id: string, messages: ArchivedMessages): void {
    // A newer save may have replaced the entry meanwhile; only drop our own.
    if (this.acceptedTranscripts.get(id) === messages) this.acceptedTranscripts.delete(id);
  }

  /** `state:save-sync` (beforeunload) — synchronous; supersedes queued async writes. */
  saveSync(request: StateSaveRequest): boolean {
    if (!isRecord(request)) return false;
    if (this.mode !== "v2" || (this.migration && !this.migrated)) {
      // A v2 renderer always awaits state:load first; refusing here avoids
      // writing a partial index over an unmigrated legacy state.
      console.error("[state] state:save-sync before v2 migration finished; skipped");
      return false;
    }
    const { upserts, deletes } = parseSaveRequest(request);
    try {
      for (const transcript of upserts) {
        this.acceptedTranscripts.delete(transcript.id);
        const messages = normalizeTranscriptImagesSync(this.imagesDir, transcript.archivedMessages);
        this.writer.writeSync(this.transcriptPath(transcript.id), this.serializeTranscript(transcript.id, messages));
      }
      for (const id of deletes) {
        this.transcriptHashes.delete(id);
        this.writer.removeSync(this.transcriptPath(id));
      }
      if (isRecord(request.index)) {
        const index = this.adoptIndex(this.prepareIndex(request.index));
        this.writer.writeSync(this.indexFile, JSON.stringify(index));
      }
      return true;
    } catch (error) {
      console.error("Failed to save state:", error);
      return false;
    }
  }

  // ── legacy channels ───────────────────────────────────────────────────────

  /** `load-state`. */
  async loadLegacy(scope: LegacyLoadScope): Promise<PersistedAppState | null> {
    await this.ensureLoaded();
    if (this.mode === "v2") {
      const index = await this.loadIndex();
      if (!index) return null;
      if (scope === "settings") return settingsOnly(index);
      const transcripts = new Map<string, ArchivedMessages>();
      await mapLimit(index.convos, 8, async (meta) => {
        transcripts.set(meta.id, await this.loadConversation(meta.id));
      });
      return assembleLegacyState(index, transcripts);
    }
    const state = this.legacyState;
    if (!state) return null;
    return scope === "settings" ? settingsOnly(state) : state;
  }

  /** `save-state`. */
  async saveLegacy(state: unknown): Promise<boolean> {
    if (!isPersistedAppState(state)) return false;
    try {
      this.onSettings(state);
      await this.ensureLoaded();
      const normalized = await normalizeLegacyStateImages(this.imagesDir, state);
      if (this.mode === "v2") {
        if (this.migration) await this.migration;
        await Promise.all(this.splitIntoV2(normalized, this.asyncOps));
        return true;
      }
      const merged = this.adoptLegacy(this.withPreservedPmRepos(normalized));
      await this.writer.write(this.legacyFile, () => JSON.stringify(truncateLegacyState(merged)));
      return true;
    } catch (error) {
      console.error("Failed to save state:", error);
      return false;
    }
  }

  /** `save-state-sync` (beforeunload). */
  saveLegacySync(state: unknown): boolean {
    if (!isPersistedAppState(state)) return false;
    try {
      this.onSettings(state);
      this.mode ??= fs.existsSync(this.indexFile) ? "v2" : "legacy";
      const normalized = normalizeLegacyStateImagesSync(this.imagesDir, state);
      if (this.mode === "v2") {
        if (this.migration && !this.migrated) return false;
        void Promise.all(this.splitIntoV2(normalized, this.syncOps));
        return true;
      }
      const merged = this.adoptLegacy(this.withPreservedPmRepos(normalized));
      this.writer.writeSync(this.legacyFile, JSON.stringify(truncateLegacyState(merged)));
      return true;
    } catch (error) {
      console.error("Failed to save state:", error);
      return false;
    }
  }

  // ── Project Manager ───────────────────────────────────────────────────────

  async loadPmState(): Promise<PmState> {
    await this.ensureLoaded();
    const source = this.mode === "v2" ? this.index : this.legacyState;
    return { repos: source?.pmRepos ?? this.pmRepos ?? [], wallpaper: source?.wallpaper ?? null };
  }

  async savePmRepos(repos: string[]): Promise<boolean> {
    try {
      await this.ensureLoaded();
      this.pmRepos = repos;
      if (this.mode === "v2") {
        if (this.migration) await this.migration;
        await this.writeIndex({ ...(this.index ?? emptyIndex()), pmRepos: repos });
        return true;
      }
      const data = this.adoptLegacy({ ...(this.legacyState ?? {}), pmRepos: repos });
      await this.writer.write(this.legacyFile, () => JSON.stringify(truncateLegacyState(data)));
      return true;
    } catch {
      return false;
    }
  }

  // ── misc ──────────────────────────────────────────────────────────────────

  /** Repo roots and conversation cwds known from the last loaded/saved state (in memory only). */
  getKnownProjectDirs(): string[] {
    const source = this.mode === "v2" ? this.index : this.legacyState;
    if (!source) return [];
    const dirs = new Set<string>(Object.keys(source.projects ?? {}));
    for (const convo of source.convos ?? []) {
      if (typeof convo.cwd === "string" && convo.cwd) dirs.add(convo.cwd);
    }
    return [...dirs];
  }

  flush(): Promise<void> {
    return this.writer.flush();
  }

}
