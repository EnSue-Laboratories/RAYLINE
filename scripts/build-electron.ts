#!/usr/bin/env node
// Bundles the Electron main process, preloads and standalone helper scripts
// into dist-electron/, mirroring the source layout so __dirname-relative
// lookups (preloads, vendor/, shell-init/, ../scripts/*) keep working.
//
//   node scripts/build-electron.ts           one-shot production build
//   node scripts/build-electron.ts --watch   rebuild on change (dev)
//
// Runs directly on Node's type stripping: erasable TypeScript only.

import { build, context, type BuildOptions } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = join(root, "dist-electron");
const watch = process.argv.includes("--watch");

function readRuntimeDeps(): string[] {
  const pkg: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const deps = typeof pkg === "object" && pkg !== null ? (pkg as { dependencies?: unknown }).dependencies : undefined;
  return typeof deps === "object" && deps !== null ? Object.keys(deps) : [];
}

// ws probes these optional native addons inside try/catch; leave them unresolved.
const WS_OPTIONAL_NATIVE = ["bufferutil", "utf-8-validate"];
const runtimeDeps = readRuntimeDeps();

interface Target {
  entry: string;
  out: string;
  external: string[];
}

const targets: Target[] = [
  {
    // Main process: node_modules stay external (electron-builder ships them,
    // and node-pty is native).
    entry: "electron/main.ts",
    out: "electron/main.cjs",
    external: ["electron", ...runtimeDeps],
  },
  {
    // Sandboxed preloads may only require "electron", so bundle everything else.
    entry: "electron/preload.ts",
    out: "electron/preload.cjs",
    external: ["electron"],
  },
  {
    entry: "electron/preload-pm.ts",
    out: "electron/preload-pm.cjs",
    external: ["electron"],
  },
  {
    // Spawned by a plain Node runtime from app.asar.unpacked, so it must be
    // fully self-contained (no node_modules lookups, no electron).
    entry: "electron/mcp-terminal-server.ts",
    out: "electron/mcp-terminal-server.cjs",
    external: WS_OPTIONAL_NATIVE,
  },
  {
    entry: "scripts/claudi-terminal.ts",
    out: "scripts/claudi-terminal.cjs",
    external: WS_OPTIONAL_NATIVE,
  },
];

function optionsFor(target: Target): BuildOptions {
  return {
    entryPoints: [join(root, target.entry)],
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

function copyStaticAssets(): void {
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
