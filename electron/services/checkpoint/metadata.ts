/**
 * Checkpoint ids and the metadata block stored in the checkpoint commit
 * message (pure).
 */

export const CHECKPOINT_REF_PREFIX = "refs/claudi-checkpoints/";
export const ZERO_OID = "0000000000000000000000000000000000000000";

/** `cp-YYYYMMDDTHHMMSSmmmZ-<6 hex>` (UTC). */
export function checkpointId(now: Date, entropyHex: string): string {
  const pad = (n: number, len = 2): string => String(n).padStart(len, "0");
  const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}${pad(now.getUTCMilliseconds(), 3)}`;
  return `cp-${date}T${time}Z-${entropyHex}`;
}

export interface CheckpointMeta {
  id: string;
  headOid: string;
  indexTree: string;
  worktreeTree: string;
  createdAt: string;
  untrackedRoots: string[];
  cleanableUntrackedDirRoots: string[];
}

function encodeMetaJson(value: readonly string[]): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodeStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function composeCheckpointMessage(meta: CheckpointMeta): string {
  const lines = [
    `checkpoint:${meta.id}`,
    `head ${meta.headOid}`,
    `index-tree ${meta.indexTree}`,
    `worktree-tree ${meta.worktreeTree}`,
    `created ${meta.createdAt}`,
  ];
  if (meta.untrackedRoots.length > 0) lines.push(`untracked-roots-json ${encodeMetaJson(meta.untrackedRoots)}`);
  if (meta.cleanableUntrackedDirRoots.length > 0) {
    lines.push(`cleanable-untracked-dirs-json ${encodeMetaJson(meta.cleanableUntrackedDirRoots)}`);
  }
  return lines.join("\n");
}

export interface ParsedCheckpointMeta {
  headOid: string | null;
  indexTree: string | null;
  worktreeTree: string | null;
  untrackedRoots: string[];
  cleanableUntrackedDirRoots: string[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parse the metadata out of a raw `git cat-file commit` object. */
export function parseCheckpointCommit(commitText: string): ParsedCheckpointMeta {
  // The message starts after the first blank line of the raw commit object.
  const blankLineIdx = commitText.indexOf("\n\n");
  const body = blankLineIdx !== -1 ? commitText.slice(blankLineIdx + 2) : commitText;
  const field = (key: string): string | null => {
    const match = new RegExp(`^${escapeRegExp(key)} (.+)$`, "m").exec(body);
    return match?.[1]?.trim() ?? null;
  };
  return {
    headOid: field("head"),
    indexTree: field("index-tree"),
    worktreeTree: field("worktree-tree"),
    untrackedRoots: decodeStringArray(field("untracked-roots-json")),
    cleanableUntrackedDirRoots: decodeStringArray(field("cleanable-untracked-dirs-json")),
  };
}
