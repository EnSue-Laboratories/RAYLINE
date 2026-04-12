export const MODELS = [
  { id: "opus",   name: "Claude Opus",   tag: "OPUS",   cliFlag: "opus"   },
  { id: "sonnet", name: "Claude Sonnet", tag: "SONNET", cliFlag: "sonnet" },
  { id: "haiku",  name: "Claude Haiku",  tag: "HAIKU",  cliFlag: "haiku"  },
];

export const getM = (id) => MODELS.find((m) => m.id === id) || MODELS[0];
