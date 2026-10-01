import { useCallback, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import type { GitStatus } from "@shared/git/types";
import { deepEqual } from "../app/lib/deepEqual";

const POLL_MS = 10_000;
const FETCH_MS = 60_000;

/**
 * One refcounted poller per cwd, shared by every `useGitStatus(cwd)` caller
 * (ChatArea and GitStatusPill both mount it for the same cwd). Results that
 * are deep-equal to the current status keep the previous object, so
 * subscribers don't re-render on every poll.
 */
interface GitPoller {
  readonly cwd: string;
  status: GitStatus | null;
  refCount: number;
  disposed: boolean;
  /** Sequence of the newest request whose result was applied. */
  appliedSeq: number;
  nextSeq: number;
  readonly listeners: Set<() => void>;
  stop: () => void;
}

const pollers = new Map<string, GitPoller>();

function notify(poller: GitPoller): void {
  for (const listener of poller.listeners) listener();
}

async function refreshPoller(poller: GitPoller): Promise<void> {
  if (poller.disposed || !window.api?.gitStatus) return;
  poller.nextSeq += 1;
  const seq = poller.nextSeq;
  const next = await window.api.gitStatus(poller.cwd);
  if (poller.disposed || seq < poller.appliedSeq) return;
  poller.appliedSeq = seq;
  if (deepEqual(poller.status, next)) return;
  poller.status = next;
  notify(poller);
}

async function refetchPoller(poller: GitPoller): Promise<void> {
  if (poller.disposed || !window.api?.gitFetch) return;
  await window.api.gitFetch(poller.cwd);
  await refreshPoller(poller);
}

function logPollError(error: unknown): void {
  console.warn("[useGitStatus] poll failed:", error instanceof Error ? error.message : error);
}

function startPoller(cwd: string): GitPoller {
  const poller: GitPoller = {
    cwd,
    status: null,
    refCount: 0,
    disposed: false,
    appliedSeq: 0,
    nextSeq: 0,
    listeners: new Set(),
    stop: () => {},
  };
  const refresh = () => {
    refreshPoller(poller).catch(logPollError);
  };
  const refetch = () => {
    refetchPoller(poller).catch(logPollError);
  };
  refresh();
  refetch();
  const pollTimer = window.setInterval(() => {
    if (!document.hidden) refresh();
  }, POLL_MS);
  const fetchTimer = window.setInterval(() => {
    if (!document.hidden) refetch();
  }, FETCH_MS);
  window.addEventListener("focus", refresh);
  poller.stop = () => {
    window.clearInterval(pollTimer);
    window.clearInterval(fetchTimer);
    window.removeEventListener("focus", refresh);
  };
  return poller;
}

function acquirePoller(cwd: string): GitPoller {
  let poller = pollers.get(cwd);
  if (!poller) {
    poller = startPoller(cwd);
    pollers.set(cwd, poller);
  }
  poller.refCount += 1;
  return poller;
}

function releasePoller(poller: GitPoller): void {
  poller.refCount -= 1;
  if (poller.refCount > 0) return;
  poller.disposed = true;
  poller.stop();
  if (pollers.get(poller.cwd) === poller) pollers.delete(poller.cwd);
}

function subscribeGitStatus(cwd: string, listener: () => void): () => void {
  const poller = acquirePoller(cwd);
  poller.listeners.add(listener);
  return () => {
    poller.listeners.delete(listener);
    releasePoller(poller);
  };
}

const noopUnsubscribe = (): void => {};

export interface GitStatusHandle {
  /** null = not loaded yet / not a git repo. */
  status: GitStatus | null;
  /** true during push/pull/commit (per caller). */
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  refresh: () => Promise<void>;
  refetch: () => Promise<void>;
}

export default function useGitStatus(cwd: string | null | undefined): GitStatusHandle {
  const [busy, setBusy] = useState(false);

  const subscribe = useCallback(
    (listener: () => void) => (cwd ? subscribeGitStatus(cwd, listener) : noopUnsubscribe),
    [cwd],
  );
  const getSnapshot = useCallback(() => (cwd ? pollers.get(cwd)?.status ?? null : null), [cwd]);
  const status = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refresh = useCallback(async () => {
    const poller = cwd ? pollers.get(cwd) : undefined;
    if (poller) await refreshPoller(poller);
  }, [cwd]);

  const refetch = useCallback(async () => {
    const poller = cwd ? pollers.get(cwd) : undefined;
    if (poller) await refetchPoller(poller);
  }, [cwd]);

  return { status, busy, setBusy, refresh, refetch };
}
