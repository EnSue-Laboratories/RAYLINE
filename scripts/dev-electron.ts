#!/usr/bin/env node
// Launches Electron against the Vite dev server.
//
//   node scripts/dev-electron.ts [vite-port]
//
// Runs directly on Node's type stripping: erasable TypeScript only.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

// The `electron` npm package's main export is the path to the binary
// (its typings describe the Electron API instead, hence `unknown`).
const electronBinary: unknown = createRequire(import.meta.url)("electron");
if (typeof electronBinary !== "string") {
  console.error("[dev-electron] Could not resolve the Electron binary.");
  process.exit(1);
}

const port = process.argv[2] || process.env.VITE_PORT || "5173";

const child = spawn(electronBinary, ["."], {
  stdio: "inherit",
  env: { ...process.env, VITE_PORT: port },
});

function forwardSignal(signal: NodeJS.Signals): void {
  if (child.exitCode === null && child.signalCode === null) child.kill(signal);
}

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("error", (error) => {
  console.error("[dev-electron] Failed to launch Electron:", error.message);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
