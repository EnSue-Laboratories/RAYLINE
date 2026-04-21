export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
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
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function sanitizeFileNamePart(value, fallback) {
  const sanitized = String(value || "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return sanitized || fallback;
}

export function downloadText(content, filename, mimeType) {
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

export function serializeMessageParts(parts) {
  if (!Array.isArray(parts)) return null;
  return parts.map((part) => {
    if (!part || typeof part !== "object") return part;
    if (part.type === "text") return { type: "text", text: part.text || "" };
    if (part.type === "thinking") return { type: "thinking", text: part.text || "" };
    if (part.type === "status") {
      return {
        type: "status",
        kind: part.kind || null,
        title: part.title || null,
        text: part.text || "",
      };
    }
    if (part.type === "tool") {
      return {
        type: "tool",
        id: part.id || null,
        name: part.name || null,
        callId: part.callId || null,
        input: part.input ?? null,
        output: part.output ?? null,
        status: part.status || null,
      };
    }
    return { ...part };
  });
}

export function extractAssistantMarkdown(message) {
  if (Array.isArray(message?.parts)) {
    return message.parts
      .filter((part) => part?.type === "text" && part.text)
      .map((part) => part.text)
      .join("\n");
  }
  return message?.text || "";
}

// Strip the "[Attached files/images: ...]" prefix from user text for cleaner markdown.
function stripAttachedPrefix(text) {
  if (!text) return "";
  const match = text.match(/^\[Attached (?:files|images):\n?([^\]]*)\]\n*/s);
  return match ? text.slice(match[0].length) : text;
}

export function messageToMarkdown(message) {
  if (!message) return "";
  if (message.role === "user") {
    return stripAttachedPrefix(message.text || "").trim();
  }
  const md = extractAssistantMarkdown(message).trim();
  if (md) return md;
  return (message.text || "").trim();
}

function roleHeading(message) {
  if (message?.role === "user") return "User";
  if (message?.role === "system") return "System";
  return "Assistant";
}

export function conversationToMarkdown(convo) {
  const title = convo?.title || "Conversation";
  const model = convo?.model || "";
  const messages = Array.isArray(convo?.msgs) ? convo.msgs : [];

  const header = [
    `# ${title}`,
    "",
    model ? `- Model: ${model}` : null,
    `- Messages: ${messages.length}`,
    `- Exported: ${new Date().toISOString()}`,
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

export function buildMessagePayload(message, markdownText, modelId, messageIndex) {
  return {
    messageIndex: Number.isFinite(messageIndex) ? messageIndex : null,
    id: message?.id || null,
    role: message?.role || "assistant",
    modelId: modelId || null,
    markdown: markdownText || "",
    text: message?.text || "",
    parts: serializeMessageParts(message?.parts),
    toolCalls: Array.isArray(message?.toolCalls) ? message.toolCalls : null,
  };
}

export function conversationToJson(convo) {
  const messages = Array.isArray(convo?.msgs) ? convo.msgs : [];
  return {
    exportedAt: new Date().toISOString(),
    id: convo?.id || null,
    title: convo?.title || null,
    modelId: convo?.model || null,
    cwd: convo?.cwd || null,
    messageCount: messages.length,
    messages: messages.map((msg, index) =>
      buildMessagePayload(msg, messageToMarkdown(msg), convo?.model || null, index)
    ),
  };
}
