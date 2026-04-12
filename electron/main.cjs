const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require("electron");
const path = require("path");
const { startAgent, cancelAgent, cancelAll } = require("./agent-manager.cjs");
const { listSessions } = require("./session-reader.cjs");

const isDev = !app.isPackaged;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#000000",
    icon: path.join(__dirname, "../public/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    const port = process.env.VITE_PORT || "5173";
    mainWindow.loadURL(`http://localhost:${port}`);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  // Set dock icon on macOS
  if (process.platform === "darwin") {
    const iconPath = path.join(__dirname, "../public/icon.png");
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) app.dock.setIcon(icon);
  }
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC: folder picker
ipcMain.handle("folder-pick", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

// IPC: agent
ipcMain.on("agent-start", (event, opts) => {
  startAgent(opts, event.sender);
});

ipcMain.on("agent-cancel", (_event, { conversationId }) => {
  cancelAgent(conversationId);
});

ipcMain.on("agent-edit-resend", (event, opts) => {
  startAgent({ ...opts, forkSession: true }, event.sender);
});

// IPC: sessions
ipcMain.handle("list-sessions", async (_event, cwd) => {
  return listSessions(cwd);
});

app.on("before-quit", () => {
  cancelAll();
});
