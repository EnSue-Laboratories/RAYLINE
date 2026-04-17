import { useState, useEffect, useRef, useCallback } from "react";

const POLL_MS = 10_000;
const FETCH_MS = 60_000;
const FETCH_INITIAL_DELAY = 3_000;

export default function useGitStatus(cwd) {
  const [status, setStatus] = useState(null); // null = not loaded / not a repo
  const [busy, setBusy] = useState(false);    // true during push/pull/commit
  const pollTimer = useRef(null);
  const fetchTimer = useRef(null);
  const runId = useRef(0);

  const refresh = useCallback(async () => {
    if (!cwd || !window.api?.gitStatus) return;
    const token = runId.current;
    const s = await window.api.gitStatus(cwd);
    if (token !== runId.current) return;
    setStatus(s);
  }, [cwd]);

  const refetch = useCallback(async () => {
    if (!cwd || !window.api?.gitFetch) return;
    const token = runId.current;
    await window.api.gitFetch(cwd);
    if (token !== runId.current) return;
    await refresh();
  }, [cwd, refresh]);

  useEffect(() => {
    runId.current += 1;
    setStatus(null); // eslint-disable-line react-hooks/set-state-in-effect
    if (!cwd) return () => {};

    refresh();
    pollTimer.current = setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_MS);

    const fetchKickoff = setTimeout(() => {
      if (!document.hidden) refetch();
      fetchTimer.current = setInterval(() => {
        if (!document.hidden) refetch();
      }, FETCH_MS);
    }, FETCH_INITIAL_DELAY);

    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      runId.current += 1;
      clearInterval(pollTimer.current);
      clearInterval(fetchTimer.current);
      clearTimeout(fetchKickoff);
      window.removeEventListener("focus", onFocus);
    };
  }, [cwd, refresh, refetch]);

  return { status, busy, setBusy, refresh, refetch };
}
