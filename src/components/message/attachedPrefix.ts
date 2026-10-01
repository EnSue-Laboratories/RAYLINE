import type { FileAttachment } from "@shared/chat/types";

const ATTACHED_PREFIX_RE = /^\[Attached (?:files|images):\n?([^\]]*)\]\n*/s;

/** Strip the `[Attached files: …]` prompt prefix; recover file chips from it when `files` is absent. */
export function splitAttachedPrefix(text: string, files: readonly FileAttachment[] | undefined): { displayText: string; files: readonly FileAttachment[] | undefined } {
  const match = ATTACHED_PREFIX_RE.exec(text);
  if (!match) return { displayText: text, files };
  const displayText = text.slice(match[0].length);
  if (files && files.length > 0) return { displayText, files };
  const extracted = (match[1] ?? "")
    .split("\n")
    .filter(Boolean)
    .map((line): FileAttachment => ({ type: "file", name: line.trim().split("/").pop(), path: line.trim() }));
  return { displayText, files: extracted };
}
