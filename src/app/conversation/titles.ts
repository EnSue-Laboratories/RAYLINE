import type { Attachment } from "@shared/chat/types";

/** Title for a new conversation: the prompt's first 50 chars, else its attachments. */
export function deriveConversationTitle(text: string | null | undefined, attachments?: readonly Attachment[] | null): string {
  const trimmed = (text || "").trim();
  if (trimmed) return trimmed.slice(0, 50);
  const list = attachments ?? [];
  const first = list[0];
  if (first) {
    const name = first.name || (first.type === "image" ? "Image" : "Attachment");
    const extra = list.length > 1 ? ` +${list.length - 1}` : "";
    return `${name}${extra}`.slice(0, 50);
  }
  return "New chat";
}
