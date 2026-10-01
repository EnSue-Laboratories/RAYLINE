import type { TerminalSessionInfo } from "@shared/terminal/types";

/** True when two session entries describe the same PTY in the same state. */
export function isSameSession(a: TerminalSessionInfo, b: TerminalSessionInfo): boolean {
  return a.name === b.name
    && a.command === b.command
    && a.cwd === b.cwd
    && a.pid === b.pid
    && a.exitCode === b.exitCode;
}

/** Order-sensitive structural comparison of two session lists. */
export function isSameSessionList(
  a: readonly TerminalSessionInfo[],
  b: readonly TerminalSessionInfo[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((session, index) => {
    const other = b[index];
    return other !== undefined && isSameSession(session, other);
  });
}

/**
 * Returns `prev` when `next` carries no change, so React state setters bail
 * out instead of re-rendering every consumer with an equal array.
 */
export function reconcileSessionList(
  prev: TerminalSessionInfo[],
  next: TerminalSessionInfo[],
): TerminalSessionInfo[] {
  return isSameSessionList(prev, next) ? prev : next;
}

export interface ActiveSessionResolution {
  active: string | null;
  /** The preferred name was applied and should be cleared. */
  consumedPreferred: boolean;
}

/**
 * Picks the session to show after a snapshot: a still-pending preferred
 * session (e.g. one just created) wins, then the previous selection if it
 * survived, then the first session.
 */
export function resolveActiveSession(
  prev: string | null,
  sessions: readonly TerminalSessionInfo[],
  preferred: string | null,
): ActiveSessionResolution {
  const names = new Set(sessions.map((session) => session.name));
  if (preferred && names.has(preferred)) return { active: preferred, consumedPreferred: true };
  if (prev && names.has(prev)) return { active: prev, consumedPreferred: false };
  return { active: sessions[0]?.name ?? null, consumedPreferred: false };
}
