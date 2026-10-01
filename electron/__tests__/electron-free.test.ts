import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Providers and services must load outside Electron (unit tests, CI without
// the Electron binary). Guard against a value import of "electron" creeping
// into their transitive dependencies.
const ROOT = path.resolve(__dirname, "..");
const ENTRIES = ["providers/model-catalog.ts", "providers/grok/session.ts", "providers/agy/session.ts", "terminal-manager.ts"];

function valueImports(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const specs: string[] = [];
  for (const match of src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)";/gms)) specs.push(match[1] ?? "");
  for (const match of src.matchAll(/^export\s+(?!type\b)[^;]*?from\s+"([^"]+)";/gms)) specs.push(match[1] ?? "");
  return specs;
}

function resolveLocal(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

describe("Electron-free main-process modules", () => {
  it.each(ENTRIES)("%s has no transitive value import of electron", (entry) => {
    const seen = new Set<string>();
    const offenders: string[] = [];
    const stack = [path.join(ROOT, entry)];
    while (stack.length) {
      const file = stack.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const spec of valueImports(file)) {
        if (spec === "electron") offenders.push(path.relative(ROOT, file));
        const local = resolveLocal(file, spec);
        if (local) stack.push(local);
      }
    }
    expect(offenders).toEqual([]);
  });
});
