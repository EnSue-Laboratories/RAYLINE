/**
 * Dev-only fixture: `__raylineDevAddImageDemo()` in the devtools console
 * drops an assistant message exercising every image-rendering path
 * (markdown image, data URL, structured image part, fenced ```image block)
 * into the active conversation.
 */

import { getActiveId } from "../store/convoList";
import { getConversation, replaceMessages } from "../store/conversations";

interface DevWindow extends Window {
  __raylineDevAddImageDemo?: (conversationId?: string) => void;
}

const PUBLIC_DEMO_URL = "https://raw.githubusercontent.com/anthropics/anthropic-cookbook/main/images/anthropic_logo_horizontal.png";
const TINY_TRANSPARENT_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

function addImageDemo(conversationId?: string): void {
  const targetId = conversationId || getActiveId();
  if (!targetId) {
    console.warn("[devImageDemo] No active conversation. Open one first.");
    return;
  }
  const now = Date.now();
  replaceMessages(targetId, [
    ...getConversation(targetId).messages,
    { id: `dev-img-user-${now}`, role: "user", text: "Show me an image rendering demo.", localOnly: true },
    {
      id: `dev-img-assistant-${now}`,
      role: "assistant",
      parts: [
        {
          type: "text",
          text:
            "Here are three ways the assistant can emit images:\n\n" +
            `**1. Markdown image:** ![Anthropic logo](${PUBLIC_DEMO_URL})\n\n` +
            `**2. Inline base64 (1×1 transparent png):** ![tiny pixel](${TINY_TRANSPARENT_PNG_DATA_URL})\n\n` +
            "**3. Structured image part follows below, then a fenced ```image block:**",
        },
        { type: "image", id: "dev-img-part-1", src: PUBLIC_DEMO_URL, alt: "Anthropic logo (structured image part)" },
        {
          type: "text",
          text:
            "```image\n" +
            JSON.stringify({ src: PUBLIC_DEMO_URL, alt: "Anthropic logo (fenced image block)" }) +
            "\n```\n\nClick an image to expand it.",
        },
      ],
    },
  ]);
  console.info("[devImageDemo] Injected fixture into conversation", targetId);
}

export function installDevFixtures(): () => void {
  if (typeof window === "undefined" || !import.meta.env.DEV) return () => {};
  const devWindow: DevWindow = window;
  devWindow.__raylineDevAddImageDemo = addImageDemo;
  return () => {
    delete devWindow.__raylineDevAddImageDemo;
  };
}
