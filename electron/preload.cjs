const { contextBridge, ipcRenderer, webUtils } = require("electron");

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
  listSessions: (cwd) => ipcRenderer.invoke("list-sessions", cwd),
  loadSession: (sessionId) => ipcRenderer.invoke("load-session", sessionId),
  saveState: (state) => ipcRenderer.invoke("save-state", state),
  loadState: () => ipcRenderer.invoke("load-state"),
  getFilePath: (file) => {
    try { return webUtils.getPathForFile(file); } catch { return null; }
  },
  quickExplain: (opts) => ipcRenderer.invoke("quick-explain", opts),
});
