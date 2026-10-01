/**
 * Atomic, per-file serialized writes with trailing-write coalescing.
 *
 *  - Every write goes to a unique temp file in the destination directory and
 *    is renamed into place, so the destination is always a complete file.
 *  - At most one async operation per path is in flight. Further requests
 *    replace the single pending slot (only the newest data is written); all
 *    of their callers resolve once that newest data lands.
 *  - Synchronous writes (close-time `sendSync` saves) supersede everything
 *    queued before them: older pending ops are dropped, and an in-flight op
 *    re-checks the per-path sync revision immediately before its (sync)
 *    rename, so an older async write can never overwrite a newer sync one.
 *    (Revision idea ported from vickioo's state-store in PR #230.)
 */

import fs from "node:fs";
import path from "node:path";
import { errorCode } from "./errors";

/** File contents, or a producer evaluated only when the write actually starts (skipped if superseded). */
export type WriteData = string | (() => string);

export type WriteOp = { kind: "write"; data: WriteData } | { kind: "remove" };

export interface AtomicWriterOptions {
  /** File mode for created files (default 0o600). */
  mode?: number;
  /** Retries for transient rename failures (Windows AV / indexer locks). */
  renameRetries?: number;
  renameRetryDelayMs?: number;
}

interface Waiter {
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface FileQueue {
  inFlight: Promise<void> | null;
  pending: WriteOp | null;
  pendingWaiters: Waiter[];
  /** Newest requested op (in flight or pending) — for read-after-write. */
  latest: WriteOp | null;
  /** Bumped by every synchronous op on this path. */
  syncRevision: number;
}

const TRANSIENT_RENAME_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);


function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let tempCounter = 0;
function tempPathFor(filePath: string): string {
  tempCounter += 1;
  return `${filePath}.${process.pid}.${Date.now().toString(36)}.${tempCounter}.tmp`;
}

export class AtomicFileWriter {
  private readonly queues = new Map<string, FileQueue>();
  private readonly knownDirs = new Set<string>();
  private readonly mode: number;
  private readonly renameRetries: number;
  private readonly renameRetryDelayMs: number;

  constructor(options: AtomicWriterOptions = {}) {
    this.mode = options.mode ?? 0o600;
    this.renameRetries = options.renameRetries ?? 3;
    this.renameRetryDelayMs = options.renameRetryDelayMs ?? 50;
  }

  /** Queues an atomic write; resolves when this data (or newer) is on disk. */
  write(filePath: string, data: WriteData): Promise<void> {
    return this.enqueue(filePath, { kind: "write", data });
  }

  /** Queues removal of the file (missing files are fine). */
  remove(filePath: string): Promise<void> {
    return this.enqueue(filePath, { kind: "remove" });
  }

  /** Synchronous atomic write that supersedes every earlier queued op for the path. */
  writeSync(filePath: string, data: string): void {
    this.supersedeForSync(filePath);
    this.ensureDirSync(path.dirname(filePath));
    const temp = tempPathFor(filePath);
    try {
      fs.writeFileSync(temp, data, { mode: this.mode });
      fs.renameSync(temp, filePath);
    } finally {
      try {
        fs.unlinkSync(temp);
      } catch {
        // already renamed
      }
    }
  }

  removeSync(filePath: string): void {
    this.supersedeForSync(filePath);
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
  }

  /** Newest queued / in-flight op for the path, if any (read-after-write consistency). */
  peek(filePath: string): WriteOp | null {
    return this.queues.get(filePath)?.latest ?? null;
  }

  /** Resolves when every queued op has settled. */
  async flush(): Promise<void> {
    for (;;) {
      const active = [...this.queues.values()].map((q) => q.inFlight).filter((p): p is Promise<void> => p !== null);
      if (active.length === 0) return;
      await Promise.allSettled(active);
    }
  }

  private queueFor(filePath: string): FileQueue {
    let queue = this.queues.get(filePath);
    if (!queue) {
      queue = { inFlight: null, pending: null, pendingWaiters: [], latest: null, syncRevision: 0 };
      this.queues.set(filePath, queue);
    }
    return queue;
  }

  private enqueue(filePath: string, op: WriteOp): Promise<void> {
    const queue = this.queueFor(filePath);
    queue.latest = op;
    if (!queue.inFlight) return this.start(filePath, queue, op);
    queue.pending = op;
    return new Promise<void>((resolve, reject) => {
      queue.pendingWaiters.push({ resolve, reject });
    });
  }

  private start(filePath: string, queue: FileQueue, op: WriteOp): Promise<void> {
    const revision = queue.syncRevision;
    const run = this.perform(filePath, op, () => queue.syncRevision === revision);
    const tracked = run.finally(() => {
      queue.inFlight = null;
      const next = queue.pending;
      const waiters = queue.pendingWaiters;
      queue.pending = null;
      queue.pendingWaiters = [];
      if (next) {
        this.start(filePath, queue, next).then(
          () => waiters.forEach((w) => w.resolve()),
          (error: unknown) => waiters.forEach((w) => w.reject(error)),
        );
      } else {
        queue.latest = null;
        this.queues.delete(filePath);
      }
    });
    queue.inFlight = tracked.catch(() => undefined);
    return tracked;
  }

  private supersedeForSync(filePath: string): void {
    const queue = this.queues.get(filePath);
    if (!queue) return;
    queue.syncRevision += 1;
    // Older pending data must not land after this sync write; its callers
    // are satisfied because newer data is now on disk.
    const waiters = queue.pendingWaiters;
    queue.pending = null;
    queue.pendingWaiters = [];
    queue.latest = null;
    waiters.forEach((w) => w.resolve());
  }

  private async perform(filePath: string, op: WriteOp, stillCurrent: () => boolean): Promise<void> {
    if (op.kind === "remove") {
      if (!stillCurrent()) return;
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
      return;
    }

    await this.ensureDir(path.dirname(filePath));
    const temp = tempPathFor(filePath);
    try {
      const data = typeof op.data === "function" ? op.data() : op.data;
      await fs.promises.writeFile(temp, data, { mode: this.mode });
      await this.renameIfCurrent(temp, filePath, stillCurrent);
    } finally {
      await fs.promises.unlink(temp).catch(() => undefined);
    }
  }

  /** The revision check and the rename run in the same tick (renameSync), so no sync write can slip in between. */
  private async renameIfCurrent(temp: string, filePath: string, stillCurrent: () => boolean): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      if (!stillCurrent()) return;
      try {
        fs.renameSync(temp, filePath);
        return;
      } catch (error) {
        const code = errorCode(error);
        if (attempt >= this.renameRetries || !code || !TRANSIENT_RENAME_CODES.has(code)) throw error;
      }
      await delay(this.renameRetryDelayMs);
    }
  }

  private async ensureDir(dir: string): Promise<void> {
    if (this.knownDirs.has(dir)) return;
    await fs.promises.mkdir(dir, { recursive: true });
    this.knownDirs.add(dir);
  }

  private ensureDirSync(dir: string): void {
    if (this.knownDirs.has(dir)) return;
    fs.mkdirSync(dir, { recursive: true });
    this.knownDirs.add(dir);
  }
}
