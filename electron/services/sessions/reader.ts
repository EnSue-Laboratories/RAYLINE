/**
 * Session reader service: lists, loads and searches Claude / Codex CLI
 * sessions without blocking the main process. All file I/O is async and
 * streamed; full-file parses are capped at {@link FULL_PARSE_CONCURRENCY}.
 */

import { copyFileSync, existsSync, mkdirSync, type Stats } from "node:fs";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { LoadedSession, SessionSearchText, SessionSummary } from "@shared/chat/types";
import {
  CLAUDE_CWD_SCAN_LINES,
  CLAUDE_TITLE_SCAN_LINES,
  claudeEventCwd,
  claudeTitleFromEvent,
  createClaudeSessionParser,
} from "./claude";
import {
  CODEX_TITLE_SCAN_LINES,
  codexTitleFromEvent,
  createCodexSessionParser,
  parseCodexSessionMeta,
  type CodexSessionMeta,
} from "./codex";
import { createLimiter, mapWithConcurrency } from "./limiter";
import { forEachHeadLineSync, forEachLine } from "./lines";
import { cwdFromProjectDir, cwdFromProjectDirSync, projectDirName } from "./project-dir";
import { parseJsonLine } from "./raw";
import { SearchTextCache, messagesToSearchText } from "./search";
import { SessionIndex, type ClaudeSessionLocation, type SessionLocation, type SessionRoots } from "./session-index";

/** Max messages returned by `loadSessionMessages` (most recent). */
export const MAX_MESSAGES = 50;
export const FULL_PARSE_CONCURRENCY = 4;
const LIST_CONCURRENCY = 8;
const CODEX_LIST_MAX_AGE_MS = 2_000;
/** ~64 MB of UTF-16 search text. */
const SEARCH_CACHE_MAX_CHARS = 32 * 1024 * 1024;
const UNTITLED = "Untitled";

const NOT_FOUND: LoadedSession = { messages: [], cwd: null, provider: null };

interface CodexHead {
  meta: CodexSessionMeta;
  /** undefined until the title scan ran. */
  title?: string;
  /** False when the scan hit EOF before a title — the file may still grow. */
  titleFinal: boolean;
}

interface TitleCacheEntry {
  mtimeMs: number;
  size: number;
  title: string;
}

async function statOrNull(filePath: string): Promise<Stats | null> {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

export interface SessionReader {
  readonly listSessions: (cwd: string) => Promise<SessionSummary[]>;
  readonly loadSessionMessages: (sessionId: string) => Promise<LoadedSession>;
  readonly loadSessionSearchText: (sessionId: string) => Promise<SessionSearchText>;
  /** Sync (agent launch path). Prefer {@link SessionReader.moveSessionAsync}. */
  readonly moveSession: (sessionId: string, newCwd: string) => boolean;
  readonly moveSessionAsync: (sessionId: string, newCwd: string) => Promise<boolean>;
  /** Sync (agent launch path). Prefer {@link SessionReader.findSessionCwdAsync}. */
  readonly findSessionCwd: (sessionId: string) => string | null;
  readonly findSessionCwdAsync: (sessionId: string) => Promise<string | null>;
  /** Build the session index in the background. */
  readonly warm: () => void;
}

export function createSessionReader(roots: SessionRoots): SessionReader {
  const index = new SessionIndex(roots);
  const fullParse = createLimiter(FULL_PARSE_CONCURRENCY);
  const searchCache = new SearchTextCache(SEARCH_CACHE_MAX_CHARS);
  const searchInFlight = new Map<string, Promise<SessionSearchText>>();
  const claudeTitles = new Map<string, TitleCacheEntry>();
  const codexHeads = new Map<string, CodexHead>();

  // ── Loading ───────────────────────────────────────────────────────────────

  async function loadClaude(location: ClaudeSessionLocation, maxMessages: number): Promise<LoadedSession> {
    const parser = createClaudeSessionParser();
    const head: { cwd: string | null } = { cwd: null };
    await forEachLine(location.filePath, (line, i) => {
      const evt = parseJsonLine(line);
      if (evt === undefined) return;
      if (!head.cwd && i < CLAUDE_CWD_SCAN_LINES) head.cwd = claudeEventCwd(evt);
      parser.push(evt);
    });
    return {
      messages: parser.finish(maxMessages),
      cwd: head.cwd ?? (await cwdFromProjectDir(location.projectDir)),
      provider: "claude",
    };
  }

  async function loadCodex(filePath: string, maxMessages: number): Promise<LoadedSession> {
    const parser = createCodexSessionParser();
    await forEachLine(filePath, (line) => {
      const evt = parseJsonLine(line);
      if (evt !== undefined) parser.push(evt);
    });
    const { messages, cwd, usageSnapshot, rateLimitsSnapshot } = parser.finish(maxMessages);
    return { messages, cwd, provider: "codex", usageSnapshot, rateLimitsSnapshot };
  }

  function load(location: SessionLocation, maxMessages: number): Promise<LoadedSession> {
    return fullParse(() =>
      location.provider === "codex" ? loadCodex(location.filePath, maxMessages) : loadClaude(location, maxMessages),
    );
  }

  async function loadSessionMessages(sessionId: string): Promise<LoadedSession> {
    const location = await index.resolve(sessionId);
    return location ? load(location, MAX_MESSAGES) : NOT_FOUND;
  }

  async function loadSessionSearchText(sessionId: string): Promise<SessionSearchText> {
    const location = await index.resolve(sessionId);
    const stats = location ? await statOrNull(location.filePath) : null;
    if (!location || !stats) return { text: "", cwd: null, provider: null };

    const cached = searchCache.get(location.filePath, stats.mtimeMs, stats.size);
    if (cached) return cached;

    const key = `${location.filePath}\0${stats.mtimeMs}\0${stats.size}`;
    const pending = searchInFlight.get(key);
    if (pending) return pending;

    const task = load(location, Number.POSITIVE_INFINITY)
      .then((session): SessionSearchText => {
        const result = { text: messagesToSearchText(session.messages), cwd: session.cwd, provider: session.provider };
        searchCache.set(location.filePath, stats.mtimeMs, stats.size, result);
        return result;
      })
      .finally(() => searchInFlight.delete(key));
    searchInFlight.set(key, task);
    return task;
  }

  // ── Listing ───────────────────────────────────────────────────────────────

  async function claudeTitle(filePath: string, stats: Stats): Promise<string> {
    const cached = claudeTitles.get(filePath);
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) return cached.title;
    let title = UNTITLED;
    try {
      await forEachLine(filePath, (line, i) => {
        if (i >= CLAUDE_TITLE_SCAN_LINES) return false;
        const found = claudeTitleFromEvent(parseJsonLine(line));
        if (!found) return true;
        title = found;
        return false;
      });
    } catch {
      /* unreadable → Untitled */
    }
    claudeTitles.set(filePath, { mtimeMs: stats.mtimeMs, size: stats.size, title });
    return title;
  }

  async function listClaude(cwd: string): Promise<SessionSummary[]> {
    const projectDir = path.join(index.claudeProjectsDir, projectDirName(cwd));
    let files: string[];
    try {
      files = (await readdir(projectDir)).filter((f) => f.endsWith(".jsonl"));
    } catch {
      return [];
    }
    const rows = await mapWithConcurrency(files, LIST_CONCURRENCY, async (file) => {
      const filePath = path.join(projectDir, file);
      const stats = await statOrNull(filePath);
      if (!stats) return null;
      const row: SessionSummary = {
        id: file.replace(".jsonl", ""),
        title: await claudeTitle(filePath, stats),
        model: null,
        ts: stats.mtimeMs,
        cwd,
        provider: "claude",
      };
      return row;
    });
    return rows.filter((row): row is SessionSummary => row !== null);
  }

  /** Reads the rollout head once; re-reads only while a matching title is still pending. */
  async function codexHead(filePath: string, cwd: string): Promise<CodexHead | null> {
    const cached = codexHeads.get(filePath);
    if (cached && (cached.meta.cwd !== cwd || cached.titleFinal)) return cached;

    // Mutated from the line visitor (a holder keeps TS narrowing honest).
    const scan: { head: CodexHead | null; linesSeen: number } = { head: null, linesSeen: 0 };
    try {
      await forEachLine(filePath, (line, i) => {
        scan.linesSeen = i + 1;
        if (i >= CODEX_TITLE_SCAN_LINES) return false;
        if (i === 0) {
          const evt = parseJsonLine(line);
          if (evt === undefined) return false; // header not written yet
          scan.head = { meta: parseCodexSessionMeta(evt) ?? { id: null, cwd: null }, titleFinal: true };
          return scan.head.meta.cwd === cwd;
        }
        const title = codexTitleFromEvent(parseJsonLine(line));
        if (!title || !scan.head) return true;
        scan.head.title = title;
        return false;
      });
    } catch {
      return null;
    }
    const result = scan.head;
    if (!result) return null;
    if (result.meta.cwd === cwd && result.title === undefined) {
      result.title = UNTITLED;
      result.titleFinal = scan.linesSeen > CODEX_TITLE_SCAN_LINES;
    }
    codexHeads.set(filePath, result);
    return result;
  }

  async function listCodex(cwd: string): Promise<SessionSummary[]> {
    const files = await index.codexFiles(CODEX_LIST_MAX_AGE_MS);
    const rows = await mapWithConcurrency(files, LIST_CONCURRENCY * 2, async (filePath) => {
      const head = await codexHead(filePath, cwd);
      if (!head || head.meta.cwd !== cwd || !head.meta.id) return null;
      const stats = await statOrNull(filePath);
      if (!stats) return null;
      const row: SessionSummary = {
        id: head.meta.id,
        title: head.title ?? UNTITLED,
        model: null,
        ts: stats.mtimeMs,
        cwd,
        provider: "codex",
      };
      return row;
    });
    return rows.filter((row): row is SessionSummary => row !== null);
  }

  async function listSessions(cwd: string): Promise<SessionSummary[]> {
    const [claude, codex] = await Promise.all([listClaude(cwd), listCodex(cwd)]);
    return [...claude, ...codex].sort((a, b) => b.ts - a.ts);
  }

  // ── Move / cwd recovery ───────────────────────────────────────────────────

  function moveTarget(sessionId: string, newCwd: string): ClaudeSessionLocation {
    const projectDir = projectDirName(newCwd);
    return {
      provider: "claude",
      projectDir,
      filePath: path.join(index.claudeProjectsDir, projectDir, `${sessionId}.jsonl`),
    };
  }

  function moveSession(sessionId: string, newCwd: string): boolean {
    const found = index.resolveClaudeSync(sessionId);
    if (!found) return false;
    const target = moveTarget(sessionId, newCwd);
    if (!existsSync(target.filePath) && found.filePath !== target.filePath) {
      mkdirSync(path.dirname(target.filePath), { recursive: true });
      copyFileSync(found.filePath, target.filePath);
    }
    index.prefer(sessionId, target);
    return true;
  }

  async function moveSessionAsync(sessionId: string, newCwd: string): Promise<boolean> {
    const found = await index.resolve(sessionId);
    if (found?.provider !== "claude") return false;
    const target = moveTarget(sessionId, newCwd);
    if (!(await statOrNull(target.filePath)) && found.filePath !== target.filePath) {
      await mkdir(path.dirname(target.filePath), { recursive: true });
      await copyFile(found.filePath, target.filePath);
    }
    index.prefer(sessionId, target);
    return true;
  }

  function findSessionCwd(sessionId: string): string | null {
    const found = index.resolveClaudeSync(sessionId);
    if (!found) return null;
    const head: { cwd: string | null } = { cwd: null };
    try {
      forEachHeadLineSync(found.filePath, CLAUDE_CWD_SCAN_LINES, (line) => {
        head.cwd = claudeEventCwd(parseJsonLine(line));
        return head.cwd === null;
      });
    } catch {
      /* unreadable */
    }
    return head.cwd ?? cwdFromProjectDirSync(found.projectDir);
  }

  async function findSessionCwdAsync(sessionId: string): Promise<string | null> {
    const found = await index.resolve(sessionId);
    if (found?.provider !== "claude") return null;
    const head: { cwd: string | null } = { cwd: null };
    try {
      await forEachLine(found.filePath, (line, i) => {
        if (i >= CLAUDE_CWD_SCAN_LINES) return false;
        head.cwd = claudeEventCwd(parseJsonLine(line));
        return head.cwd === null;
      });
    } catch {
      /* unreadable */
    }
    return head.cwd ?? (await cwdFromProjectDir(found.projectDir));
  }

  return {
    listSessions,
    loadSessionMessages,
    loadSessionSearchText,
    moveSession,
    moveSessionAsync,
    findSessionCwd,
    findSessionCwdAsync,
    warm: () => index.warm(),
  };
}
