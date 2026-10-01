/** Prompt wrapper RayLine sends to `codex exec` (Codex has no system-prompt flag). Pure. */

import type { FileAttachment } from "@shared/chat/types";

const REMOTE_TERMINAL_INSTRUCTIONS = `Terminal sessions:
You are running on a remote SSH host from RayLine. RayLine's local terminal MCP and $CLAUDI_TERMINAL_CLI are not available on this host.
Use normal shell commands on the remote host for long-running processes, and tell the user when a command must keep running after your turn.`;

const MCP_TERMINAL_INSTRUCTIONS = `Terminal sessions:
RayLine's terminal means the dedicated terminal window inside the app. Sessions created there are user-visible and remain available across turns.
Use RayLine's terminal when you want the user to see or interact with a shell, when a process should keep running, or when stdin needs to be sent over time.
Prefer RayLine's terminal over one-off shell commands for dev servers, watchers, REPLs, or any command the user may want to monitor.
If MCP terminal tools are unavailable, use the local terminal CLI exposed via $CLAUDI_TERMINAL_CLI.
CLI examples:
- node "$CLAUDI_TERMINAL_CLI" list
- node "$CLAUDI_TERMINAL_CLI" create <name> --cwd <path>
- node "$CLAUDI_TERMINAL_CLI" send <name> "npm run dev\\n"
- node "$CLAUDI_TERMINAL_CLI" read <name> --lines 80
- node "$CLAUDI_TERMINAL_CLI" kill <name>`;

const CLI_TERMINAL_INSTRUCTIONS = `Terminal sessions:
RayLine's terminal means the dedicated terminal window inside the app. Do not describe it generically; use it when you want a user-visible, long-lived shell inside RayLine itself.
If terminal-session MCP tools are not exposed, use the local terminal CLI exposed via $CLAUDI_TERMINAL_CLI to control RayLine's terminal window directly.
CLI examples:
- node "$CLAUDI_TERMINAL_CLI" list
- node "$CLAUDI_TERMINAL_CLI" create <name> --cwd <path>
- node "$CLAUDI_TERMINAL_CLI" send <name> "npm run dev\\n"
- node "$CLAUDI_TERMINAL_CLI" read <name> --lines 80
- node "$CLAUDI_TERMINAL_CLI" kill <name>`;

const CODEX_SYSTEM_CONTEXT = `System context for this run:
You are running inside RayLine, a desktop GUI client for coding agents.
The user is interacting via a chat interface, not a terminal.
Keep responses concise and conversational.
Use markdown formatting; the client renders headings, code blocks, tables, lists, and mermaid diagrams.
To show an image inline, output the raw Markdown image itself, not a code block or a description: ![alt text](https://example.com/image.png). RayLine supports http/https image URLs, data: URLs, file:// URLs, absolute local paths, and ~/ paths like ![a](~/Downloads/a.jpg).
When showing diagrams, prefer mermaid code blocks.
Do not ask the user to run terminal commands when you can do the work yourself.
For math, use LaTeX: $inline$ and $$block$$. Never wrap LaTeX in code blocks.

Interactive render blocks:
Output fenced code blocks with language tag "render" to display live HTML inline in the chat.

Interactive control blocks:
Output fenced code blocks with language tag "control" to display structured interactive controls inline in the chat.
The contents must be a JSON object.
Supported type:
- "value_control": a slider-like numeric control

Supported fields:
- type, label, target
- mode: "continuous" or "discrete"
- min, max, step, value
- options: array of { value, label } for discrete controls
- unit, help, actionLabel, messageTemplate

Behavior:
- If target maps to a supported app value, the control may apply directly while the user drags it.
- Live-bound controls do not require a send button.
- If there is no live target, the control can fall back to sending a follow-up message.

Example:
\`\`\`control
{
  "type": "value_control",
  "label": "Image opacity",
  "target": "wallpaper.imgOpacity",
  "mode": "continuous",
  "min": 0,
  "max": 100,
  "step": 1,
  "value": 70,
  "unit": "%",
  "messageTemplate": "Set image opacity to {{value}}{{unit}}."
}
\`\`\`

When a control is not live-bound and the user submits it, RayLine will send a normal follow-up chat message with the selected value back into the conversation.

`;

export interface CodexPromptOptions {
  remote: boolean;
  /** The terminal-sessions MCP server is configured and enabled. */
  hasTerminalSessions: boolean;
  remoteChannelInstructions?: string | null;
}

export function buildCodexPrompt(
  prompt: string,
  files: readonly FileAttachment[] | null | undefined,
  { remote, hasTerminalSessions, remoteChannelInstructions }: CodexPromptOptions,
): string {
  let fullPrompt = prompt;
  const filePaths = (files ?? []).map((f) => f.path).filter((p): p is string => Boolean(p));
  if (filePaths.length > 0) {
    const label = remote ? "Attached files uploaded to the remote SSH host" : "Attached files";
    fullPrompt = `[${label}:\n${filePaths.join("\n")}]\n\n${fullPrompt}`;
  }

  const terminalInstructions = remote
    ? REMOTE_TERMINAL_INSTRUCTIONS
    : hasTerminalSessions
      ? MCP_TERMINAL_INSTRUCTIONS
      : CLI_TERMINAL_INSTRUCTIONS;
  const channel = remote && remoteChannelInstructions ? `\n\n${remoteChannelInstructions}` : "";

  return `${CODEX_SYSTEM_CONTEXT}${terminalInstructions}${channel}

The text below is the actual user prompt.
--- USER PROMPT ---
${fullPrompt}`;
}
