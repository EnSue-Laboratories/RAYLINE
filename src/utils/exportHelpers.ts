import type { ChatMessage, MessagePart } from "@shared/chat/types";

/** The conversation shape ChatArea hands to the export button. */
export interface ExportableConversation {
  id?: string | null;
  title?: string | null;
  model?: string | null;
  cwd?: string | null;
  msgs?: readonly ChatMessage[] | null;
}

/** Write text to the clipboard, falling back to a hidden textarea + execCommand. */
export async function copyText(text: string): Promise<void> {
  if (typeof navigator.clipboard?.writeText === "function") {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  // Legacy fallback for contexts without the async clipboard API.
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function sanitizeFileNamePart(value: string | null | undefined, fallback: string): string {
  const sanitized = String(value || "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return sanitized || fallback;
}

export function downloadText(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export type SerializedPart =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "image"; src: string; alt: string; mime?: string; storagePath?: string; originalPath?: string }
  | { type: "status"; kind: string | null; title: string | null; text: string }
  | { type: "tool"; id: string | null; name: string | null; input: unknown; output: unknown; status: string | null };

function serializePart(part: MessagePart): SerializedPart {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text || "" };
    case "thinking":
      return { type: "thinking", text: part.text || "" };
    case "image":
      return {
        type: "image",
        src: part.src || "",
        alt: part.alt || "",
        ...(part.mime ? { mime: part.mime } : {}),
        ...(part.storagePath ? { storagePath: part.storagePath } : {}),
        ...(part.originalPath ? { originalPath: part.originalPath } : {}),
      };
    case "status":
      return { type: "status", kind: part.kind || null, title: part.title || null, text: part.text || "" };
    case "tool":
      return {
        type: "tool",
        id: part.id || null,
        name: part.name || null,
        input: part.args ?? null,
        output: part.result ?? null,
        status: part.status || null,
      };
    default: {
      const exhaustive: never = part;
      return exhaustive;
    }
  }
}

export function serializeMessageParts(parts: readonly MessagePart[] | null | undefined): SerializedPart[] | null {
  if (!Array.isArray(parts)) return null;
  return (parts as readonly MessagePart[]).filter((part) => part && typeof part === "object").map(serializePart);
}

/**
 * Assistant markdown: text parts plus images as `![alt](src)` so exported
 * conversations round-trip when re-rendered as markdown.
 */
export function extractAssistantMarkdown(message: ChatMessage | null | undefined): string {
  if (message?.role === "assistant" && Array.isArray(message.parts)) {
    return message.parts
      .map((part) => {
        if (part.type === "text") return part.text || "";
        if (part.type === "image") {
          const src = part.src || "";
          if (!src) return "";
          const alt = (part.alt || "").replace(/[[\]]/g, "");
          return `![${alt}](${src})`;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return message?.text || "";
}

/** Strip the "[Attached files/images: ...]" prefix from user text. */
function stripAttachedPrefix(text: string): string {
  if (!text) return "";
  const match = /^\[Attached (?:files|images):\n?([^\]]*)\]\n*/s.exec(text);
  return match ? text.slice(match[0].length) : text;
}

export function messageToMarkdown(message: ChatMessage | null | undefined): string {
  if (!message) return "";
  if (message.role === "user") return stripAttachedPrefix(message.text || "").trim();
  const md = extractAssistantMarkdown(message).trim();
  if (md) return md;
  return (message.text || "").trim();
}

function roleHeading(message: ChatMessage): string {
  if (message.role === "user") return "User";
  if (message.role === "system") return "System";
  return "Assistant";
}

function conversationMessages(convo: ExportableConversation | null | undefined): readonly ChatMessage[] {
  return convo?.msgs ?? [];
}

export function conversationToMarkdown(convo: ExportableConversation | null | undefined, now: Date = new Date()): string {
  const title = convo?.title || "Conversation";
  const model = convo?.model || "";
  const messages = conversationMessages(convo);

  const header = [
    `# ${title}`,
    "",
    model ? `- Model: ${model}` : null,
    `- Messages: ${messages.length}`,
    `- Exported: ${now.toISOString()}`,
    "",
    "---",
    "",
  ].filter((line) => line !== null).join("\n");

  const body = messages
    .map((msg) => {
      const content = messageToMarkdown(msg);
      if (!content) return null;
      return `## ${roleHeading(msg)}\n\n${content}\n`;
    })
    .filter(Boolean)
    .join("\n---\n\n");

  return `${header}${body}`.trimEnd() + "\n";
}

export interface ExportedMessage {
  messageIndex: number | null;
  id: string | null;
  role: ChatMessage["role"];
  modelId: string | null;
  markdown: string;
  text: string;
  parts: SerializedPart[] | null;
  toolCalls: unknown[] | null;
}

export function buildMessagePayload(
  message: ChatMessage | null | undefined,
  markdownText: string,
  modelId: string | null | undefined,
  messageIndex: number | null | undefined,
): ExportedMessage {
  const assistant = message?.role === "assistant" ? message : null;
  return {
    messageIndex: typeof messageIndex === "number" && Number.isFinite(messageIndex) ? messageIndex : null,
    id: message?.id || null,
    role: message?.role || "assistant",
    modelId: modelId || null,
    markdown: markdownText || "",
    text: message?.text || "",
    parts: serializeMessageParts(assistant?.parts),
    toolCalls: Array.isArray(assistant?.toolCalls) ? assistant.toolCalls : null,
  };
}

export interface ExportedConversation {
  exportedAt: string;
  id: string | null;
  title: string | null;
  modelId: string | null;
  cwd: string | null;
  messageCount: number;
  messages: ExportedMessage[];
}

export function conversationToJson(convo: ExportableConversation | null | undefined, now: Date = new Date()): ExportedConversation {
  const messages = conversationMessages(convo);
  return {
    exportedAt: now.toISOString(),
    id: convo?.id || null,
    title: convo?.title || null,
    modelId: convo?.model || null,
    cwd: convo?.cwd || null,
    messageCount: messages.length,
    messages: messages.map((msg, index) =>
      buildMessagePayload(msg, messageToMarkdown(msg), convo?.model || null, index),
    ),
  };
}

/** `<title≤40>-<id≤12>` used for download file names. */
export function buildExportBaseFileName(convo: ExportableConversation | null | undefined): string {
  const title = sanitizeFileNamePart(convo?.title, "conversation").slice(0, 40);
  const idPart = sanitizeFileNamePart(convo?.id, "export").slice(0, 12);
  return `${title}-${idPart}`;
}
