/**
 * Lazy, failure-tolerant loader for the native `node-pty` module. A missing
 * or mis-built prebuild must not take down the main process — callers get
 * `null` and surface a friendly error instead.
 */

import { chmodSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type * as NodePty from "node-pty";

export type NodePtyModule = typeof NodePty;
export type { IPty } from "node-pty";

let loaded: NodePtyModule | null | undefined;

/**
 * node-pty's macOS prebuild ships `spawn-helper` without the exec bit in some
 * install paths; posix_spawn then fails with EACCES.
 */
function ensureSpawnHelperExecutable(localRequire: NodeJS.Require): void {
  if (process.platform !== "darwin") return;
  try {
    const nodePtyRoot = path.dirname(localRequire.resolve("node-pty/package.json"));
    const helper = path.join(nodePtyRoot, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper");
    if (!existsSync(helper)) return;
    const mode = statSync(helper).mode;
    if ((mode & 0o111) === 0) chmodSync(helper, mode | 0o755);
  } catch {
    // If this preflight cannot run, node-pty will surface the real spawn error.
  }
}

/** The node-pty module, or null when it can't be loaded. Cached. */
export function loadNodePty(scope = "terminal-manager"): NodePtyModule | null {
  if (loaded !== undefined) return loaded;
  try {
    // createRequire keeps node-pty a runtime (external) dependency of the
    // bundle and lets the load fail softly.
    const localRequire = createRequire(__filename);
    ensureSpawnHelperExecutable(localRequire);
    loaded = localRequire("node-pty") as NodePtyModule;
  } catch (err) {
    console.error(`[${scope}] node-pty failed to load:`, err instanceof Error ? err.message : err);
    loaded = null;
  }
  return loaded;
}
