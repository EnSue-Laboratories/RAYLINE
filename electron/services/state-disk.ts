/**
 * Disk helpers for the state store: tolerant reads and image normalization
 * of legacy whole-state objects.
 */

import fs from "node:fs";
import { isPersistedAppState, type PersistedAppState } from "@shared/state/types";
import type { Conversation } from "@shared/chat/types";
import { errorCode } from "./errors";
import { normalizeTranscriptImagesAsync, normalizeTranscriptImagesSync } from "./message-images";


/** File contents, or null when missing / unreadable (non-ENOENT errors are logged). */
export async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(filePath, "utf-8");
  } catch (error) {
    if (errorCode(error) !== "ENOENT") console.warn(`[state] failed to read ${filePath}:`, error);
    return null;
  }
}

export function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    console.error(`[state] ${label} is not valid JSON:`, error);
    return undefined;
  }
}

export interface LegacyStateFile {
  state: PersistedAppState;
  /** Path it was read from. */
  source: string;
}

/** First readable legacy state among `candidates` (primary file first, then old app names). */
export async function readLegacyState(candidates: readonly string[]): Promise<LegacyStateFile | null> {
  for (const source of candidates) {
    const text = await readTextFile(source);
    if (text === null) continue;
    const parsed = parseJson(text, source);
    if (isPersistedAppState(parsed)) return { state: parsed, source };
    console.error(`[state] ignoring ${source}: unexpected shape`);
  }
  return null;
}

type TranscriptNormalizer = (messages: Conversation["archivedMessages"]) => Conversation["archivedMessages"];

function mapConvos(state: PersistedAppState, normalize: TranscriptNormalizer): PersistedAppState {
  if (!Array.isArray(state.convos)) return state;
  let changed = false;
  const convos = state.convos.map((convo) => {
    if (typeof convo !== "object" || convo === null || !Array.isArray(convo.archivedMessages)) return convo;
    const archivedMessages = normalize(convo.archivedMessages);
    if (archivedMessages === convo.archivedMessages) return convo;
    changed = true;
    return { ...convo, archivedMessages };
  });
  return changed ? { ...state, convos } : state;
}

/** Stores inline message images; returns the same object when nothing changed. */
export async function normalizeLegacyStateImages(imagesDir: string, state: PersistedAppState): Promise<PersistedAppState> {
  if (!Array.isArray(state.convos)) return state;
  const normalized = new Map<Conversation["archivedMessages"], Conversation["archivedMessages"]>();
  for (const convo of state.convos) {
    if (typeof convo !== "object" || convo === null || !Array.isArray(convo.archivedMessages)) continue;
    const next = await normalizeTranscriptImagesAsync(imagesDir, convo.archivedMessages);
    if (next !== convo.archivedMessages) normalized.set(convo.archivedMessages, next);
  }
  if (normalized.size === 0) return state;
  return mapConvos(state, (messages) => normalized.get(messages) ?? messages);
}

export function normalizeLegacyStateImagesSync(imagesDir: string, state: PersistedAppState): PersistedAppState {
  return mapConvos(state, (messages) => normalizeTranscriptImagesSync(imagesDir, messages));
}
