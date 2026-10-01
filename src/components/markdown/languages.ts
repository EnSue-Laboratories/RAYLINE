/** Fence info-string → Prism grammar name. */
const ALIASES: Readonly<Record<string, string>> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  node: "javascript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  py: "python",
  python3: "python",
  rs: "rust",
  golang: "go",
  yml: "yaml",
  md: "markdown",
  html: "markup",
  xml: "markup",
  svg: "markup",
  dockerfile: "docker",
  "c++": "cpp",
  cc: "cpp",
  hpp: "cpp",
  h: "c",
  kt: "kotlin",
  kts: "kotlin",
  rb: "ruby",
  jsonc: "json",
  json5: "json5",
  patch: "diff",
  cs: "csharp",
  "c#": "csharp",
  objc: "objectivec",
  "objective-c": "objectivec",
  ps1: "powershell",
  tf: "hcl",
  proto: "protobuf",
  ex: "elixir",
  exs: "elixir",
  hs: "haskell",
  ml: "ocaml",
};

export function normalizeLanguage(language: string): string {
  const lower = language.trim().toLowerCase();
  return ALIASES[lower] ?? lower;
}

/** Fenced code `className` (`language-xxx`) → info string, or null. */
export function languageFromClassName(className: string | undefined): string | null {
  return /language-([\w+#.-]+)/.exec(className ?? "")?.[1] ?? null;
}
