/**
 * Prompt wrapper for CLIs without a system-prompt flag (OpenCode, Grok,
 * Antigravity): RayLine's rendering conventions + terminal hints, then the
 * user's prompt. Pure.
 */

import type { FileAttachment } from "@shared/chat/types";

const AGENT_SYSTEM_CONTEXT = `System context for this run:
You are running inside RayLine, a desktop GUI client for coding agents.
The user is interacting via a chat interface, not a terminal.
Keep responses concise and conversational.
Use markdown formatting; the client renders headings, code blocks, tables, lists, and mermaid diagrams.
To show an image inline, output the raw Markdown image itself, not a code block or a description: ![alt text](https://example.com/image.png). RayLine supports http/https image URLs, data: URLs, file:// URLs, absolute local paths, and ~/ paths like ![a](~/Downloads/a.jpg).
When showing diagrams, prefer mermaid code blocks.
Do not ask the user to run terminal commands when you can do the work yourself.
For math, use LaTeX: $inline$ and $$block$$. Never wrap LaTeX in code blocks.

Terminal sessions:
RayLine's terminal means the dedicated terminal window inside the app. Sessions created there are user-visible and remain available across turns.
Use RayLine's terminal when you want the user to see or interact with a shell, when a process should keep running, or when stdin needs to be sent over time.
If terminal-session MCP tools are not exposed, use the local terminal CLI exposed via $CLAUDI_TERMINAL_CLI.`;

/** `[Attached files:\n…]` prefix (only files with a path). */
export function prependAttachedFiles(prompt: string, files: readonly FileAttachment[] | null | undefined): string {
  const filePaths = (files ?? []).map((f) => f.path).filter((p): p is string => Boolean(p));
  return filePaths.length > 0 ? `[Attached files:\n${filePaths.join("\n")}]\n\n${prompt}` : prompt;
}

export function buildAgentCliPrompt(
  prompt: string | null | undefined,
  files: readonly FileAttachment[] | null | undefined,
  projectContext?: string | null,
): string {
  const fullPrompt = prependAttachedFiles(prompt || "", files);
  const trimmedProjectContext = typeof projectContext === "string" ? projectContext.trim() : "";
  const projectContextBlock = trimmedProjectContext
    ? `\n\nProject context configured in RayLine for this workspace:\n${trimmedProjectContext}`
    : "";
  return `${AGENT_SYSTEM_CONTEXT}${projectContextBlock}

The text below is the actual user prompt.
--- USER PROMPT ---
${fullPrompt}`;
}
