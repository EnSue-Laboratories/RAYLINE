import { useCallback, useEffect, useRef, useState } from "react";
import { getMainRepoRoot } from "./projectGrouping";
import type { ProjectsMeta } from "./types";

const COLLAPSE_PERSIST_DELAY_MS = 1200;

export type CollapseOverrides = Readonly<Record<string, boolean>>;

/**
 * Optimistic project collapse: the toggle applies locally at once and is
 * persisted to App (`onPersist(root, collapsed)`) after 1.2 s of quiet, so
 * rapid toggling doesn't rewrite app state on every click. Pending persists
 * are dropped on unmount.
 */
export function useProjectCollapse(
  projects: ProjectsMeta | null | undefined,
  onPersist: (cwdRoot: string, collapsed: boolean) => void,
): { overrides: CollapseOverrides; toggle: (cwdRoot: string) => void } {
  const [overrides, setOverrides] = useState<CollapseOverrides>({});
  const projectsRef = useRef(projects);
  const overridesRef = useRef(overrides);
  const pendingRef = useRef<Record<string, boolean>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPersistRef = useRef(onPersist);

  useEffect(() => {
    projectsRef.current = projects;
    onPersistRef.current = onPersist;
  }, [projects, onPersist]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const toggle = useCallback((cwdRoot: string) => {
    const root = getMainRepoRoot(cwdRoot);
    const current = overridesRef.current[root] ?? projectsRef.current?.[root]?.collapsed ?? false;
    const collapsed = !current;
    const next = { ...overridesRef.current, [root]: collapsed };
    overridesRef.current = next;
    setOverrides(next);

    pendingRef.current[root] = collapsed;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const pending = pendingRef.current;
      pendingRef.current = {};
      timerRef.current = null;
      for (const [projectRoot, nextCollapsed] of Object.entries(pending)) {
        onPersistRef.current(projectRoot, nextCollapsed);
      }
    }, COLLAPSE_PERSIST_DELAY_MS);
  }, []);

  return { overrides, toggle };
}
