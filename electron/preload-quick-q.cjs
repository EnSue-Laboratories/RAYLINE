const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  quickQState: () => ipcRenderer.invoke("quick-q-state"),
  quickQRetakeScreenshot: () => ipcRenderer.invoke("quick-q-retake-screenshot"),
  quickQOpenScreenSettings: () => ipcRenderer.invoke("quick-q-open-screen-settings"),
  quickQClose: () => ipcRenderer.invoke("quick-q-close"),

  agentStart: (opts) => ipcRenderer.send("quick-q-agent-start", opts),
  agentCancel: (payload) => ipcRenderer.send("quick-q-agent-cancel", payload),
  onAgentStream: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("agent-stream", handler);
    return () => ipcRenderer.removeListener("agent-stream", handler);
  },
  onAgentDone: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("agent-done", handler);
    return () => ipcRenderer.removeListener("agent-done", handler);
  },
  onAgentError: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("agent-error", handler);
    return () => ipcRenderer.removeListener("agent-error", handler);
  },

  onQuickQReset: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("quick-q-reset", handler);
    return () => ipcRenderer.removeListener("quick-q-reset", handler);
  },
  onQuickQShortcutStatus: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("quick-q-shortcut-status", handler);
    return () => ipcRenderer.removeListener("quick-q-shortcut-status", handler);
  },

  loadSession: (sessionId) => ipcRenderer.invoke("load-session", sessionId),
  readImage: (filePath) => ipcRenderer.invoke("read-image", filePath),
  writeClipboardImage: (dataUrl) => ipcRenderer.invoke("clipboard-write-image", dataUrl),
  getSystemInfo: () => ipcRenderer.invoke("system-info"),
});
