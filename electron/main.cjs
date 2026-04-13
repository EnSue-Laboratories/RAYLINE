const { app, BrowserWindow, ipcMain, dialog, nativeImage, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { startAgent, cancelAgent, cancelAll, rewindFiles } = require("./agent-manager.cjs");
const { listSessions, loadSessionMessages, moveSession } = require("./session-reader.cjs");
const { createCheckpoint, restoreCheckpoint } = require("./checkpoint.cjs");
const terminalManager = require("./terminal-manager.cjs");

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

  // Start terminal session WebSocket server + write MCP config
  terminalManager.startServer().then((port) => {
    console.log("[main] Terminal WebSocket server on port", port);
    const mcpConfig = {
      mcpServers: {
        "terminal-sessions": {
          command: "node",
          args: [path.join(__dirname, "mcp-terminal-server.cjs"), String(port)],
        },
      },
    };
    const mcpConfigPath = path.join(app.getPath("userData"), "mcp-terminal.json");
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    global.mcpConfigPath = mcpConfigPath;
  });

  // Forward terminal output to renderer
  terminalManager.setOutputCallback((name, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("terminal-output", { name, data });
    }
  });
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

// IPC: wallpaper image picker
ipcMain.handle("select-wallpaper", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"] }],
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

ipcMain.handle("rewind-files", async (_event, opts) => {
  return rewindFiles(opts);
});

ipcMain.handle("checkpoint-create", async (_event, cwdPath) => {
  console.log("[checkpoint-main] checkpoint-create", { cwdPath });
  try {
    const result = await createCheckpoint(cwdPath);
    console.log("[checkpoint-main] checkpoint-create:success", result);
    return result;
  } catch (error) {
    console.error("[checkpoint-main] checkpoint-create:failed", error);
    throw error;
  }
});

ipcMain.handle("checkpoint-restore", async (_event, cwdPath, ref) => {
  console.log("[checkpoint-main] checkpoint-restore", { cwdPath, ref });
  try {
    const result = await restoreCheckpoint(cwdPath, ref);
    console.log("[checkpoint-main] checkpoint-restore:success", result);
    return result;
  } catch (error) {
    console.error("[checkpoint-main] checkpoint-restore:failed", error);
    throw error;
  }
});

// IPC: sessions
ipcMain.handle("list-sessions", async (_event, cwd) => {
  return listSessions(cwd);
});

ipcMain.handle("load-session", async (_event, sessionId) => {
  return loadSessionMessages(sessionId);
});

ipcMain.handle("move-session", async (_event, sessionId, newCwd) => {
  return moveSession(sessionId, newCwd);
});

// IPC: file-based state persistence (survives app name changes)
const stateFilePath = path.join(app.getPath("userData"), "claudi-state.json");

ipcMain.handle("save-state", async (_event, state) => {
  try {
    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2));
    return true;
  } catch (e) {
    console.error("Failed to save state:", e);
    return false;
  }
});

ipcMain.handle("load-state", async () => {
  try {
    if (fs.existsSync(stateFilePath)) {
      return JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
    }
    // Try migrating from old app name
    const oldPaths = [
      path.join(app.getPath("home"), "Library/Application Support/scaffold-tmp/claudi-state.json"),
      path.join(app.getPath("home"), "Library/Application Support/Ensue/claudi-state.json"),
    ];
    for (const old of oldPaths) {
      if (fs.existsSync(old)) {
        const data = JSON.parse(fs.readFileSync(old, "utf-8"));
        fs.writeFileSync(stateFilePath, JSON.stringify(data, null, 2));
        return data;
      }
    }
  } catch (e) {
    console.error("Failed to load state:", e);
  }
  return null;
});

// IPC: system info
ipcMain.handle("system-info", () => ({
  user: os.userInfo().username,
  hostname: os.hostname(),
  platform: os.platform(),
  arch: os.arch(),
  nodeVersion: process.versions.node,
  electronVersion: process.versions.electron,
  cpus: os.cpus().length,
  memory: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + " GB",
  shell: (process.env.SHELL || process.env.COMSPEC || "unknown").split("/").pop(),
}));

// IPC: quick explain (one-shot, not in chat history)
ipcMain.handle("quick-explain", async (_event, { text, model }) => {
  const { spawn } = require("child_process");
  return new Promise((resolve) => {
    const args = [
      "--print",
      "--output-format", "text",
      "--tools", "",
      "--model", model || "haiku",
      "--no-session-persistence",
      "--system-prompt", "You are a concise explainer. Give 1-3 sentence explanations. Use markdown for formatting.",
      `Explain this briefly:\n\n${text}`,
    ];
    const child = spawn("claude", args, {
      env: { ...process.env, FORCE_COLOR: "0", PATH: process.env.PATH + ":/opt/homebrew/bin:/usr/local/bin" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (c) => { out += c.toString(); });
    child.stderr.on("data", () => {});
    child.on("close", () => resolve(out.trim()));
    child.on("error", (err) => resolve(`Error: ${err.message}`));
    setTimeout(() => { child.kill(); resolve(out.trim() || "Timed out"); }, 30000);
  });
});

// IPC: terminal sessions
ipcMain.handle("terminal-create", async (_event, opts) => {
  return terminalManager.createSession(opts);
});

ipcMain.handle("terminal-send", async (_event, { name, text }) => {
  return terminalManager.sendInput(name, text);
});

ipcMain.handle("terminal-read", async (_event, { name, lines }) => {
  return terminalManager.readOutput(name, lines);
});

ipcMain.handle("terminal-kill", async (_event, { name }) => {
  return terminalManager.killSession(name);
});

ipcMain.handle("terminal-list", async () => {
  return terminalManager.listSessions();
});

ipcMain.handle("terminal-resize", async (_event, { name, cols, rows }) => {
  return terminalManager.resizeSession(name, cols, rows);
});

ipcMain.handle("terminal-metadata", async () => {
  return terminalManager.getSessionMetadata();
});

// IPC: saved terminal metadata for restore on launch
const terminalMetaPath = path.join(app.getPath("userData"), "terminal-sessions.json");

ipcMain.handle("terminal-saved-metadata", async () => {
  try {
    if (fs.existsSync(terminalMetaPath)) {
      const data = JSON.parse(fs.readFileSync(terminalMetaPath, "utf-8"));
      fs.unlinkSync(terminalMetaPath);
      return data;
    }
  } catch {}
  return [];
});

app.on("before-quit", () => {
  // Save terminal session metadata for re-launch
  const meta = terminalManager.getSessionMetadata();
  if (meta.length > 0) {
    try {
      fs.writeFileSync(terminalMetaPath, JSON.stringify(meta, null, 2));
    } catch {}
  }
  cancelAll();
  terminalManager.stopServer();
});
