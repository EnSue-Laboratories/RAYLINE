/** GitHub (gh CLI) for the Project Manager and the main window. */

import { shell } from "electron";
import type { AppContext } from "../app/context";
import * as gh from "../github-manager";
import { gh as runGh, git } from "../services/git-ops";
import { resolveBranchDir } from "../services/repo-locator";
import { handle, sendTo } from "./typed";

export function registerGithubIpc(ctx: AppContext): void {
  // Fixed: runs gh with the GUI-safe PATH so packaged apps find it.
  handle("gh-get-repo-name", async (_event, cwd) => {
    try {
      return (await runGh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], cwd, { timeout: 5000 })) || null;
    } catch {
      return null;
    }
  });

  // Fixed: reads the branch of a local checkout of `repo` (or a given path)
  // instead of the main process's cwd; no argument keeps the old behavior.
  handle("gh-current-branch", async (_event, repo) => {
    const dir = await resolveBranchDir(repo, () => ctx.stateStore.getKnownProjectDirs());
    if (!dir) return null;
    try {
      return await git(["rev-parse", "--abbrev-ref", "HEAD"], dir);
    } catch {
      return null;
    }
  });

  handle("gh-check-auth", () => gh.checkAuth());
  handle("gh-list-auth-accounts", () => gh.listAuthAccounts());
  handle("gh-switch-account", (_event, user) => gh.switchAccount(user));
  handle("gh-list-user-repos", (_event, limit) => gh.listUserRepos(limit));
  handle("gh-list-issues", (_event, repo, state) => gh.listIssues(repo, state));
  handle("gh-list-prs", (_event, repo, state) => gh.listPRs(repo, state));
  handle("gh-get-issue", (_event, repo, number) => gh.getIssue(repo, number));
  handle("gh-get-pr", (_event, repo, number) => gh.getPR(repo, number));
  handle("gh-list-comments", (_event, repo, number) => gh.listComments(repo, number));
  handle("gh-add-comment", (_event, repo, number, body) => gh.addComment(repo, number, body));
  handle("gh-list-collaborators", (_event, repo) => gh.listCollaborators(repo));
  handle("gh-assign-issue", (_event, repo, number, assignees) => gh.assignIssue(repo, number, assignees));
  handle("gh-unassign-issue", (_event, repo, number, assignees) => gh.unassignIssue(repo, number, assignees));
  handle("gh-checkout-pr", (_event, repo, prNumber) => gh.checkoutPR(repo, prNumber));
  handle("gh-close-issue", (_event, repo, number) => gh.closeIssue(repo, number));
  handle("gh-merge-pr", (_event, repo, number) => gh.mergePR(repo, number));
  handle("gh-reopen-issue", (_event, repo, number) => gh.reopenIssue(repo, number));
  handle("gh-create-issue", (_event, repo, title, body) => gh.createIssue(repo, title, body));
  handle("gh-create-pr", (_event, repo, title, body, head, base) => gh.createPR(repo, title, body, head, base));
  handle("gh-list-branches", (_event, repo) => gh.listBranches(repo));
  handle("gh-linked-prs", (_event, repo, number) => gh.getLinkedPRs(repo, number));
  handle("gh-repo-default-branch", (_event, repo) => gh.getRepoDefaultBranch(repo));
  handle("gh-upload-image", (_event, repo, base64Data, filename) => gh.uploadImage(repo, base64Data, filename));

  // Auth flow — progress streams back to the requesting window.
  handle("gh-auth-logout", () => gh.logout());
  handle("gh-auth-start", (event) => {
    const sender = event.sender;
    gh.startWebAuth((payload) => {
      sendTo(sender, "gh-auth-event", payload);
      // Auto-open the verification page in the default browser.
      if (payload.type === "browser" && payload.url && !sender.isDestroyed()) void shell.openExternal(payload.url);
    });
    return { started: true as const };
  });
  handle("gh-auth-cancel", () => {
    gh.cancelWebAuth();
    return true as const;
  });
}
