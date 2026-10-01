/** Project Manager window preload → `window.ghApi`. */

import { contextBridge } from "electron";
import type { GithubApi } from "@shared/ipc/renderer-api";
import { invoker, subscriber } from "./preload/ipc";

const ghApi = {
  checkAuth: invoker("gh-check-auth"),
  listAuthAccounts: invoker("gh-list-auth-accounts"),
  switchAccount: invoker("gh-switch-account"),
  listUserRepos: invoker("gh-list-user-repos"),
  listIssues: invoker("gh-list-issues"),
  listPRs: invoker("gh-list-prs"),
  getIssue: invoker("gh-get-issue"),
  getPR: invoker("gh-get-pr"),
  listComments: invoker("gh-list-comments"),
  addComment: invoker("gh-add-comment"),
  listCollaborators: invoker("gh-list-collaborators"),
  assignIssue: invoker("gh-assign-issue"),
  unassignIssue: invoker("gh-unassign-issue"),
  checkoutPR: invoker("gh-checkout-pr"),
  closeIssue: invoker("gh-close-issue"),
  mergePR: invoker("gh-merge-pr"),
  reopenIssue: invoker("gh-reopen-issue"),
  createIssue: invoker("gh-create-issue"),
  createPR: invoker("gh-create-pr"),
  listBranches: invoker("gh-list-branches"),
  getLinkedPRs: invoker("gh-linked-prs"),
  getCurrentBranch: invoker("gh-current-branch"),
  getRepoDefaultBranch: invoker("gh-repo-default-branch"),
  uploadImage: invoker("gh-upload-image"),
  loadPmState: invoker("gh-load-pm-state"),
  savePmState: invoker("gh-save-pm-state"),
  loadAppState: invoker("load-state"),
  readImage: invoker("read-image"),
  getSystemInfo: invoker("system-info"),
  setWindowBackgroundColor: invoker("set-window-background-color"),
  windowMinimize: invoker("window-minimize"),
  windowToggleMaximize: invoker("window-toggle-maximize"),
  windowClose: invoker("window-close"),
  authStart: invoker("gh-auth-start"),
  authCancel: invoker("gh-auth-cancel"),
  authLogout: invoker("gh-auth-logout"),
  onAuthEvent: subscriber("gh-auth-event"),
} satisfies GithubApi;

contextBridge.exposeInMainWorld("ghApi", ghApi);
