import { useEffect, useState } from "react";
import type { GhComment, GhUser } from "@shared/github/types";
import { useStableCallback } from "../../hooks/useStableCallback";
import { errorMessage } from "../format";
import type { PmItemType } from "../types";
import { isSameCommentList, isSameItem, type DetailItem } from "./detailState";

const POLL_INTERVAL_MS = 30_000;

interface DetailData {
  /** Request this data answers (see `requestKey`). */
  key: string;
  item: DetailItem;
  comments: GhComment[];
  collaborators: GhUser[];
}

export interface ItemDetailState {
  loading: boolean;
  error: string | null;
  item: DetailItem | null;
  comments: GhComment[];
  collaborators: GhUser[];
  actionLoading: boolean;
  retry: () => void;
  toggleAssignee: (login: string) => Promise<void>;
  closeIssue: () => Promise<void>;
  reopen: () => Promise<void>;
  merge: () => Promise<void>;
  refreshComments: () => Promise<void>;
}

const EMPTY_COMMENTS: GhComment[] = [];
const EMPTY_USERS: GhUser[] = [];

function fetchItem(type: PmItemType, repo: string, number: number): Promise<DetailItem> {
  return type === "pr" ? window.ghApi.getPR(repo, number) : window.ghApi.getIssue(repo, number);
}

/**
 * Loads an issue / PR with its comments and collaborators, polls item +
 * comments every 30 s (skipping state updates when nothing changed), and
 * exposes the assign / close / reopen / merge actions.
 *
 * Loading and error are derived from which request the stored data answers,
 * so no state is set synchronously inside the effect.
 */
export function useItemDetail(repo: string, number: number, type: PmItemType): ItemDetailState {
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState<DetailData | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const requestKey = `${type}:${repo}#${number}:${reloadToken}`;

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchItem(type, repo, number), window.ghApi.listComments(repo, number), window.ghApi.listCollaborators(repo)])
      .then(([item, comments, collaborators]) => {
        if (!cancelled) setData({ key: requestKey, item, comments, collaborators });
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailure({ key: requestKey, message: errorMessage(err) || "Unknown error" });
      });

    const interval = window.setInterval(() => {
      void Promise.all([fetchItem(type, repo, number), window.ghApi.listComments(repo, number)])
        .then(([item, comments]) => {
          if (cancelled) return;
          setData((prev) => {
            if (!prev || prev.key !== requestKey) return prev;
            const sameItem = isSameItem(prev.item, item);
            const sameComments = isSameCommentList(prev.comments, comments);
            if (sameItem && sameComments) return prev;
            return { ...prev, item: sameItem ? prev.item : item, comments: sameComments ? prev.comments : comments };
          });
        })
        .catch(() => {});
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [repo, number, type, requestKey]);

  const current = data?.key === requestKey ? data : null;
  const error = failure?.key === requestKey ? failure.message : null;

  const updateItem = (item: DetailItem) => setData((prev) => (prev ? { ...prev, item } : prev));

  const runAction = useStableCallback(async (action: () => Promise<DetailItem>) => {
    setActionLoading(true);
    try {
      updateItem(await action());
    } catch { /* the item stays as it was; the user can retry */ }
    setActionLoading(false);
  });

  const toggleAssignee = useStableCallback(async (login: string) => {
    const item = current?.item;
    if (!item) return;
    const isAssigned = item.assignees.some((assignee) => assignee.login === login);
    if (isAssigned) {
      await window.ghApi.unassignIssue(repo, number, [login]);
    } else {
      await window.ghApi.assignIssue(repo, number, [login]);
    }
    updateItem(await fetchItem(type, repo, number));
  });

  const refreshComments = useStableCallback(async () => {
    try {
      const comments = await window.ghApi.listComments(repo, number);
      setData((prev) => (prev ? { ...prev, comments } : prev));
    } catch { /* keep the current comments */ }
  });

  return {
    loading: !current && !error,
    error,
    item: current?.item ?? null,
    comments: current?.comments ?? EMPTY_COMMENTS,
    collaborators: current?.collaborators ?? EMPTY_USERS,
    actionLoading,
    retry: () => setReloadToken((token) => token + 1),
    toggleAssignee,
    closeIssue: () => runAction(() => window.ghApi.closeIssue(repo, number)),
    reopen: () => runAction(() => window.ghApi.reopenIssue(repo, number)),
    merge: () => runAction(async () => {
      await window.ghApi.mergePR(repo, number);
      return window.ghApi.getPR(repo, number);
    }),
    refreshComments,
  };
}
