import type { GhIssue, GhPullRequest, GhStateFilter } from "@shared/github/types";

export type PmItemType = "issue" | "pr";
export type PmTab = "issues" | "prs";
/** The list views only toggle between open and closed. */
export type PmStateFilter = Exclude<GhStateFilter, "all">;
export type AuthModalMode = "signin" | "add" | "switch";

export interface SelectedItem {
  repo: string;
  number: number;
  type: PmItemType;
}

/** List rows carry the repo they were fetched from. */
export interface RepoTagged {
  _repo: string;
  /** Inserted locally right after creation, before the server lists it. */
  __optimistic?: boolean;
}

export type IssueListItem = GhIssue & RepoTagged;
export type PrListItem = GhPullRequest & RepoTagged;

/** Fields every list row needs. */
export interface ListItemCore extends RepoTagged {
  number: number;
  title: string;
  state: string;
  updated_at: string;
  user: { login: string } | null;
}

/**
 * Item just created from CreateForm. A PR is built from `gh pr create`'s URL,
 * so its number can be unknown (null) and most REST fields are missing.
 */
export type FreshItem<T extends ListItemCore> = Omit<T, "number"> & { number: number | null };

export type FreshIssue = FreshItem<IssueListItem>;

export type PrRowItem = ListItemCore & Pick<GhPullRequest, "merged_at"> & { draft?: boolean };
export type FreshPr = FreshItem<PrRowItem>;
