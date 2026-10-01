/**
 * Removes `//` and `/* *\/` comments outside of string literals (JSONC →
 * JSON). Line comments keep their newline so error positions stay close.
 */
export function stripJsonComments(input: string): string {
  let output = "";
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input.charAt(i);
    const next = input.charAt(i + 1);
    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (i < input.length && input.charAt(i) !== "\n") i += 1;
      output += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      i += 2;
      while (i < input.length && !(input.charAt(i) === "*" && input.charAt(i + 1) === "/")) i += 1;
      i += 1;
      continue;
    }
    output += char;
  }
  return output;
}

/** Parses JSON-with-comments; an empty / whitespace-only document is `{}`. Throws on invalid JSON. */
export function parseJsonc(text: string): unknown {
  if (!text.trim()) return {};
  return JSON.parse(stripJsonComments(text)) as unknown;
}
