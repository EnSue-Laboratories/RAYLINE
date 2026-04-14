const { contextBridge, ipcRenderer, webUtils } = require("electron");

function logCheckpoint(...args) {
  console.log("[checkpoint-preload]", ...args);
}

contextBridge.exposeInMainWorld("api", {
  agentStart: (opts) => ipcRenderer.send("agent-start", opts),
  agentCancel: (id) => ipcRenderer.send("agent-cancel", id),
  agentEditAndResend: (opts) => ipcRenderer.send("agent-edit-resend", opts),
  onAgentStream: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("agent-stream", handler);
    return () => ipcRenderer.removeListener("agent-stream", handler);
  },
  onAgentDone: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("agent-done", handler);
    return () => ipcRenderer.removeListener("agent-done", handler);
  },
  onAgentError: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("agent-error", handler);
    return () => ipcRenderer.removeListener("agent-error", handler);
  },
  pickFolder: () => ipcRenderer.invoke("folder-pick"),
  selectWallpaper: (previousPath) => ipcRenderer.invoke("select-wallpaper", previousPath),
  deleteWallpaper: (filePath) => ipcRenderer.invoke("delete-wallpaper", filePath),
  readImage: (filePath) => ipcRenderer.invoke("read-image", filePath),
  listSessions: (cwd) => ipcRenderer.invoke("list-sessions", cwd),
  loadSession: (sessionId) => ipcRenderer.invoke("load-session", sessionId),
  moveSession: (sessionId, newCwd) => ipcRenderer.invoke("move-session", sessionId, newCwd),
  rewindFiles: (opts) => ipcRenderer.invoke("rewind-files", opts),
  checkpointCreate: async (cwdPath) => {
    logCheckpoint("checkpointCreate", { cwdPath });
    return ipcRenderer.invoke("checkpoint-create", cwdPath);
  },
  checkpointRestore: async (cwdPath, ref) => {
    logCheckpoint("checkpointRestore", { cwdPath, ref });
    return ipcRenderer.invoke("checkpoint-restore", cwdPath, ref);
  },
  saveState: (state) => ipcRenderer.invoke("save-state", state),
  loadState: () => ipcRenderer.invoke("load-state"),
  getFilePath: (file) => {
    try { return webUtils.getPathForFile(file); } catch { return null; }
  },
  quickExplain: (opts) => ipcRenderer.invoke("quick-explain", opts),
  getSystemInfo: () => ipcRenderer.invoke("system-info"),

  // Git operations
  gitBranches: (cwd) => ipcRenderer.invoke("git-branches", cwd),
  gitCreateBranch: (cwd, name) => ipcRenderer.invoke("git-create-branch", cwd, name),
  gitCheckout: (cwd, name) => ipcRenderer.invoke("git-checkout", cwd, name),
  gitWorktreeList: (cwd) => ipcRenderer.invoke("git-worktree-list", cwd),
  gitWorktreeAdd: (cwd, path, branch) => ipcRenderer.invoke("git-worktree-add", cwd, path, branch),
  gitDeleteBranch: (cwd, name) => ipcRenderer.invoke("git-delete-branch", cwd, name),
  gitWorktreeRemove: (cwd, path) => ipcRenderer.invoke("git-worktree-remove", cwd, path),

  // Terminal sessions
  terminalCreate: (opts) => ipcRenderer.invoke("terminal-create", opts),
  terminalSend: ({ name, text }) => ipcRenderer.invoke("terminal-send", { name, text }),
  terminalRead: ({ name, lines }) => ipcRenderer.invoke("terminal-read", { name, lines }),
  terminalKill: ({ name }) => ipcRenderer.invoke("terminal-kill", { name }),
  terminalList: () => ipcRenderer.invoke("terminal-list"),
  terminalResize: ({ name, cols, rows }) => ipcRenderer.invoke("terminal-resize", { name, cols, rows }),
  terminalMetadata: () => ipcRenderer.invoke("terminal-metadata"),
  terminalSavedMetadata: () => ipcRenderer.invoke("terminal-saved-metadata"),
  onTerminalOutput: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("terminal-output", handler);
    return () => ipcRenderer.removeListener("terminal-output", handler);
  },

  // Project Manager
  openProjectManager: () => ipcRenderer.send("open-project-manager"),
});
