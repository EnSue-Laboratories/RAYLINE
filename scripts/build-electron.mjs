#!/usr/bin/env node
// Bundles the Electron main process, preloads and standalone helper scripts
// into dist-electron/, mirroring the source layout so __dirname-relative
// lookups (preloads, vendor/, shell-init/, ../scripts/*) keep working.
//
//   node scripts/build-electron.mjs           one-shot production build
//   node scripts/build-electron.mjs --watch   rebuild on change (dev)

import { build, context } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = join(root, "dist-electron");
const watch = process.argv.includes("--watch");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
// ws probes these optional native addons inside try/catch; leave them unresolved.
const WS_OPTIONAL_NATIVE = ["bufferutil", "utf-8-validate"];
const runtimeDeps = Object.keys(pkg.dependencies ?? {});

/** First existing candidate wins, so entries can migrate .cjs -> .ts in place. */
function pickEntry(candidates) {
  for (const candidate of candidates) {
    if (existsSync(join(root, candidate))) return join(root, candidate);
  }
  throw new Error(`No entry found among: ${candidates.join(", ")}`);
}

const targets = [
  {
    // Main process: node_modules stay external (electron-builder ships them,
    // and node-pty is native).
    entry: ["electron/main.ts", "electron/main.cjs"],
    out: "electron/main.cjs",
    external: ["electron", ...runtimeDeps],
  },
  {
    // Sandboxed preloads may only require "electron", so bundle everything else.
    entry: ["electron/preload/main.ts", "electron/preload.ts", "electron/preload.cjs"],
    out: "electron/preload.cjs",
    external: ["electron"],
  },
  {
    entry: ["electron/preload/project-manager.ts", "electron/preload-pm.ts", "electron/preload-pm.cjs"],
    out: "electron/preload-pm.cjs",
    external: ["electron"],
  },
  {
    // Spawned with the system `node` from app.asar.unpacked, so it must be
    // fully self-contained (no node_modules lookups).
    entry: ["electron/support/mcp-terminal-server.ts", "electron/mcp-terminal-server.ts", "electron/mcp-terminal-server.cjs"],
    out: "electron/mcp-terminal-server.cjs",
    external: WS_OPTIONAL_NATIVE,
  },
  {
    entry: ["scripts/claudi-terminal.ts", "scripts/claudi-terminal.cjs"],
    out: "scripts/claudi-terminal.cjs",
    external: WS_OPTIONAL_NATIVE,
  },
];

function optionsFor(target) {
  return {
    entryPoints: [pickEntry(target.entry)],
    outfile: join(outRoot, target.out),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    sourcemap: watch ? "inline" : false,
    external: target.external,
    tsconfig: join(root, "tsconfig.electron.json"),
    logLevel: "info",
    legalComments: "none",
    resolveExtensions: [".ts", ".tsx", ".js", ".cjs", ".mjs", ".json"],
  };
}

function copyStaticAssets() {
  for (const dir of ["vendor", "shell-init"]) {
    const from = join(root, "electron", dir);
    if (!existsSync(from)) continue;
    cpSync(from, join(outRoot, "electron", dir), { recursive: true });
  }
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(join(outRoot, "electron"), { recursive: true });
copyStaticAssets();

if (watch) {
  const contexts = await Promise.all(targets.map((t) => context(optionsFor(t))));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("[build-electron] watching for changes…");
} else {
  await Promise.all(targets.map((t) => build(optionsFor(t))));
}
