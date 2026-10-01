import { useCallback, useEffect, useRef, useState } from "react";
import type { GitStatus } from "@shared/git/types";
import { errorMessage } from "./branchModel";
import {
  deriveGitPillState,
  EMPTY_PR_INFO,
  UNAVAILABLE_PR_INFO,
  type GitPillState,
  type PrInfo,
} from "./gitStatusModel";
import type { Translator } from "../sidebar/types";

const PR_SUCCESS_FLASH_MS = 1800;

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  destructive: boolean;
  onConfirm: () => Promise<void>;
}

export interface GitPillOptions {
  cwd: string | null | undefined;
  status: GitStatus | null;
  refresh: () => Promise<void>;
  refetch: () => Promise<void>;
  defaultPrBranch: string | null | undefined;
  coauthorEnabled: boolean;
  coauthorTrailer: string;
  t: Translator;
}

export interface GitPillController {
  /** null while git status is unknown (not a repo / loading). */
  state: GitPillState | null;
  message: string;
  setMessage: (message: string) => void;
  busy: boolean;
  generating: boolean;
  isCreatingPr: boolean;
  error: string | null;
  clearError: () => void;
  prSuccess: string;
  confirm: ConfirmRequest | null;
  cancelConfirm: () => void;
  runConfirm: () => Promise<void>;
  /** Refreshes status, fetch and PR info (when the popover opens). */
  refreshAll: () => void;
  /** Resets transient UI when the popover closes. */
  resetTransient: () => void;
  commitAndPush: () => Promise<void>;
  stage: (path: string) => Promise<void>;
  unstage: (path: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  requestRevert: (path: string, untracked: boolean) => void;
  ignore: (path: string) => Promise<void>;
  createPr: () => Promise<void>;
  mergePr: () => Promise<void>;
  generateMessage: () => Promise<void>;
  publish: () => Promise<void>;
  pull: () => Promise<void>;
}

/** State and git actions behind GitStatusPill's popover. Per-cwd state resets when cwd changes. */
export function useGitPillController({
  cwd,
  status,
  refresh,
  refetch,
  defaultPrBranch,
  coauthorEnabled,
  coauthorTrailer,
  t,
}: GitPillOptions): GitPillController {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isCreatingPr, setIsCreatingPr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prSuccess, setPrSuccess] = useState("");
  const [prInfo, setPrInfo] = useState<PrInfo>(EMPTY_PR_INFO);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [stateCwd, setStateCwd] = useState(cwd);
  const cwdRef = useRef(cwd);
  const prSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset per-repo state during render when cwd changes (no effect round-trip).
  if (stateCwd !== cwd) {
    setStateCwd(cwd);
    setMessage("");
    setError(null);
    setPrSuccess("");
    setGenerating(false);
    setIsCreatingPr(false);
    setPrInfo(EMPTY_PR_INFO);
  }

  useEffect(() => {
    cwdRef.current = cwd;
    return () => {
      // A pending "PR created" flash belongs to the previous cwd.
      if (prSuccessTimerRef.current) clearTimeout(prSuccessTimerRef.current);
      prSuccessTimerRef.current = null;
    };
  }, [cwd]);

  const clearPrSuccess = useCallback(() => {
    if (prSuccessTimerRef.current) clearTimeout(prSuccessTimerRef.current);
    prSuccessTimerRef.current = null;
    setPrSuccess("");
  }, []);

  const flashPrSuccess = useCallback((label: string) => {
    if (prSuccessTimerRef.current) clearTimeout(prSuccessTimerRef.current);
    setPrSuccess(label);
    prSuccessTimerRef.current = setTimeout(() => {
      prSuccessTimerRef.current = null;
      setPrSuccess("");
    }, PR_SUCCESS_FLASH_MS);
  }, []);

  const refreshPrInfo = useCallback(async () => {
    const api = window.api;
    if (!cwd || !api?.gitPrStatus) {
      setPrInfo(UNAVAILABLE_PR_INFO);
      return;
    }
    const requestCwd = cwd;
    setPrInfo((prev) => ({ ...prev, loading: true }));
    try {
      const r = await api.gitPrStatus(requestCwd);
      if (cwdRef.current !== requestCwd) return;
      setPrInfo(r.ok ? { loading: false, checked: true, unavailable: false, openPr: r.openPr } : UNAVAILABLE_PR_INFO);
    } catch {
      if (cwdRef.current === requestCwd) setPrInfo(UNAVAILABLE_PR_INFO);
    }
  }, [cwd]);

  const refreshAll = useCallback(() => {
    void refresh();
    void refetch();
    void refreshPrInfo();
  }, [refetch, refresh, refreshPrInfo]);

  const resetTransient = useCallback(() => {
    setError(null);
    clearPrSuccess();
  }, [clearPrSuccess]);

  const state = status ? deriveGitPillState(status, { message, busy, defaultPrBranch, prInfo }) : null;

  /** Runs a busy git action: clears errors / PR flash, sets busy until done. */
  const runBusy = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    clearPrSuccess();
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const api = () => window.api;

  return {
    state,
    message,
    setMessage,
    busy,
    generating,
    isCreatingPr,
    error,
    clearError: () => setError(null),
    prSuccess,
    confirm,
    cancelConfirm: () => setConfirm(null),
    runConfirm: async () => {
      const request = confirm;
      setConfirm(null);
      if (request) await request.onConfirm();
    },
    refreshAll,
    resetTransient,

    commitAndPush: async () => {
      if (!cwd || !state?.canCommit) return;
      const canPush = state.canPush;
      await runBusy(async () => {
        const trailer = coauthorEnabled ? (coauthorTrailer || "").trim() : "";
        const c = await api().gitCommit(cwd, message.trim(), trailer);
        if (!c.ok) {
          setError(c.stderr || t("git.status.commitFailed"));
          return;
        }
        setMessage("");
        if (canPush) {
          const p = await api().gitPush(cwd);
          if (!p.ok) {
            setError(p.stderr || t("git.status.pushFailed"));
            await refresh();
            return;
          }
        }
        await refresh();
      });
    },

    stage: async (path) => {
      if (!cwd || !api()?.gitStage) return;
      await api().gitStage(cwd, [path]);
      await refresh();
    },
    unstage: async (path) => {
      if (!cwd || !api()?.gitUnstage) return;
      await api().gitUnstage(cwd, [path]);
      await refresh();
    },
    stageAll: async () => {
      const paths = state?.unstaged.map((f) => f.path) ?? [];
      if (!cwd || !api()?.gitStage || !paths.length) return;
      await api().gitStage(cwd, paths);
      await refresh();
    },
    unstageAll: async () => {
      const paths = state?.staged.map((f) => f.path) ?? [];
      if (!cwd || !api()?.gitUnstage || !paths.length) return;
      await api().gitUnstage(cwd, paths);
      await refresh();
    },

    requestRevert: (path, untracked) => {
      if (!cwd || !api()?.gitRevert) return;
      setConfirm({
        title: untracked ? t("git.status.deleteUntrackedTitle") : t("git.status.discardChangesTitle"),
        body: untracked ? t("git.status.deleteUntrackedBody", { path }) : t("git.status.discardChangesBody", { path }),
        confirmLabel: untracked ? t("git.status.delete") : t("git.status.discard"),
        destructive: true,
        onConfirm: async () => {
          const r = await api().gitRevert(cwd, path, untracked);
          if (!r.ok) setError(r.stderr || t("git.status.revertFailed"));
          await refresh();
        },
      });
    },

    ignore: async (path) => {
      if (!cwd || !api()?.gitIgnore) return;
      const r = await api().gitIgnore(cwd, path);
      if (!r.ok) setError(r.stderr || t("git.status.gitignoreFailed"));
      await refresh();
    },

    createPr: async () => {
      if (!cwd || !state?.canPr || isCreatingPr || !api()?.gitCreatePr) return;
      const base = state.prBase;
      setIsCreatingPr(true);
      try {
        await runBusy(async () => {
          try {
            const r = await api().gitCreatePr(cwd, base);
            if (!r.ok) {
              setError(r.stderr || t("git.status.createPrFailed"));
              return;
            }
            await refresh();
            await refreshPrInfo();
            flashPrSuccess(t("git.status.prCreated"));
          } catch (err) {
            setError(errorMessage(err, t("git.status.createPrFailed")));
          }
        });
      } finally {
        setIsCreatingPr(false);
      }
    },

    mergePr: async () => {
      if (!cwd || !state?.openPr || !api()?.gitMergePr) return;
      await runBusy(async () => {
        const r = await api().gitMergePr(cwd);
        if (!r.ok) {
          setError(r.stderr || t("git.status.mergePrFailed"));
          return;
        }
        await refreshPrInfo();
        await refetch();
        await refresh();
        flashPrSuccess(t("git.status.prMerged"));
      });
    },

    generateMessage: async () => {
      if (!cwd || generating || !api()?.gitGenCommitMessage) return;
      const requestCwd = cwd;
      setGenerating(true);
      setError(null);
      try {
        const r = await api().gitGenCommitMessage(requestCwd);
        if (cwdRef.current !== requestCwd) return;
        if (!r.ok) {
          setError(r.stderr || t("git.status.genCommitMessageFailed"));
          return;
        }
        setMessage(r.message || "");
      } finally {
        if (cwdRef.current === requestCwd) setGenerating(false);
      }
    },

    publish: async () => {
      if (!cwd || !state?.canPublish) return;
      await runBusy(async () => {
        const p = await api().gitPush(cwd);
        if (!p.ok) {
          setError(p.stderr || t("git.status.publishFailed"));
          return;
        }
        await refresh();
        await refreshPrInfo();
      });
    },

    pull: async () => {
      if (!cwd || !state?.canPull) return;
      await runBusy(async () => {
        const p = await api().gitPull(cwd);
        if (!p.ok) setError(p.stderr || t("git.status.pullFailed"));
        await refresh();
      });
    },
  };
}
