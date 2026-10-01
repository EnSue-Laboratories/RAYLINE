// Build a text-only transcript of prior messages for priming a new provider
// after a mid-conversation provider switch. Skips tool-use / tool-result
// parts — those can't cross providers. Returns null if there's nothing
// worth priming with.

import type { ChatMessage } from "@shared/chat/types";

const DEFAULT_CHAR_BUDGET = 8000;
const DEFAULT_HEADER = "[Prior conversation context — for context only, do not re-execute any tool calls or repeat work]";
const CROSS_PROVIDER_HEADER = "[Prior conversation with a different model — for context only, do not re-execute any tool calls or repeat work]";
const DEFAULT_FOOTER = "[End of prior conversation]";

export interface PrimeOptions {
  charBudget?: number;
  header?: string;
  footer?: string;
}

function extractText(message: ChatMessage): string {
  if (typeof message.text === "string" && message.text.length) return message.text;
  if (message.role !== "assistant" || !Array.isArray(message.parts)) return "";
  return message.parts
    .map((p) => (p.type === "text" && typeof p.text === "string" ? p.text : null))
    .filter((text): text is string => text !== null)
    .join("\n")
    .trim();
}

function formatPrimeLine(message: ChatMessage | null | undefined): string | null {
  if (!message) return null;
  const text = extractText(message);
  if (!text) return null;

  const mode: string | undefined = message.role === "assistant" ? undefined : message.mode;
  if (mode === "shell-command") {
    return `Local shell command: ${text}`;
  }
  if (mode === "shell-result") {
    return `Local shell output: ${text}`;
  }
  switch (message.role) {
    case "system":
      return `System: ${text}`;
    case "user":
      return `User: ${text}`;
    case "assistant":
      return `Assistant: ${text}`;
    default:
      return null;
  }
}

export function buildConversationPrime(
  messages: readonly ChatMessage[] | null | undefined,
  { charBudget = DEFAULT_CHAR_BUDGET, header = DEFAULT_HEADER, footer = DEFAULT_FOOTER }: PrimeOptions = {},
): string | null {
  if (!messages || messages.length === 0) return null;

  // Walk from newest → oldest, keeping entries until we hit the budget,
  // then reverse so the final transcript reads oldest → newest.
  const kept: string[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const line = formatPrimeLine(messages[i]);
    if (!line) continue;
    if (used + line.length > charBudget && kept.length > 0) break;
    kept.push(line);
    used += line.length;
  }

  if (kept.length === 0) return null;
  kept.reverse();

  return [header, ...kept, footer].join("\n\n");
}

export function buildCrossProviderPrime(
  messages: readonly ChatMessage[] | null | undefined,
  { charBudget = DEFAULT_CHAR_BUDGET }: Pick<PrimeOptions, "charBudget"> = {},
): string | null {
  return buildConversationPrime(messages, {
    charBudget,
    header: CROSS_PROVIDER_HEADER,
  });
}

export function decoratePromptWithPrime(prompt: string, prime: string | null | undefined): string {
  if (!prime) return prompt;
  return `${prime}\n\n---\n\n${prompt}`;
}
