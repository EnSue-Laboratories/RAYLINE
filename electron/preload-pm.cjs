const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ghApi", {
  checkAuth: () => ipcRenderer.invoke("gh-check-auth"),
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
  loadPmState: () => ipcRenderer.invoke("gh-load-pm-state"),
  savePmState: (state) => ipcRenderer.invoke("gh-save-pm-state", state),
  readImage: (filePath) => ipcRenderer.invoke("read-image", filePath),
});
