/**
 * In-memory sessionId → file index over `~/.claude/projects` and
 * `~/.codex/sessions`. Built lazily (or warmed in the background) with async
 * readdirs only — no per-lookup recursive walk, no per-lookup existsSync
 * probing. A lookup miss triggers a rescan that is guaranteed to start after
 * the miss, and concurrent misses share that one rescan.
 */

import { existsSync, readdirSync, type Dirent } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { codexThreadIdFromFileName } from "./codex";
import { mapWithConcurrency } from "./limiter";

export interface SessionRoots {
  /** `~/.claude` */
  claudeDir: string;
  /** `~/.codex` */
  codexDir: string;
}

export interface ClaudeSessionLocation {
  provider: "claude";
  filePath: string;
  /** Encoded project directory name (not a path). */
  projectDir: string;
}

export interface CodexSessionLocation {
  provider: "codex";
  filePath: string;
  projectDir: null;
}

export type SessionLocation = ClaudeSessionLocation | CodexSessionLocation;

interface Snapshot {
  /** `performance.now()` when the scan that produced this snapshot started. */
  startedAt: number;
  claude: Map<string, ClaudeSessionLocation>;
  codexById: Map<string, CodexSessionLocation>;
  codexFiles: string[];
}

const READDIR_CONCURRENCY = 16;
const JSONL = ".jsonl";

async function listDir(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function mtimeOf(filePath: string): Promise<number> {
  try {
    return (await stat(filePath)).mtimeMs;
  } catch {
    return -1;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkJsonl(dir: string, out: string[]): Promise<void> {
  const entries = await listDir(dir);
  const subdirs: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) subdirs.push(full);
    else if (entry.name.endsWith(JSONL)) out.push(full);
  }
  await mapWithConcurrency(subdirs, READDIR_CONCURRENCY, (sub) => walkJsonl(sub, out));
}

export class SessionIndex {
  private snapshot: Snapshot | null = null;
  private scanning: Promise<Snapshot> | null = null;
  private queued: Promise<Snapshot> | null = null;
  /** Session ids whose Claude file was moved by us — the move target wins. */
  private readonly preferred = new Map<string, ClaudeSessionLocation>();

  constructor(private readonly roots: SessionRoots) {}

  get claudeProjectsDir(): string {
    return path.join(this.roots.claudeDir, "projects");
  }

  get codexSessionsDir(): string {
    return path.join(this.roots.codexDir, "sessions");
  }

  /** Start building in the background (idempotent). */
  warm(): void {
    if (!this.snapshot && !this.scanning) void this.rescan().catch(() => undefined);
  }

  /** Current snapshot, building it on first use. */
  async ensure(): Promise<Snapshot> {
    return this.snapshot ?? this.scanning ?? this.rescan();
  }

  /**
   * Rescan. If a scan is already running it may have read directories before
   * the caller's file appeared, so queue exactly one follow-up scan that all
   * concurrent callers share.
   */
  rescan(): Promise<Snapshot> {
    if (!this.scanning) {
      this.scanning = this.scan().finally(() => {
        this.scanning = null;
      });
      return this.scanning;
    }
    if (!this.queued) {
      const running = this.scanning;
      this.queued = running
        .catch(() => undefined)
        .then(() => {
          this.queued = null;
          return this.rescan();
        });
    }
    return this.queued;
  }

  /** Codex rollout files from a snapshot at most `maxAgeMs` old. */
  async codexFiles(maxAgeMs: number): Promise<string[]> {
    const current = this.snapshot;
    const fresh = current && performance.now() - current.startedAt <= maxAgeMs ? current : await this.rescan();
    return fresh.codexFiles;
  }

  async resolve(sessionId: string): Promise<SessionLocation | null> {
    const requestedAt = performance.now();
    const snapshot = await this.ensure();
    const first = this.lookup(snapshot, sessionId);
    if (first && (await fileExists(first.filePath))) return first;
    // A snapshot whose scan began after this request already reflects disk.
    if (snapshot.startedAt >= requestedAt) return null;
    const second = this.lookup(await this.rescan(), sessionId);
    if (second && (await fileExists(second.filePath))) return second;
    return null;
  }

  /**
   * Synchronous Claude lookup for legacy sync callers (agent launch). Uses
   * the in-memory index when available and falls back to probing each
   * project directory (the legacy behavior) otherwise.
   */
  resolveClaudeSync(sessionId: string): ClaudeSessionLocation | null {
    const preferred = this.preferred.get(sessionId);
    if (preferred && existsSync(preferred.filePath)) return preferred;
    const indexed = this.snapshot?.claude.get(sessionId);
    if (indexed && existsSync(indexed.filePath)) return indexed;

    const projectsDir = this.claudeProjectsDir;
    let projects: string[];
    try {
      projects = readdirSync(projectsDir);
    } catch {
      return null;
    }
    for (const projectDir of projects) {
      const filePath = path.join(projectsDir, projectDir, `${sessionId}${JSONL}`);
      if (existsSync(filePath)) {
        const location: ClaudeSessionLocation = { provider: "claude", filePath, projectDir };
        this.snapshot?.claude.set(sessionId, location);
        return location;
      }
    }
    return null;
  }

  /** Record that `sessionId` now lives at `location` (after a move/copy). */
  prefer(sessionId: string, location: ClaudeSessionLocation): void {
    this.preferred.set(sessionId, location);
    this.snapshot?.claude.set(sessionId, location);
  }

  private lookup(snapshot: Snapshot, sessionId: string): SessionLocation | null {
    const claude = this.preferred.get(sessionId) ?? snapshot.claude.get(sessionId);
    if (claude) return claude;
    const codex = snapshot.codexById.get(sessionId.toLowerCase());
    if (codex) return codex;
    // Legacy semantics: any rollout file whose name contains the id.
    const byName = snapshot.codexFiles.find((file) => path.basename(file).includes(sessionId));
    return byName ? { provider: "codex", filePath: byName, projectDir: null } : null;
  }

  private async scan(): Promise<Snapshot> {
    const startedAt = performance.now();
    const [claude, codexFiles] = await Promise.all([this.scanClaude(), this.scanCodex()]);
    const codexById = new Map<string, CodexSessionLocation>();
    for (const filePath of codexFiles) {
      const id = codexThreadIdFromFileName(path.basename(filePath));
      if (id && !codexById.has(id)) codexById.set(id, { provider: "codex", filePath, projectDir: null });
    }
    for (const [id, location] of this.preferred) {
      if (existsSync(location.filePath)) claude.set(id, location);
      else this.preferred.delete(id);
    }
    const snapshot: Snapshot = { startedAt, claude, codexById, codexFiles };
    this.snapshot = snapshot;
    return snapshot;
  }

  private async scanClaude(): Promise<Map<string, ClaudeSessionLocation>> {
    const projectsDir = this.claudeProjectsDir;
    const projects = (await listDir(projectsDir)).filter((e) => e.isDirectory()).map((e) => e.name);
    const found = new Map<string, ClaudeSessionLocation[]>();
    await mapWithConcurrency(projects, READDIR_CONCURRENCY, async (projectDir) => {
      for (const entry of await listDir(path.join(projectsDir, projectDir))) {
        if (!entry.isFile() || !entry.name.endsWith(JSONL)) continue;
        const sessionId = entry.name.slice(0, -JSONL.length);
        const location: ClaudeSessionLocation = {
          provider: "claude",
          filePath: path.join(projectsDir, projectDir, entry.name),
          projectDir,
        };
        const list = found.get(sessionId);
        if (list) list.push(location);
        else found.set(sessionId, [location]);
      }
    });

    const index = new Map<string, ClaudeSessionLocation>();
    const duplicates: Array<[string, ClaudeSessionLocation[]]> = [];
    for (const [sessionId, locations] of found) {
      const [only] = locations;
      if (locations.length === 1 && only) index.set(sessionId, only);
      else duplicates.push([sessionId, locations]);
    }
    // The same session can exist in several project dirs after moveSession
    // copied it; the most recently written copy is the live one.
    await mapWithConcurrency(duplicates, READDIR_CONCURRENCY, async ([sessionId, locations]) => {
      const mtimes = await Promise.all(locations.map((l) => mtimeOf(l.filePath)));
      let best = 0;
      mtimes.forEach((mtime, i) => {
        if (mtime > (mtimes[best] ?? -1)) best = i;
      });
      const winner = locations[best];
      if (winner) index.set(sessionId, winner);
    });
    return index;
  }

  private async scanCodex(): Promise<string[]> {
    const files: string[] = [];
    await walkJsonl(this.codexSessionsDir, files);
    files.sort();
    return files;
  }
}
