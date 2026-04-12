const { app, BrowserWindow, ipcMain, dialog, nativeImage, shell } = require("electron");
const path = require("path");
const { startAgent, cancelAgent, cancelAll } = require("./agent-manager.cjs");
const { listSessions, loadSessionMessages } = require("./session-reader.cjs");

const isDev = !app.isPackaged;

// Override app name (in dev, Electron uses its own binary name)
app.setName("Claudi");
if (isDev && process.platform === "darwin") {
  // Patch the dock name in dev mode
  const { execSync } = require("child_process");
  try {
    const plist = path.join(path.dirname(process.execPath), "..", "Info.plist");
    execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleName Claudi" "${plist}" 2>/dev/null || true`);
    execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Claudi" "${plist}" 2>/dev/null || true`);
  } catch {}
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "Claudi",
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

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const appUrl = isDev ? `http://localhost:${process.env.VITE_PORT || "5173"}` : "file://";
    if (!url.startsWith(appUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (isDev) {
    const port = process.env.VITE_PORT || "5173";
    mainWindow.loadURL(`http://localhost:${port}`);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.setName("Claudi");

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

ipcMain.handle("load-session", async (_event, sessionId) => {
  return loadSessionMessages(sessionId);
});

app.on("before-quit", () => {
  cancelAll();
});
