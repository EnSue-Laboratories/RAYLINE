import { useEffect, useState } from "react";
import type { AppBuildInfo } from "@shared/updater/types";

export type AppBuild = Pick<AppBuildInfo, "version" | "commit" | "repository">;

/** Version (+ build source when main reports it); null until resolved / outside Electron. */
export function useAppBuild(): AppBuild | null {
  const [build, setBuild] = useState<AppBuild | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<AppBuild | null> => {
      if (window.api?.getAppBuild) {
        try {
          return await window.api.getAppBuild();
        } catch {
          // Older main processes only answer get-app-version.
        }
      }
      const version = await window.api?.getAppVersion?.();
      return version ? { version } : null;
    };
    load()
      .then((value) => {
        if (!cancelled && value?.version) setBuild(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return build;
}
