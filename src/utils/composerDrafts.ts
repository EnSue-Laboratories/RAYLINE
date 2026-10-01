// Per-scope composer drafts (conversation composer and the new-chat form),
// persisted in localStorage under `rayline.composerDraft:<scope>`.
// Ported from #230. Text fields and attachments are stored under separate
// keys so typing never re-serializes (potentially large) attachment payloads.

const PREFIX = "rayline.composerDraft:";
const ATTACHMENTS_SUFFIX = ":attachments";
const DRAFT_VERSION = 1;

/** Arbitrary draft fields; `text` and `attachments` are conventional. */
export interface ComposerDraft {
  text?: string;
  attachments?: readonly unknown[];
  [field: string]: unknown;
}

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// In-memory copy survives navigation even when storage is unavailable/full.
const cache = new Map<string, ComposerDraft>();

function defaultStorage(): DraftStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFields(raw: string): ComposerDraft {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && parsed.version === DRAFT_VERSION && isRecord(parsed.data)) {
      return { ...parsed.data };
    }
  } catch {
    // Older versions stored the plain text.
  }
  return { text: raw };
}

export function readDraft(scope: string | null | undefined, storage: DraftStorage | undefined = defaultStorage()): ComposerDraft {
  if (!scope) return {};
  const cached = cache.get(scope);
  if (cached) return cached;
  try {
    const raw = storage?.getItem(PREFIX + scope);
    if (!raw) return {};
    const draft = parseFields(raw);
    const rawAttachments = storage?.getItem(PREFIX + scope + ATTACHMENTS_SUFFIX);
    if (rawAttachments) {
      try {
        const parsed: unknown = JSON.parse(rawAttachments);
        if (Array.isArray(parsed)) draft.attachments = parsed as unknown[];
      } catch {
        // Keep the text if attachment data is damaged.
      }
    }
    cache.set(scope, draft);
    return draft;
  } catch {
    return {};
  }
}

export function writeDraft(
  scope: string | null | undefined,
  draft: ComposerDraft,
  storage: DraftStorage | undefined = defaultStorage(),
): void {
  if (!scope) return;
  const previous = cache.get(scope);
  cache.set(scope, draft);
  const key = PREFIX + scope;
  try {
    if (Object.keys(draft).length === 0) {
      storage?.removeItem(key);
      storage?.removeItem(key + ATTACHMENTS_SUFFIX);
      return;
    }
    const { attachments, ...fields } = draft;
    storage?.setItem(key, JSON.stringify({ version: DRAFT_VERSION, data: fields }));
    if (attachments !== previous?.attachments) {
      if (attachments?.length) storage?.setItem(key + ATTACHMENTS_SUFFIX, JSON.stringify(attachments));
      else storage?.removeItem(key + ATTACHMENTS_SUFFIX);
    }
  } catch {
    // Storage unavailable or full: the in-memory cache still holds the draft.
  }
}

export function clearDraft(scope: string | null | undefined, storage?: DraftStorage): void {
  writeDraft(scope, {}, storage);
}

/** Test hook: forget cached drafts. */
export function resetDraftCacheForTests(): void {
  cache.clear();
}
