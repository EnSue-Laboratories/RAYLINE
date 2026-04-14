export const MODELS = [
  { id: "opus",   name: "Claude Opus",   tag: "OPUS",   cliFlag: "opus",   provider: "claude" },
  { id: "sonnet", name: "Claude Sonnet", tag: "SONNET", cliFlag: "sonnet", provider: "claude" },
  { id: "haiku",  name: "Claude Haiku",  tag: "HAIKU",  cliFlag: "haiku",  provider: "claude" },
  { id: "gpt54-med",   name: "GPT-5.4",        tag: "GPT-5.4",       cliFlag: "gpt-5.4", provider: "codex", effort: "medium" },
  { id: "gpt54-high",  name: "GPT-5.4 High",   tag: "GPT-5.4 HIGH",  cliFlag: "gpt-5.4", provider: "codex", effort: "high" },
  { id: "gpt54-xhigh", name: "GPT-5.4 XHigh",  tag: "GPT-5.4 XHIGH", cliFlag: "gpt-5.4", provider: "codex", effort: "xhigh" },
];

export const getM = (id) => MODELS.find((m) => m.id === id) || MODELS[0];
