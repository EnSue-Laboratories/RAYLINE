/**
 * Storage core of the state store: on-disk layout, mode detection, legacy
 * → v2 migration and the transcript / index writers. The channel-facing API
 * is `StateStore` (state-store.ts).
 */

import crypto from "node:crypto";
import path from "node:path";
import type { PersistedAppIndex, PersistedAppState } from "@shared/state/types";
import { AtomicFileWriter } from "./atomic-writer";
import { sweepUnreferencedImages } from "./state-sweep";
import { normalizeLegacyStateImages, parseJson, readLegacyState, readTextFile } from "./state-disk";
import {
  buildConversationFile,
  conversationFileName,
  isPersistedAppIndex,
  sanitizeIndex,
  splitLegacyState,
  truncateArchivedMessages,
  type ArchivedMessages,
} from "./state-transform";

export interface StateStoreConfig {
  userDataDir: string;
  /** Legacy state files of older app names, tried after claudi-state.json. */
  legacyFallbackFiles?: readonly string[];
  /** Called with every loaded / saved settings object (e.g. terminal surface preference). */
  onSettings?: (settings: PersistedAppState | PersistedAppIndex) => void;
  /** Delay before the orphaned-image sweep; null disables it (tests). */
  sweepDelayMs?: number | null;
  writer?: AtomicFileWriter;
}

/** `full` = with transcripts (main window); `settings` = preferences only (Project Manager). */
export type LegacyLoadScope = "full" | "settings";

export type StoreMode = "legacy" | "v2";

export interface FileOps {
  write(file: string, data: string): Promise<void>;
  remove(file: string): Promise<void>;
}

function sha1(text: string): string {
  return crypto.createHash("sha1").update(text).digest("hex");
}

export class StateStoreCore {
  readonly legacyFile: string;
  readonly indexFile: string;
  readonly conversationsDir: string;
  readonly imagesDir: string;

  protected readonly writer: AtomicFileWriter;
  protected readonly legacyCandidates: string[];
  protected readonly onSettings: (settings: PersistedAppState | PersistedAppIndex) => void;
  protected readonly sweepDelayMs: number | null;
  protected readonly createdAt = Date.now();

  protected mode: StoreMode | null = null;
  protected loading: Promise<void> | null = null;
  protected migration: Promise<PersistedAppIndex | null> | null = null;
  protected migrated = false;
  protected index: PersistedAppIndex | null = null;
  protected legacyState: PersistedAppState | null = null;
  protected pmRepos: string[] | undefined;
  /** Last written transcript hash per conversation (legacy saves in v2 mode write only changes). */
  protected readonly transcriptHashes = new Map<string, string>();
  /** Transcripts accepted by `save` but not yet handed to the writer (images still being stored). */
  protected readonly acceptedTranscripts = new Map<string, ArchivedMessages>();
  protected sweepScheduled = false;

  constructor(config: StateStoreConfig) {
    this.legacyFile = path.join(config.userDataDir, "claudi-state.json");
    this.indexFile = path.join(config.userDataDir, "state-v2", "index.json");
    this.conversationsDir = path.join(config.userDataDir, "state-v2", "conversations");
    this.imagesDir = path.join(config.userDataDir, "message-images");
    this.legacyCandidates = [this.legacyFile, ...(config.legacyFallbackFiles ?? [])];
    this.writer = config.writer ?? new AtomicFileWriter();
    this.onSettings = config.onSettings ?? (() => undefined);
    this.sweepDelayMs = config.sweepDelayMs === undefined ? 5000 : config.sweepDelayMs;
  }

  protected ensureLoaded(): Promise<void> {
    this.loading ??= this.loadFromDisk();
    return this.loading;
  }

  protected async loadFromDisk(): Promise<void> {
    const indexText = await readTextFile(this.indexFile);
    const parsed = indexText === null ? undefined : parseJson(indexText, this.indexFile);
    if (isPersistedAppIndex(parsed)) {
      this.mode = "v2";
      this.adoptIndex(parsed);
    } else if (this.mode !== "v2") {
      if (indexText !== null) console.error("[state] index.json is invalid; re-migrating from the legacy state");
      this.mode = "legacy";
      const legacy = await readLegacyState(this.legacyCandidates);
      if (legacy) {
        const normalized = await normalizeLegacyStateImages(this.imagesDir, legacy.state);
        this.adoptLegacy(normalized);
        if (normalized !== legacy.state || legacy.source !== this.legacyFile) {
          await this.writer.write(this.legacyFile, () => JSON.stringify(normalized));
        }
      }
    }
    this.scheduleSweep();
  }

  protected async migrateLegacy(): Promise<PersistedAppIndex | null> {
    const legacy = this.legacyState;
    this.mode = "v2";
    try {
      if (!legacy) return null;
      const { index, transcripts } = splitLegacyState(legacy);
      await Promise.all(transcripts.map((t) => this.writeTranscript(t.id, t.archivedMessages)));
      await this.writeIndex(this.pmRepos !== undefined ? { ...index, pmRepos: this.pmRepos } : index);
      this.legacyState = null;
      console.log(`[state] migrated ${transcripts.length} conversation(s) to state-v2`);
      return this.index;
    } finally {
      this.migrated = true;
    }
  }

  protected adoptIndex(index: PersistedAppIndex): PersistedAppIndex {
    this.index = index;
    if (index.pmRepos !== undefined) this.pmRepos = index.pmRepos;
    this.onSettings(index);
    return index;
  }

  protected adoptLegacy(state: PersistedAppState): PersistedAppState {
    this.legacyState = state;
    if (state.pmRepos !== undefined) this.pmRepos = state.pmRepos;
    return state;
  }

  /** Legacy semantics: the renderer's pmRepos wins when present, otherwise main's copy is kept. */
  protected withPreservedPmRepos(state: PersistedAppState): PersistedAppState {
    return state.pmRepos === undefined && this.pmRepos !== undefined ? { ...state, pmRepos: this.pmRepos } : state;
  }

  /** v2: pmRepos is owned by the Project Manager (`gh-save-pm-state`); main's copy wins. */
  protected prepareIndex(raw: Record<string, unknown>): PersistedAppIndex {
    // Parsed on-disk index; sanitizeIndex normalizes `convos` and keeps the other stored fields.
    const index = sanitizeIndex(raw as unknown as PersistedAppIndex);
    return this.pmRepos !== undefined ? { ...index, pmRepos: this.pmRepos } : index;
  }

  protected writeIndex(index: PersistedAppIndex): Promise<void> {
    const adopted = this.adoptIndex(index);
    return this.writer.write(this.indexFile, () => JSON.stringify(adopted));
  }

  protected transcriptPath(conversationId: string): string {
    return path.join(this.conversationsDir, conversationFileName(conversationId));
  }

  protected serializeTranscript(id: string, messages: ArchivedMessages): string {
    const json = JSON.stringify(buildConversationFile(id, truncateArchivedMessages(messages)));
    this.transcriptHashes.set(id, sha1(json));
    return json;
  }

  protected writeTranscript(id: string, messages: ArchivedMessages): Promise<void> {
    return this.writer.write(this.transcriptPath(id), this.serializeTranscript(id, messages));
  }

  protected removeTranscript(id: string): Promise<void> {
    this.transcriptHashes.delete(id);
    return this.writer.remove(this.transcriptPath(id));
  }

  /** Writes a legacy whole state into v2: only changed transcripts, removed ones deleted, then the index. */
  protected splitIntoV2(state: PersistedAppState, ops: FileOps): Promise<void>[] {
    const { index, transcripts } = splitLegacyState(this.withPreservedPmRepos(state));
    const writes: Promise<void>[] = [];
    const keep = new Set<string>();
    for (const { id, archivedMessages } of transcripts) {
      keep.add(id);
      const previous = this.transcriptHashes.get(id);
      const json = this.serializeTranscript(id, archivedMessages);
      if (previous !== this.transcriptHashes.get(id)) writes.push(ops.write(this.transcriptPath(id), json));
    }
    for (const meta of this.index?.convos ?? []) {
      if (keep.has(meta.id)) continue;
      this.transcriptHashes.delete(meta.id);
      writes.push(ops.remove(this.transcriptPath(meta.id)));
    }
    const adopted = this.adoptIndex(index);
    writes.push(ops.write(this.indexFile, JSON.stringify(adopted)));
    return writes;
  }

  protected readonly asyncOps: FileOps = {
    write: (file, data) => this.writer.write(file, data),
    remove: (file) => this.writer.remove(file),
  };

  protected readonly syncOps: FileOps = {
    write: (file, data) => {
      this.writer.writeSync(file, data);
      return Promise.resolve();
    },
    remove: (file) => {
      this.writer.removeSync(file);
      return Promise.resolve();
    },
  };


  protected scheduleSweep(): void {
    if (this.sweepScheduled || this.sweepDelayMs === null) return;
    this.sweepScheduled = true;
    setTimeout(() => void this.sweepImages(), this.sweepDelayMs).unref();
  }

  /** Deletes message images no persisted state references (files touched this session are kept). */
  async sweepImages(): Promise<number> {
    if (this.mode === "v2") {
      if (!this.index) return 0;
      await this.writer.flush();
      return sweepUnreferencedImages(this.imagesDir, this.createdAt, { indexFile: this.indexFile, conversationsDir: this.conversationsDir });
    }
    if (!this.legacyState) return 0;
    return sweepUnreferencedImages(this.imagesDir, this.createdAt, { state: this.legacyState });
  }

}
