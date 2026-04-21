const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ghApi", {
  checkAuth: () => ipcRenderer.invoke("gh-check-auth"),
  listAuthAccounts: () => ipcRenderer.invoke("gh-list-auth-accounts"),
  switchAccount: (user) => ipcRenderer.invoke("gh-switch-account", user),
  listUserRepos: (limit) => ipcRenderer.invoke("gh-list-user-repos", limit),
  listIssues: (repo, state) => ipcRenderer.invoke("gh-list-issues", repo, state),
  listPRs: (repo, state) => ipcRenderer.invoke("gh-list-prs", repo, state),
  getIssue: (repo, number) => ipcRenderer.invoke("gh-get-issue", repo, number),
  getPR: (repo, number) => ipcRenderer.invoke("gh-get-pr", repo, number),
  listComments: (repo, number) => ipcRenderer.invoke("gh-list-comments", repo, number),
  addComment: (repo, number, body) => ipcRenderer.invoke("gh-add-comment", repo, number, body),
  listCollaborators: (repo) => ipcRenderer.invoke("gh-list-collaborators", repo),
  assignIssue: (repo, number, assignees) => ipcRenderer.invoke("gh-assign-issue", repo, number, assignees),
  unassignIssue: (repo, number, assignees) => ipcRenderer.invoke("gh-unassign-issue", repo, number, assignees),
  checkoutPR: (repo, prNumber) => ipcRenderer.invoke("gh-checkout-pr", repo, prNumber),
  closeIssue: (repo, number) => ipcRenderer.invoke("gh-close-issue", repo, number),
  mergePR: (repo, number) => ipcRenderer.invoke("gh-merge-pr", repo, number),
  reopenIssue: (repo, number) => ipcRenderer.invoke("gh-reopen-issue", repo, number),
  createIssue: (repo, title, body) => ipcRenderer.invoke("gh-create-issue", repo, title, body),
  createPR: (repo, title, body, head, base) => ipcRenderer.invoke("gh-create-pr", repo, title, body, head, base),
  listBranches: (repo) => ipcRenderer.invoke("gh-list-branches", repo),
  getLinkedPRs: (repo, number) => ipcRenderer.invoke("gh-linked-prs", repo, number),
  getCurrentBranch: () => ipcRenderer.invoke("gh-current-branch"),
  getRepoDefaultBranch: (repo) => ipcRenderer.invoke("gh-repo-default-branch", repo),
  uploadImage: (repo, base64Data, filename) => ipcRenderer.invoke("gh-upload-image", repo, base64Data, filename),
  loadPmState: () => ipcRenderer.invoke("gh-load-pm-state"),
  savePmState: (state) => ipcRenderer.invoke("gh-save-pm-state", state),
  readImage: (filePath) => ipcRenderer.invoke("read-image", filePath),
  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("window-toggle-maximize"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  windowIsMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  onWindowStateChanged: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("window-state-changed", handler);
    return () => ipcRenderer.removeListener("window-state-changed", handler);
  },
  authStart: () => ipcRenderer.invoke("gh-auth-start"),
  authCancel: () => ipcRenderer.invoke("gh-auth-cancel"),
  authLogout: () => ipcRenderer.invoke("gh-auth-logout"),
  onAuthEvent: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on("gh-auth-event", listener);
    return () => ipcRenderer.removeListener("gh-auth-event", listener);
  },
});
