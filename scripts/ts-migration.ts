// Tracks the strict-TypeScript migration.
//
//   node scripts/ts-migration.ts report   list files still marked @ts-nocheck
//   node scripts/ts-migration.ts lint     eslint every converted TS file
//
// A file counts as converted once its `// @ts-nocheck` header is removed.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TS_FILE = /\.(ts|tsx)$/;
const SOURCE_ROOTS = ["src/", "electron/", "shared/", "scripts/"];

function trackedTsFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  return out
    .split("\n")
    .filter((f) => TS_FILE.test(f) && SOURCE_ROOTS.some((root) => f.startsWith(root)) && !f.endsWith(".d.ts"));
}

function isUnconverted(file: string): boolean {
  return /^(#!.*\n)?\/\/ @ts-nocheck/.test(readFileSync(file, "utf8"));
}

const mode = process.argv[2] ?? "report";
const files = trackedTsFiles();
const pending = files.filter(isUnconverted);
const converted = files.filter((f) => !pending.includes(f));

if (mode === "report") {
  for (const file of pending) console.log(`pending  ${file}`);
  console.log(`\n${converted.length}/${files.length} files converted, ${pending.length} still @ts-nocheck`);
} else if (mode === "lint") {
  const targets = [...converted, "vite.config.ts"];
  const result = spawnSync("npx", ["eslint", "--max-warnings=0", ...targets], { stdio: "inherit" });
  process.exit(result.status ?? 1);
} else {
  console.error(`unknown mode: ${mode}`);
  process.exit(2);
}
