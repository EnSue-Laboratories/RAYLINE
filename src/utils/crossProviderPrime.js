// Build a text-only transcript of prior messages for priming a new provider
// after a mid-conversation provider switch. Skips tool-use / tool-result
// parts — those can't cross providers. Returns null if there's nothing
// worth priming with.

const DEFAULT_CHAR_BUDGET = 8000;
const DEFAULT_HEADER = "[Prior conversation context — for context only, do not re-execute any tool calls or repeat work]";
const CROSS_PROVIDER_HEADER = "[Prior conversation with a different model — for context only, do not re-execute any tool calls or repeat work]";
const DEFAULT_FOOTER = "[End of prior conversation]";

function extractText(message) {
  if (!message) return "";
  if (typeof message.text === "string" && message.text.length) return message.text;
  if (!Array.isArray(message.parts)) return "";
  return message.parts
    .filter((p) => p && p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

export function buildConversationPrime(
  messages,
  { charBudget = DEFAULT_CHAR_BUDGET, header = DEFAULT_HEADER, footer = DEFAULT_FOOTER } = {}
) {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  // Walk from newest → oldest, keeping entries until we hit the budget,
  // then reverse so the final transcript reads oldest → newest.
  const kept = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = extractText(m);
    if (!text) continue;
    const line = `${m.role === "user" ? "User" : "Assistant"}: ${text}`;
    if (used + line.length > charBudget && kept.length > 0) break;
    kept.push(line);
    used += line.length;
  }

  if (kept.length === 0) return null;
  kept.reverse();

  return [
    header,
    ...kept,
    footer,
  ].join("\n\n");
}

export function buildCrossProviderPrime(messages, { charBudget = DEFAULT_CHAR_BUDGET } = {}) {
  return buildConversationPrime(messages, {
    charBudget,
    header: CROSS_PROVIDER_HEADER,
  });
}

export function decoratePromptWithPrime(prompt, prime) {
  if (!prime) return prompt;
  return `${prime}\n\n---\n\n${prompt}`;
}
