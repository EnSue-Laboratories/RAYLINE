#!/usr/bin/env node
// Bundles the Electron main process, preloads and standalone helper scripts
// into dist-electron/, mirroring the source layout so __dirname-relative
// lookups (preloads, vendor/, shell-init/, ../scripts/*) keep working.
//
//   node scripts/build-electron.ts           one-shot production build
//   node scripts/build-electron.ts --watch   rebuild on change (dev)
//
// Runs directly on Node's type stripping: erasable TypeScript only.

import { build, context, type BuildOptions, type Plugin } from "esbuild";
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
  /** Candidate entry files; the first existing one wins (lets entries move in place). */
  entry: string[];
  out: string;
  external: string[];
}

function pickEntry(candidates: readonly string[]): string {
  for (const candidate of candidates) {
    if (existsSync(join(root, candidate))) return join(root, candidate);
  }
  throw new Error(`No entry found among: ${candidates.join(", ")}`);
}

const targets: Target[] = [
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
    // Spawned by a plain Node runtime from app.asar.unpacked, so it must be
    // fully self-contained (no node_modules lookups, no electron).
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

// ── Legacy CommonJS sources ─────────────────────────────────────────────────
// package.json has "type": "module", so esbuild treats every .ts file as ESM.
// Unconverted `// @ts-nocheck` files still end in `module.exports = {…}`; as
// ESM that assigns to the *bundle's* `module` and the file's own exports stay
// empty (e.g. `createLogger is not a function` at startup). Loading them from
// a plugin namespace skips the package.json "type" lookup, so esbuild detects
// CommonJS from `module.exports` as it did for the old .cjs files. Becomes a
// no-op once every file is converted to ESM exports.
const LEGACY_CJS_NAMESPACE = "legacy-cjs";
const legacyCjsCache = new Map<string, boolean>();

function isLegacyCjs(file: string): boolean {
  let cached = legacyCjsCache.get(file);
  if (cached === undefined) {
    let source = "";
    try {
      source = readFileSync(file, "utf8");
    } catch {
      /* unresolvable: let esbuild report it */
    }
    cached = /^(#!.*\n)?\/\/ @ts-nocheck/.test(source) && /\bmodule\.exports\s*=/.test(source);
    legacyCjsCache.set(file, cached);
  }
  return cached;
}

const legacyCjsPlugin: Plugin = {
  name: "legacy-cjs",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^\.\.?\// }, async (args) => {
      if (args.pluginData === LEGACY_CJS_NAMESPACE) return undefined;
      const resolved = await pluginBuild.resolve(args.path, {
        kind: args.kind,
        importer: args.importer,
        resolveDir: args.resolveDir,
        pluginData: LEGACY_CJS_NAMESPACE,
      });
      if (resolved.errors.length > 0 || !resolved.path.endsWith(".ts") || !isLegacyCjs(resolved.path)) return undefined;
      return { path: resolved.path, namespace: LEGACY_CJS_NAMESPACE };
    });
    pluginBuild.onLoad({ filter: /.*/, namespace: LEGACY_CJS_NAMESPACE }, (args) => {
      legacyCjsCache.delete(args.path); // re-check after edits in watch mode
      return {
        contents: readFileSync(args.path, "utf8"),
        loader: "ts",
        resolveDir: dirname(args.path),
        watchFiles: [args.path],
      };
    });
  },
};

function optionsFor(target: Target): BuildOptions {
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
    plugins: [legacyCjsPlugin],
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
