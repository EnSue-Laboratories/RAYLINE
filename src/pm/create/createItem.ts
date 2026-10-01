import { parsePrNumber } from "../format";
import type { FreshIssue, FreshPr, PmItemType } from "../types";

export type CreatedItem =
  | { type: "issue"; item: FreshIssue }
  | { type: "pr"; item: FreshPr };

export interface CreateRequest {
  type: PmItemType;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
}

/**
 * Creates the issue / PR through window.ghApi and returns the optimistic row
 * for the list. A PR row is synthesized from the URL `gh pr create` prints.
 */
export async function createItem({ type, repo, title, body, head, base }: CreateRequest): Promise<CreatedItem> {
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  if (type === "issue") {
    const issue = await window.ghApi.createIssue(repo, trimmedTitle, trimmedBody);
    return { type, item: { ...issue, _repo: repo } };
  }
  const res = await window.ghApi.createPR(repo, trimmedTitle, trimmedBody, head, base);
  return {
    type,
    item: {
      number: parsePrNumber(res.url),
      title: trimmedTitle,
      state: "open",
      draft: false,
      merged_at: null,
      updated_at: new Date().toISOString(),
      user: { login: "" },
      _repo: repo,
    },
  };
}
