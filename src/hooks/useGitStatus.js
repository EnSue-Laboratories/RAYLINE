import { useState, useEffect, useRef, useCallback } from "react";

const POLL_MS = 10_000;
const FETCH_MS = 60_000;
const FETCH_INITIAL_DELAY = 3_000;

export default function useGitStatus(cwd) {
  const [status, setStatus] = useState(null); // null = not loaded / not a repo
  const [busy, setBusy] = useState(false);    // true during push/pull/commit
  const pollTimer = useRef(null);
  const fetchTimer = useRef(null);
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    if (!cwd || !window.api?.gitStatus) return;
    const s = await window.api.gitStatus(cwd);
    if (!cancelled.current) setStatus(s);
  }, [cwd]);

  const refetch = useCallback(async () => {
    if (!cwd || !window.api?.gitFetch) return;
    await window.api.gitFetch(cwd);
    await refresh();
  }, [cwd, refresh]);

  useEffect(() => {
    cancelled.current = false;
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
      cancelled.current = true;
      clearInterval(pollTimer.current);
      clearInterval(fetchTimer.current);
      clearTimeout(fetchKickoff);
      window.removeEventListener("focus", onFocus);
    };
  }, [cwd, refresh, refetch]);

  return { status, busy, setBusy, refresh, refetch };
}
