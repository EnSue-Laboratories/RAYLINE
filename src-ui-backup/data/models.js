export const MODELS = [
  { id: "claude-opus",   name: "Claude Opus",   tag: "OPUS"   },
  { id: "claude-sonnet", name: "Claude Sonnet", tag: "SONNET" },
  { id: "gpt-4o",        name: "GPT-4o",        tag: "4O"     },
  { id: "gemini-pro",    name: "Gemini Pro",    tag: "GEMINI" },
];

export const getM = (id) => MODELS.find((m) => m.id === id) || MODELS[0];
