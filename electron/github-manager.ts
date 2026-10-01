/**
 * Public entry for GitHub operations via the `gh` CLI (Project Manager
 * window, `gh-*` IPC channels). Implementation: electron/services/github/.
 */

export { checkAuth, listAuthAccounts, logout, switchAccount } from "./services/github/auth";
export { cancelWebAuth, startWebAuth, type WebAuthSession } from "./services/github/web-auth";
export {
  addComment,
  assignIssue,
  checkoutPR,
  closeIssue,
  createIssue,
  createPR,
  getCurrentBranch,
  getIssue,
  getLinkedPRs,
  getPR,
  getRepoDefaultBranch,
  listBranches,
  listCollaborators,
  listComments,
  listIssues,
  listPRs,
  listUserRepos,
  mergePR,
  reopenIssue,
  unassignIssue,
  uploadImage,
} from "./services/github/repos";
