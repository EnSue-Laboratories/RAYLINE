const { app, BrowserWindow, ipcMain, dialog, nativeImage, shell, clipboard, nativeTheme } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { startAgent, cancelAgent, cancelAll, rewindFiles } = require("./agent-manager.cjs");
const { startCodexAgent, cancelCodexAgent, cancelAllCodex } = require("./codex-agent-manager.cjs");
const {
  startMulticaAgent,
  cancelMulticaAgent,
  multicaSendCode,
  multicaVerifyCode,
  multicaListWorkspaces,
  multicaListAgents,
  multicaEnsureSession,
  multicaSendMessage,
  multicaListMessages,
  subscribeMulticaAgent,
} = require("./multica-manager.cjs");
const { buildSpawnPath, resolveCliBin, spawnCli } = require("./cli-bin-resolver.cjs");
const { listSessions, loadSessionMessages, moveSession } = require("./session-reader.cjs");
const { createCheckpoint, restoreCheckpoint } = require("./checkpoint.cjs");
const terminalManager = require("./terminal-manager.cjs");
const ghManager = require("./github-manager.cjs");

const isDev = !app.isPackaged;
const isMac = process.platform === "darwin";
const isWindows = process.platform === "win32";
const SHELL_COMMAND_TIMEOUT_MS = 15000;
const SHELL_OUTPUT_LIMIT = 128 * 1024;
const WINDOW_BACKGROUND = "#0D0D10";
const TERMINAL_DEBUG_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.RAYLINE_TERMINAL_DEBUG || ""));
const WALLPAPER_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"];
const WALLPAPER_MIME_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
};

// Override app name (in dev, Electron uses its own binary name)
app.setName("RayLine");
if (isDev && isMac) {
  // Patch the dock name in dev mode
  const { execSync } = require("child_process");
  try {
    const plist = path.join(path.dirname(process.execPath), "..", "Info.plist");
    execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleName RayLine" "${plist}" 2>/dev/null || true`);
    execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName RayLine" "${plist}" 2>/dev/null || true`);
  } catch {}
}

let mainWindow;
let pmWindow;
let terminalWindow;
let terminalWindowRevealTimer = null;
let pendingPreferredTerminalSessionName = null;

function terminalDebug(event, details = {}, meta = {}) {
  if (!TERMINAL_DEBUG_ENABLED) return;
  const payload = {
    ts: new Date().toISOString(),
    event,
    ...meta,
    details,
  };
  console.log(`[terminal-debug] ${JSON.stringify(payload)}`);
}

function broadcastToAllWindows(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win || win.isDestroyed()) continue;
    win.webContents.send(channel, payload);
  }
}

function isTerminalWindowOpen() {
  return Boolean(terminalWindow && !terminalWindow.isDestroyed());
}

function broadcastTerminalWindowState() {
  broadcastToAllWindows("terminal-window-state", { open: isTerminalWindowOpen() });
}

function clearTerminalWindowRevealTimer() {
  if (!terminalWindowRevealTimer) return;
  clearTimeout(terminalWindowRevealTimer);
  terminalWindowRevealTimer = null;
}

function revealTerminalWindow(reason = "unknown") {
  if (!isTerminalWindowOpen()) return;
  clearTerminalWindowRevealTimer();
  if (!terminalWindow.isVisible()) {
    terminalWindow.show();
  }
  terminalWindow.focus();
  terminalDebug("terminal-window:revealed", {
    reason,
    ...describeWindow(terminalWindow),
  }, { source: "main" });
}

function getCurrentSystemTheme() {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

function broadcastSystemTheme() {
  const theme = getCurrentSystemTheme();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win || win.isDestroyed()) continue;
    win.webContents.send("system-theme-changed", theme);
  }
}

function getWindowChromeOptions() {
  if (isMac) {
    return {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 18 },
    };
  }

  if (isWindows) {
    return {
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: WINDOW_BACKGROUND,
        symbolColor: "#C8CBD3",
        height: 52,
      },
      autoHideMenuBar: true,
    };
  }

  return {};
}

function applyWindowChromeTweaks(win) {
  if (!win || !isWindows) return;
  win.setMenuBarVisibility(false);
}

function describeWindow(win) {
  if (!win || win.isDestroyed()) return null;
  const bounds = win.getBounds();
  const [contentWidth, contentHeight] = win.getContentSize();
  return {
    bounds,
    contentSize: { width: contentWidth, height: contentHeight },
    focused: win.isFocused(),
    visible: win.isVisible(),
    minimized: win.isMinimized(),
  };
}

function attachTerminalWindowDebug(win) {
  if (!TERMINAL_DEBUG_ENABLED || !win) return;

  const events = [
    "ready-to-show",
    "show",
    "hide",
    "focus",
    "blur",
    "resize",
    "move",
    "maximize",
    "unmaximize",
    "enter-full-screen",
    "leave-full-screen",
  ];

  for (const eventName of events) {
    win.on(eventName, () => {
      terminalDebug(`terminal-window:${eventName}`, describeWindow(win), { source: "main" });
    });
  }

  win.webContents.on("did-finish-load", () => {
    terminalDebug("terminal-window:did-finish-load", {
      ...describeWindow(win),
      url: win.webContents.getURL(),
    }, { source: "main" });
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    terminalDebug("terminal-window:render-process-gone", details, { source: "main" });
  });
}

function getWallpaperStorageDir() {
  const dir = path.join(app.getPath("userData"), "wallpapers");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getDraftsStorageDir() {
  const dir = path.join(app.getPath("userData"), "drafts");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function isManagedWallpaperPath(filePath) {
  if (!filePath) return false;
  const relative = path.relative(getWallpaperStorageDir(), path.resolve(filePath));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function removeManagedWallpaper(filePath) {
  if (!isManagedWallpaperPath(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

function importWallpaperToStorage(sourcePath, previousPath) {
  const ext = path.extname(sourcePath).toLowerCase();
  const baseName = path.basename(sourcePath, ext)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "wallpaper";
  const storedPath = path.join(getWallpaperStorageDir(), `${Date.now()}-${baseName}${ext || ".png"}`);
  fs.copyFileSync(sourcePath, storedPath);
  if (previousPath && previousPath !== storedPath) {
    removeManagedWallpaper(previousPath);
  }
  return storedPath;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "RayLine",
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: WINDOW_BACKGROUND,
    icon: path.join(__dirname, "../public/icon.png"),
    ...getWindowChromeOptions(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  applyWindowChromeTweaks(mainWindow);

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

function createProjectManagerWindow() {
  if (pmWindow && !pmWindow.isDestroyed()) {
    pmWindow.focus();
    return;
  }
  pmWindow = new BrowserWindow({
    title: "GitHub Projects",
    width: 1000,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: WINDOW_BACKGROUND,
    icon: path.join(__dirname, "../public/icon.png"),
    ...getWindowChromeOptions(),
    webPreferences: {
      preload: path.join(__dirname, "preload-pm.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  applyWindowChromeTweaks(pmWindow);

  pmWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    const port = process.env.VITE_PORT || "5173";
    pmWindow.loadURL(`http://localhost:${port}/src/project-manager.html`);
  } else {
    pmWindow.loadFile(path.join(__dirname, "../dist/src/project-manager.html"));
  }

  pmWindow.on("closed", () => { pmWindow = null; });
}

function createTerminalWindow() {
  if (isTerminalWindowOpen()) {
    if (terminalWindow.isMinimized()) terminalWindow.restore();
    revealTerminalWindow("existing-window");
    broadcastTerminalWindowState();
    return terminalWindow;
  }

  terminalWindow = new BrowserWindow({
    title: "Terminals",
    width: 960,
    height: 760,
    minWidth: 560,
    minHeight: 320,
    show: false,
    backgroundColor: WINDOW_BACKGROUND,
    icon: path.join(__dirname, "../public/icon.png"),
    ...getWindowChromeOptions(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  applyWindowChromeTweaks(terminalWindow);
  attachTerminalWindowDebug(terminalWindow);

  terminalWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    const port = process.env.VITE_PORT || "5173";
    terminalWindow.loadURL(`http://localhost:${port}/src/terminal-window.html`);
  } else {
    terminalWindow.loadFile(path.join(__dirname, "../dist/src/terminal-window.html"));
  }

  clearTerminalWindowRevealTimer();
  terminalWindowRevealTimer = setTimeout(() => {
    revealTerminalWindow("startup-timeout");
  }, isDev ? 2500 : 1500);

  terminalWindow.on("closed", () => {
    clearTerminalWindowRevealTimer();
    terminalWindow = null;
    broadcastTerminalWindowState();
  });

  broadcastTerminalWindowState();
  return terminalWindow;
}

app.setName("RayLine");

app.whenReady().then(() => {
  terminalDebug("app:ready", {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
  }, { source: "main" });

  // Set dock icon on macOS
  if (isMac) {
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
    global.terminalWsPort = port;
  });

  // Forward terminal output to renderer
  terminalManager.setOutputCallback((name, data) => {
    broadcastToAllWindows("terminal-output", { name, data });
  });

  terminalManager.setSessionStateCallback((payload) => {
    if (payload.reason === "created" && payload.name) {
      pendingPreferredTerminalSessionName = payload.name;
    } else if (!payload.sessions?.some((session) => session.name === pendingPreferredTerminalSessionName)) {
      pendingPreferredTerminalSessionName = null;
    }

    broadcastToAllWindows("terminal-sessions-state", payload);

    if (payload.sessions.length === 0) {
      if (isTerminalWindowOpen()) {
        terminalWindow.close();
      }
      return;
    }

    if (payload.reason === "created") {
      createTerminalWindow();
    }
  });

  nativeTheme.on("updated", broadcastSystemTheme);
});

app.on("window-all-closed", () => {
  if (!isMac) app.quit();
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

ipcMain.on("open-project-manager", () => {
  createProjectManagerWindow();
});

ipcMain.handle("open-terminal-window", () => {
  createTerminalWindow();
  return true;
});

ipcMain.handle("close-terminal-window", () => {
  if (isTerminalWindowOpen()) {
    terminalWindow.close();
  }
  return true;
});

ipcMain.handle("is-terminal-window-open", () => {
  return isTerminalWindowOpen();
});

ipcMain.on("terminal-debug-log", (event, payload = {}) => {
  if (!TERMINAL_DEBUG_ENABLED) return;
  const win = BrowserWindow.fromWebContents(event.sender);
  terminalDebug(payload.event || "renderer-log", payload.details || {}, {
    source: payload.source || "renderer",
    page: payload.page || event.sender.getURL?.(),
    windowTitle: win?.getTitle?.() || null,
  });
});

ipcMain.on("terminal-window-ready", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed() || win !== terminalWindow) return;
  revealTerminalWindow("renderer-ready");
});

ipcMain.handle("window-close-current", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return false;
  win.close();
  return true;
});

ipcMain.handle("set-window-opacity", (event, opacity) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win) return false;
  const v = Number(opacity);
  if (!Number.isFinite(v)) return false;
  win.setOpacity(Math.max(0.2, Math.min(1, v)));
  return true;
});

ipcMain.handle("get-system-theme", () => getCurrentSystemTheme());

ipcMain.handle("clipboard-write-image", (_event, dataUrl) => {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return false;
  }

  try {
    const image = nativeImage.createFromDataURL(dataUrl);
    if (image.isEmpty()) {
      return false;
    }
    clipboard.writeImage(image);
    return true;
  } catch (error) {
    console.error("[clipboard-write-image] Failed to write image", error);
    return false;
  }
});

// IPC: open path in Finder / file manager
ipcMain.handle("open-path", async (_event, dirPath) => {
  const { shell } = require("electron");
  return shell.openPath(dirPath);
});

// IPC: select files (for attachments)
ipcMain.handle("select-files", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
  });
  return result.canceled ? [] : result.filePaths;
});

// IPC: wallpaper image picker
ipcMain.handle("select-wallpaper", async (_event, previousPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: WALLPAPER_EXTENSIONS }],
  });
  if (result.canceled) return null;
  try {
    return importWallpaperToStorage(result.filePaths[0], previousPath);
  } catch (error) {
    console.error("Failed to import wallpaper:", error);
    return null;
  }
});

ipcMain.handle("delete-wallpaper", async (_event, filePath) => {
  try {
    removeManagedWallpaper(filePath);
    return true;
  } catch (error) {
    console.error("Failed to delete wallpaper:", error);
    return false;
  }
});

// IPC: read image file as data URL (for wallpaper preview + background)
ipcMain.handle("read-image", async (_event, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace(".", "");
    const mime = WALLPAPER_MIME_TYPES[ext] || "image/png";
    return `data:${mime};base64,${data.toString("base64")}`;
  } catch {
    return null;
  }
});

// IPC: agent
ipcMain.on("agent-start", (event, opts) => {
  if (opts.provider === "multica") {
    startMulticaAgent(opts, event.sender).catch((err) => {
      event.sender.send("agent-stream", {
        conversationId: opts.conversationId,
        event: { type: "multica:error", payload: { message: err?.message || String(err) } },
      });
      event.sender.send("agent-done", { conversationId: opts.conversationId });
    });
  } else if (opts.provider === "codex") {
    startCodexAgent(opts, event.sender);
  } else {
    startAgent(opts, event.sender);
  }
});

ipcMain.on("agent-cancel", (_event, { conversationId }) => {
  cancelAgent(conversationId);
  cancelCodexAgent(conversationId);
  cancelMulticaAgent(conversationId).catch((err) => {
    console.error("[multica] cancel failed", { conversationId, error: err?.message || String(err) });
  });
});

ipcMain.on("agent-edit-resend", (event, opts) => {
  if (opts.provider === "codex") {
    startCodexAgent({ ...opts, resumeSessionId: opts.resumeSessionId }, event.sender);
  } else {
    startAgent({ ...opts, forkSession: true }, event.sender);
  }
});

// IPC: multica
ipcMain.handle("multica-send-code", (_e, args) => multicaSendCode(args));
ipcMain.handle("multica-verify-code", (_e, args) => multicaVerifyCode(args));
ipcMain.handle("multica-list-workspaces", (_e, args) => multicaListWorkspaces(args));
ipcMain.handle("multica-list-agents", (_e, args) => multicaListAgents(args));
ipcMain.handle("multica-ensure-session", (_e, args) => multicaEnsureSession(args));
ipcMain.handle("multica-send-message", (_e, args) => multicaSendMessage(args));
ipcMain.handle("multica-list-messages", (_e, args) => multicaListMessages(args));
ipcMain.handle("multica-subscribe", (event, args) => subscribeMulticaAgent(args, event.sender));

ipcMain.handle("rewind-files", async (_event, opts) => {
  return rewindFiles(opts);
});

ipcMain.handle("checkpoint-create", async (_event, cwdPath) => {
  const startedAt = Date.now();
  console.log("[checkpoint-main] checkpoint-create", { cwdPath });
  try {
    const result = await createCheckpoint(cwdPath);
    console.log("[checkpoint-main] checkpoint-create:success", {
      cwdPath,
      durationMs: Date.now() - startedAt,
      result,
    });
    return result;
  } catch (error) {
    console.error("[checkpoint-main] checkpoint-create:failed", {
      cwdPath,
      durationMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }
});

ipcMain.handle("checkpoint-restore", async (_event, cwdPath, ref) => {
  const startedAt = Date.now();
  console.log("[checkpoint-main] checkpoint-restore", { cwdPath, ref });
  try {
    const result = await restoreCheckpoint(cwdPath, ref);
    console.log("[checkpoint-main] checkpoint-restore:success", {
      cwdPath,
      ref,
      durationMs: Date.now() - startedAt,
      result,
    });
    return result;
  } catch (error) {
    console.error("[checkpoint-main] checkpoint-restore:failed", {
      cwdPath,
      ref,
      durationMs: Date.now() - startedAt,
      error,
    });
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

function persistStateToDisk(state) {
  try {
    // Preserve pmRepos from PM window (main app state doesn't include it)
    let existing = {};
    try {
      if (fs.existsSync(stateFilePath)) {
        existing = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
      }
    } catch {}
    const merged = { ...state };
    if (existing.pmRepos !== undefined && state.pmRepos === undefined) {
      merged.pmRepos = existing.pmRepos;
    }
    fs.writeFileSync(stateFilePath, JSON.stringify(merged, null, 2));
    return true;
  } catch (e) {
    console.error("Failed to save state:", e);
    return false;
  }
}

ipcMain.handle("save-state", async (_event, state) => {
  return persistStateToDisk(state);
});

ipcMain.on("save-state-sync", (event, state) => {
  event.returnValue = persistStateToDisk(state);
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
ipcMain.handle("get-drafts-path", () => getDraftsStorageDir());

ipcMain.handle("path-exists", (_e, p) => {
  if (!p || typeof p !== "string") return false;
  try { return fs.existsSync(p); } catch { return false; }
});

const CLI_INSTALL_CHECK_TTL_MS = 5000;
let cliInstallCheckCache = null;
let cliInstallCheckCacheAt = 0;

function getCliInstalledSnapshot({ force = false } = {}) {
  const now = Date.now();
  if (!force && cliInstallCheckCache && (now - cliInstallCheckCacheAt) < CLI_INSTALL_CHECK_TTL_MS) {
    return cliInstallCheckCache;
  }

  cliInstallCheckCache = {
    claude: Boolean(resolveCliBin("claude", { envVarName: "CLAUDE_BIN" })),
    codex: Boolean(resolveCliBin("codex", { envVarName: "CODEX_BIN" })),
  };
  cliInstallCheckCacheAt = Date.now();
  return cliInstallCheckCache;
}

// IPC: probe which provider CLIs are installed on PATH (claude, codex).
// Renderer uses this to gray out provider groups whose CLI is missing and
// redirect the user to the installation guide instead.
ipcMain.handle("check-cli-installed", (_event, options = {}) => {
  return getCliInstalledSnapshot(options);
});

ipcMain.handle("system-info", () => ({
  user: os.userInfo().username,
  hostname: os.hostname(),
  platform: os.platform(),
  arch: os.arch(),
  home: os.homedir(),
  nodeVersion: process.versions.node,
  electronVersion: process.versions.electron,
  cpus: os.cpus().length,
  memory: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + " GB",
  shell: (process.env.SHELL || process.env.COMSPEC || "unknown").split("/").pop(),
}));

// IPC: quick explain (one-shot, not in chat history)
ipcMain.handle("quick-explain", async (_event, { text, model }) => {
  return new Promise((resolve) => {
    const claudeBin = resolveCliBin("claude", { envVarName: "CLAUDE_BIN" });
    if (!claudeBin) {
      resolve("Error: Unable to locate the Claude CLI binary");
      return;
    }

    const args = [
      "--print",
      "--output-format", "text",
      "--tools", "",
      "--model", model || "sonnet",
      "--no-session-persistence",
      "--system-prompt", "You are a concise explainer. Give 1-3 sentence explanations. Use markdown for formatting.",
      `Explain this briefly:\n\n${text}`,
    ];
    const child = spawnCli(claudeBin, args, {
      env: { ...process.env, FORCE_COLOR: "0", PATH: buildSpawnPath() },
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

ipcMain.handle("shell-run", async (_event, { command, cwd }) => {
  const { spawn } = require("child_process");

  return new Promise((resolve) => {
    const shellCommand = String(command || "").trim();
    const workDir = cwd || os.homedir();

    if (!shellCommand) {
      resolve({
        ok: false,
        command: shellCommand,
        cwd: workDir,
        stdout: "",
        stderr: "",
        exitCode: null,
        timedOut: false,
        truncated: false,
        error: "Command is required.",
      });
      return;
    }

    const shellBin = isWindows ? (process.env.ComSpec || "cmd.exe") : "/bin/sh";
    const shellArgs = isWindows
      ? ["/d", "/s", "/c", shellCommand]
      : ["-c", shellCommand];
    const env = { ...process.env, FORCE_COLOR: "0", PATH: buildSpawnPath() };

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let truncated = false;
    let settled = false;

    const appendChunk = (current, chunk) => {
      if (current.length >= SHELL_OUTPUT_LIMIT) {
        truncated = true;
        return current;
      }

      const text = chunk.toString();
      const remaining = SHELL_OUTPUT_LIMIT - current.length;
      if (text.length > remaining) {
        truncated = true;
        return current + text.slice(0, remaining);
      }

      return current + text;
    };

    let child;
    try {
      child = spawn(shellBin, shellArgs, {
        cwd: workDir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        ok: false,
        command: shellCommand,
        cwd: workDir,
        stdout: "",
        stderr: "",
        exitCode: null,
        timedOut: false,
        truncated: false,
        error: error.message || String(error),
      });
      return;
    }

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {}
    }, SHELL_COMMAND_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout = appendChunk(stdout, chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr = appendChunk(stderr, chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        command: shellCommand,
        cwd: workDir,
        stdout,
        stderr,
        exitCode: null,
        timedOut,
        truncated,
        error: error.message || String(error),
      });
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      finish({
        ok: true,
        command: shellCommand,
        cwd: workDir,
        stdout,
        stderr,
        exitCode,
        timedOut,
        truncated,
      });
    });
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

ipcMain.handle("terminal-consume-preferred-session", async () => {
  const preferredSessionName = pendingPreferredTerminalSessionName;
  pendingPreferredTerminalSessionName = null;
  return preferredSessionName;
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

// IPC: git operations
const { execFile } = require("child_process");
function git(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, timeout: 10000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout.trim());
    });
  });
}

function gitLong(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, timeout: 60000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout.trim());
    });
  });
}

function ghRepo(args, cwd, { timeout = 15000, maxBuffer = 10 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    execFile("gh", args, {
      cwd,
      env: { ...process.env, PATH: buildSpawnPath() },
      timeout,
      maxBuffer,
    }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || "").trim() || err.message));
      else resolve(stdout.trim());
    });
  });
}

function extractPrNumber(value) {
  const match = String(value || "").match(/\/pull\/(\d+)(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

async function getRepoPrContext(cwd) {
  const raw = await ghRepo(["repo", "view", "--json", "nameWithOwner,parent"], cwd);
  const repo = JSON.parse(raw);
  const currentRepo = repo?.nameWithOwner || null;
  const baseRepo = repo?.parent?.nameWithOwner || currentRepo;
  const headOwner = currentRepo?.split("/")[0] || null;
  return { currentRepo, baseRepo, headOwner };
}

function normalizeOpenPr(pr) {
  if (!pr) return null;
  return {
    number: pr.number,
    title: pr.title,
    url: pr.html_url || pr.url || null,
    state: String(pr.state || "").toUpperCase(),
    headRefName: pr.head?.ref || pr.headRefName || null,
    baseRefName: pr.base?.ref || pr.baseRefName || null,
    isDraft: Boolean(pr.draft ?? pr.isDraft),
  };
}

async function getCurrentBranchOpenPr(cwd, branch) {
  const { baseRepo, headOwner } = await getRepoPrContext(cwd);
  if (!baseRepo || !headOwner || !branch) return null;
  const raw = await ghRepo([
    "api",
    "--method",
    "GET",
    `/repos/${baseRepo}/pulls`,
    "-f",
    "state=open",
    "-f",
    `head=${headOwner}:${branch}`,
  ], cwd);
  const prs = JSON.parse(raw);
  if (!Array.isArray(prs) || prs.length === 0) return null;
  return normalizeOpenPr(prs[0]);
}

async function mergeCurrentBranchOpenPr(cwd, branch) {
  const { baseRepo } = await getRepoPrContext(cwd);
  const openPr = await getCurrentBranchOpenPr(cwd, branch);
  if (!baseRepo || !openPr) return null;
  const raw = await ghRepo([
    "api",
    "--method",
    "PUT",
    `/repos/${baseRepo}/pulls/${openPr.number}/merge`,
  ], cwd, { timeout: 60000 });
  const result = JSON.parse(raw);
  return { openPr, result };
}

ipcMain.handle("git-branches", async (_event, cwd) => {
  if (!cwd) return { current: null, branches: [] };
  try {
    const raw = await git(["branch", "--format=%(refname:short)\t%(HEAD)"], cwd);
    let current = null;
    const branches = raw.split("\n").filter(Boolean).map((line) => {
      const [name, head] = line.split("\t");
      if (head === "*") current = name;
      return name;
    });
    return { current, branches };
  } catch {
    return { current: null, branches: [] };
  }
});

ipcMain.handle("git-create-branch", async (_event, cwd, branchName) => {
  await git(["checkout", "-b", branchName], cwd);
  return { success: true };
});

ipcMain.handle("git-checkout", async (_event, cwd, branchName) => {
  await git(["checkout", branchName], cwd);
  return { success: true };
});

ipcMain.handle("git-worktree-list", async (_event, cwd) => {
  if (!cwd) return [];
  try {
    const raw = await git(["worktree", "list", "--porcelain"], cwd);
    const worktrees = [];
    let current = {};
    for (const line of raw.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current.path) worktrees.push(current);
        current = { path: line.slice(9) };
      } else if (line.startsWith("HEAD ")) {
        current.head = line.slice(5);
      } else if (line.startsWith("branch ")) {
        current.branch = line.slice(7).replace("refs/heads/", "");
      } else if (line === "bare") {
        current.bare = true;
      } else if (line === "") {
        if (current.path) worktrees.push(current);
        current = {};
      }
    }
    if (current.path) worktrees.push(current);
    return worktrees;
  } catch {
    return [];
  }
});

ipcMain.handle("git-worktree-add", async (_event, cwd, worktreePath, branchName, options = {}) => {
  // Ensure .worktrees/ directory exists and is gitignored
  const wtDir = path.dirname(worktreePath);
  if (!fs.existsSync(wtDir)) fs.mkdirSync(wtDir, { recursive: true });
  const gitignorePath = path.join(cwd, ".gitignore");
  try {
    const gi = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf-8") : "";
    if (!gi.includes(".worktrees")) {
      fs.appendFileSync(gitignorePath, "\n.worktrees/\n");
    }
  } catch {}
  const createBranch = options?.createBranch !== false;
  const startPoint = options?.startPoint;
  const args = ["worktree", "add", worktreePath];
  if (createBranch) {
    args.push("-b", branchName);
    if (startPoint) args.push(startPoint);
  } else if (branchName) {
    args.push(branchName);
  } else if (startPoint) {
    args.push(startPoint);
  }
  await git(args, cwd);
  return { success: true, path: worktreePath };
});

ipcMain.handle("git-delete-branch", async (_event, cwd, branchName) => {
  await git(["branch", "-D", branchName], cwd);
  return { success: true };
});

ipcMain.handle("git-worktree-remove", async (_event, cwd, worktreePath) => {
  await git(["worktree", "remove", worktreePath], cwd);
  return { success: true };
});

ipcMain.handle("git-worktree-promote", async (_event, mainRepoPath, worktreePath, branchName) => {
  if (!mainRepoPath || !worktreePath) {
    return { success: false, error: "missing paths" };
  }
  // Verify main repo is clean
  try {
    const porcelain = await git(["status", "--porcelain"], mainRepoPath);
    if (porcelain.trim().length > 0) {
      return { success: false, code: "DIRTY", error: "Main repo has uncommitted changes" };
    }
    const gitDirRaw = await git(["rev-parse", "--git-dir"], mainRepoPath);
    const gitDir = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.join(mainRepoPath, gitDirRaw);
    const markers = [
      ["MERGE_HEAD", "merge"],
      ["REBASE_HEAD", "rebase"],
      ["rebase-merge", "rebase"],
      ["rebase-apply", "rebase"],
      ["CHERRY_PICK_HEAD", "cherry-pick"],
      ["REVERT_HEAD", "revert"],
      ["BISECT_LOG", "bisect"],
    ];
    for (const [file, label] of markers) {
      if (fs.existsSync(path.join(gitDir, file))) {
        return { success: false, code: "BUSY", error: `Main repo has an in-progress ${label}` };
      }
    }
  } catch (err) {
    return { success: false, error: err.message || "Failed to check main repo" };
  }
  try {
    await git(["worktree", "remove", worktreePath], mainRepoPath);
  } catch (err) {
    return { success: false, error: err.message || "Failed to remove worktree" };
  }
  if (branchName) {
    try {
      await git(["checkout", branchName], mainRepoPath);
    } catch (err) {
      return { success: false, error: `Worktree removed, but checkout failed: ${err.message || err}` };
    }
  }
  return { success: true };
});

ipcMain.handle("git-status", async (_event, cwd) => {
  if (!cwd) return null;
  try {
    const raw = await git(["status", "--porcelain=v2", "--branch"], cwd);
    const out = {
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
      detached: false,
    };
    for (const line of raw.split("\n")) {
      if (!line) continue;
      if (line.startsWith("# branch.head ")) {
        const head = line.slice(14).trim();
        if (head === "(detached)") out.detached = true;
        else out.branch = head;
      } else if (line.startsWith("# branch.upstream ")) {
        out.upstream = line.slice(18).trim();
      } else if (line.startsWith("# branch.ab ")) {
        const m = line.slice(12).match(/^\+(\d+) -(\d+)/);
        if (m) { out.ahead = Number(m[1]); out.behind = Number(m[2]); }
      } else if (line.startsWith("1 ")) {
        // tracked: "1 XY ... <path>" — 8 header fields before path
        const parts = line.split(" ");
        const xy = parts[1];
        const path = parts.slice(8).join(" ");
        out.files.push({ path, index: xy[0], worktree: xy[1] });
      } else if (line.startsWith("2 ")) {
        // renamed/copied: "2 XY ... <score> <newPath>\t<origPath>" — 9 header fields, tab-separated paths
        const parts = line.split(" ");
        const xy = parts[1];
        const rest = parts.slice(9).join(" ");
        const [newPath] = rest.split("\t");
        out.files.push({ path: newPath, index: xy[0], worktree: xy[1] });
      } else if (line.startsWith("u ")) {
        // unmerged: "u XY ... <path>" — 10 header fields before path
        const parts = line.split(" ");
        const xy = parts[1];
        const path = parts.slice(10).join(" ");
        out.files.push({ path, index: xy[0], worktree: xy[1] });
      } else if (line.startsWith("? ")) {
        out.files.push({ path: line.slice(2), index: "?", worktree: "?" });
      } else if (line.startsWith("! ")) {
        // ignored — skip
      }
    }
    return out;
  } catch {
    return null;
  }
});

ipcMain.handle("git-remote-slug", async (_event, cwd) => {
  if (!cwd) return null;
  try {
    const raw = await git(["remote", "get-url", "origin"], cwd);
    // Match "git@github.com:owner/repo.git" or "https://github.com/owner/repo(.git)?"
    const m = raw.trim().match(/github\.com[:/]([^/]+)\/([^/.\s]+?)(?:\.git)?$/);
    return m ? `${m[1]}/${m[2]}` : null;
  } catch {
    return null;
  }
});

ipcMain.handle("git-fetch", async (_event, cwd) => {
  if (!cwd) return { ok: false, stderr: "no cwd" };
  try {
    await gitLong(["fetch", "--no-tags", "--quiet"], cwd);
    return { ok: true };
  } catch (err) {
    return { ok: false, stderr: err.message };
  }
});

ipcMain.handle("git-diff", async (_event, cwd) => {
  if (!cwd) return { diff: "", truncated: false };
  try {
    const raw = await git(["diff", "HEAD"], cwd);
    const LIMIT = 64 * 1024;
    if (raw.length > LIMIT) {
      return { diff: raw.slice(0, LIMIT), truncated: true };
    }
    return { diff: raw, truncated: false };
  } catch {
    try {
      const raw = await git(["diff"], cwd);
      return { diff: raw.slice(0, 64 * 1024), truncated: raw.length > 64 * 1024 };
    } catch {
      return { diff: "", truncated: false };
    }
  }
});

ipcMain.handle("git-stage", async (_event, cwd, paths) => {
  if (!cwd) return { ok: false, stderr: "no cwd" };
  try {
    const args = Array.isArray(paths) && paths.length
      ? ["add", "--", ...paths]
      : ["add", "-A"];
    await git(args, cwd);
    return { ok: true };
  } catch (err) {
    return { ok: false, stderr: err.message };
  }
});

ipcMain.handle("git-unstage", async (_event, cwd, paths) => {
  if (!cwd) return { ok: false, stderr: "no cwd" };
  try {
    const args = Array.isArray(paths) && paths.length
      ? ["reset", "HEAD", "--", ...paths]
      : ["reset", "HEAD"];
    await git(args, cwd);
    return { ok: true };
  } catch (err) {
    return { ok: false, stderr: err.message };
  }
});

ipcMain.handle("git-revert", async (_event, cwd, path, untracked) => {
  if (!cwd || !path) return { ok: false, stderr: "bad args" };
  try {
    if (untracked) {
      await git(["clean", "-fd", "--", path], cwd);
    } else {
      await git(["restore", "--staged", "--worktree", "--source=HEAD", "--", path], cwd);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, stderr: err.message };
  }
});

ipcMain.handle("git-ignore", async (_event, cwd, path) => {
  if (!cwd || !path) return { ok: false, stderr: "bad args" };
  try {
    const giPath = require("path").join(cwd, ".gitignore");
    let existing = "";
    if (fs.existsSync(giPath)) existing = fs.readFileSync(giPath, "utf8");
    const entry = path.replace(/\/+$/, "");
    const present = existing.split("\n").some((l) => l.trim() === entry || l.trim() === entry + "/");
    if (present) return { ok: true, alreadyIgnored: true };
    const sep = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    fs.writeFileSync(giPath, existing + sep + entry + "\n");
    return { ok: true };
  } catch (err) {
    return { ok: false, stderr: err.message };
  }
});

ipcMain.handle("git-commit", async (_event, cwd, message, coauthor) => {
  if (!cwd) return { ok: false, stderr: "no cwd" };
  if (!message || !message.trim()) return { ok: false, stderr: "empty message" };
  try {
    const staged = await git(["diff", "--cached", "--name-only"], cwd);
    if (!staged.trim()) await git(["add", "-A"], cwd);
    const trailer = typeof coauthor === "string" ? coauthor.trim() : "";
    const finalMessage = trailer && !message.includes(trailer)
      ? `${message.trimEnd()}\n\n${trailer}\n`
      : message;
    const stdout = await git(["commit", "-m", finalMessage], cwd);
    return { ok: true, stdout };
  } catch (err) {
    return { ok: false, stderr: err.message };
  }
});

ipcMain.handle("git-push", async (_event, cwd) => {
  if (!cwd) return { ok: false, stderr: "no cwd" };
  try {
    let args = ["push"];
    try {
      await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd);
    } catch {
      const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
      if (branch === "HEAD") return { ok: false, stderr: "detached HEAD; cannot push without a branch" };
      args = ["push", "-u", "origin", branch];
    }
    const stdout = await gitLong(args, cwd);
    return { ok: true, stdout };
  } catch (err) {
    return { ok: false, stderr: err.message };
  }
});

ipcMain.handle("git-pull", async (_event, cwd) => {
  if (!cwd) return { ok: false, stderr: "no cwd" };
  try {
    const stdout = await gitLong(["pull", "--ff-only"], cwd);
    return { ok: true, stdout };
  } catch (err) {
    return { ok: false, stderr: err.message };
  }
});

ipcMain.handle("git-pr-status", async (_event, cwd) => {
  if (!cwd) return { ok: false, stderr: "no cwd" };
  try {
    const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    if (branch === "HEAD") return { ok: true, branch: null, openPr: null };
    try {
      const openPr = await getCurrentBranchOpenPr(cwd, branch);
      return { ok: true, branch, openPr };
    } catch (err) {
      const msg = err.message || String(err);
      return { ok: false, stderr: msg };
    }
  } catch (err) {
    return { ok: false, stderr: err.message || String(err) };
  }
});

ipcMain.handle("git-create-pr", async (_event, cwd, base) => {
  if (!cwd) return { ok: false, stderr: "no cwd" };
  try {
    const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    if (branch === "HEAD") return { ok: false, stderr: "detached HEAD" };
    if (base && branch === base) return { ok: false, stderr: `already on base branch "${base}"` };
    const openPr = await getCurrentBranchOpenPr(cwd, branch);
    if (openPr) {
      return {
        ok: false,
        stderr: `Open PR #${openPr.number} already exists\n${openPr.url || ""}`.trim(),
      };
    }
    // Ensure upstream exists and is current.
    let pushArgs;
    try {
      await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd);
      pushArgs = ["push"];
    } catch {
      pushArgs = ["push", "-u", "origin", branch];
    }
    await gitLong(pushArgs, cwd);
    const ghArgs = ["pr", "create", "--fill"];
    if (base) ghArgs.push("--base", base);
    const stdout = await ghRepo(ghArgs, cwd, { timeout: 60000 });
    const urlMatch = stdout.match(/https?:\/\/\S+/);
    const url = urlMatch ? urlMatch[0] : null;
    return {
      ok: true,
      action: "created",
      number: extractPrNumber(url),
      url,
      stdout,
    };
  } catch (err) {
    const msg = err.message || String(err);
    const existing = msg.match(/https?:\/\/github\.com\/\S+\/pull\/\d+/);
    if (existing) {
      return {
        ok: false,
        stderr: `Open PR #${extractPrNumber(existing[0]) || "?"} already exists\n${existing[0]}`,
      };
    }
    return { ok: false, stderr: msg };
  }
});

ipcMain.handle("git-merge-pr", async (_event, cwd) => {
  if (!cwd) return { ok: false, stderr: "no cwd" };
  try {
    const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    if (branch === "HEAD") return { ok: false, stderr: "detached HEAD" };
    const merged = await mergeCurrentBranchOpenPr(cwd, branch);
    if (!merged?.openPr) return { ok: false, stderr: "No open upstream PR for this branch" };
    if (merged.result?.merged === false) {
      return { ok: false, stderr: merged.result.message || `Failed to merge PR #${merged.openPr.number}` };
    }
    return {
      ok: true,
      number: merged.openPr.number,
      url: merged.openPr.url,
      stdout: merged.result?.message || "Pull request merged",
    };
  } catch (err) {
    return { ok: false, stderr: err.message || String(err) };
  }
});

// IPC: generate commit message from staged diff via Claude (sonnet)
ipcMain.handle("git-gen-commit-message", async (_e, cwd) => {
  if (!cwd) return { ok: false, stderr: "no cwd" };
  try {
    // Prefer staged diff; fall back to full working diff if nothing staged.
    let diff = "";
    try { diff = await git(["diff", "--cached"], cwd); } catch {}
    if (!diff.trim()) {
      try { diff = await git(["diff", "HEAD"], cwd); } catch {}
    }
    if (!diff.trim()) {
      try {
        const untracked = await git(["ls-files", "--others", "--exclude-standard"], cwd);
        if (untracked.trim()) diff = `# Untracked files:\n${untracked}`;
      } catch {}
    }
    if (!diff.trim()) return { ok: false, stderr: "No changes to summarize" };

    const LIMIT = 48 * 1024;
    if (diff.length > LIMIT) diff = diff.slice(0, LIMIT);

    const claudeBin = resolveCliBin("claude", { envVarName: "CLAUDE_BIN" });
    if (!claudeBin) return { ok: false, stderr: "Unable to locate the Claude CLI binary" };

    const systemPrompt = "You write concise conventional git commit messages. Output ONLY the commit message — no quotes, no code fences, no preamble, no trailing commentary. Prefer a single subject line under 72 chars in the form 'type: summary' (type ∈ feat, fix, refactor, chore, docs, test, style, perf). Only include a body if genuinely useful, separated by one blank line.";
    const userPrompt = `Write a commit message for the following diff:\n\n${diff}`;

    const args = [
      "--print",
      "--output-format", "text",
      "--tools", "",
      "--model", "sonnet",
      "--no-session-persistence",
      "--system-prompt", systemPrompt,
      userPrompt,
    ];

    return await new Promise((resolve) => {
      const child = spawnCli(claudeBin, args, {
        cwd,
        env: { ...process.env, FORCE_COLOR: "0", PATH: buildSpawnPath() },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (c) => { out += c.toString(); });
      child.stderr.on("data", (c) => { err += c.toString(); });
      const timer = setTimeout(() => {
        try { child.kill(); } catch {}
        resolve({ ok: false, stderr: "Timed out generating commit message" });
      }, 45000);
      child.on("close", (code) => {
        clearTimeout(timer);
        const msg = out.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
        if (!msg) return resolve({ ok: false, stderr: err.trim() || `exit ${code}` });
        resolve({ ok: true, message: msg });
      });
      child.on("error", (e) => {
        clearTimeout(timer);
        resolve({ ok: false, stderr: e.message });
      });
    });
  } catch (err) {
    return { ok: false, stderr: err.message };
  }
});

// IPC: get repo name from cwd via git remote
ipcMain.handle("gh-get-repo-name", async (_e, cwd) => {
  const { execFile } = require("child_process");
  return new Promise((resolve) => {
    execFile("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], { cwd, timeout: 5000 }, (err, stdout) => {
      resolve(err ? null : stdout.trim());
    });
  });
});

// IPC: GitHub Project Manager
ipcMain.handle("gh-check-auth", () => ghManager.checkAuth());
ipcMain.handle("gh-list-auth-accounts", () => ghManager.listAuthAccounts());
ipcMain.handle("gh-switch-account", (_e, user) => ghManager.switchAccount(user));
ipcMain.handle("gh-list-user-repos", (_e, limit) => ghManager.listUserRepos(limit));
ipcMain.handle("gh-list-issues", (_e, repo, state) => ghManager.listIssues(repo, state));
ipcMain.handle("gh-list-prs", (_e, repo, state) => ghManager.listPRs(repo, state));
ipcMain.handle("gh-get-issue", (_e, repo, number) => ghManager.getIssue(repo, number));
ipcMain.handle("gh-get-pr", (_e, repo, number) => ghManager.getPR(repo, number));
ipcMain.handle("gh-list-comments", (_e, repo, number) => ghManager.listComments(repo, number));
ipcMain.handle("gh-add-comment", (_e, repo, number, body) => ghManager.addComment(repo, number, body));
ipcMain.handle("gh-list-collaborators", (_e, repo) => ghManager.listCollaborators(repo));
ipcMain.handle("gh-assign-issue", (_e, repo, number, assignees) => ghManager.assignIssue(repo, number, assignees));
ipcMain.handle("gh-unassign-issue", (_e, repo, number, assignees) => ghManager.unassignIssue(repo, number, assignees));
ipcMain.handle("gh-checkout-pr", (_e, repo, prNumber) => ghManager.checkoutPR(repo, prNumber));
ipcMain.handle("gh-close-issue", (_e, repo, number) => ghManager.closeIssue(repo, number));
ipcMain.handle("gh-merge-pr", (_e, repo, number) => ghManager.mergePR(repo, number));
ipcMain.handle("gh-reopen-issue", (_e, repo, number) => ghManager.reopenIssue(repo, number));
ipcMain.handle("gh-create-issue", (_e, repo, title, body) => ghManager.createIssue(repo, title, body));
ipcMain.handle("gh-create-pr", (_e, repo, title, body, head, base) => ghManager.createPR(repo, title, body, head, base));
ipcMain.handle("gh-list-branches", (_e, repo) => ghManager.listBranches(repo));
ipcMain.handle("gh-linked-prs", (_e, repo, number) => ghManager.getLinkedPRs(repo, number));
ipcMain.handle("gh-current-branch", () => ghManager.getCurrentBranch());
ipcMain.handle("gh-repo-default-branch", (_e, repo) => ghManager.getRepoDefaultBranch(repo));
ipcMain.handle("gh-upload-image", (_e, repo, base64Data, filename) => ghManager.uploadImage(repo, base64Data, filename));

// GitHub auth flow — streams events back to the requesting window.
ipcMain.handle("gh-auth-logout", () => ghManager.logout());
ipcMain.handle("gh-auth-start", (event) => {
  const sender = event.sender;
  ghManager.startWebAuth((payload) => {
    if (sender.isDestroyed()) return;
    sender.send("gh-auth-event", payload);
    // Auto-open the verification page in the default browser.
    if (payload.type === "browser" && payload.url) {
      shell.openExternal(payload.url);
    }
  });
  return { started: true };
});
ipcMain.handle("gh-auth-cancel", () => { ghManager.cancelWebAuth(); return true; });

ipcMain.handle("gh-load-pm-state", async () => {
  try {
    if (fs.existsSync(stateFilePath)) {
      const data = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
      return { repos: data.pmRepos || [], wallpaper: data.wallpaper || null };
    }
  } catch {}
  return { repos: [], wallpaper: null };
});

ipcMain.handle("gh-save-pm-state", async (_e, pmState) => {
  try {
    let data = {};
    if (fs.existsSync(stateFilePath)) {
      data = JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
    }
    data.pmRepos = pmState.repos || [];
    fs.writeFileSync(stateFilePath, JSON.stringify(data, null, 2));
    return true;
  } catch { return false; }
});

// IPC: clone a git repo (prefers `gh repo clone`, falls back to `git clone`)
function normalizeCloneUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) return s;
  s = s.replace(/\s+/g, "");
  s = s.replace(/\/+$/, "");
  return s;
}

function toGhOwnerRepo(url) {
  if (!url) return null;
  const m = url.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9][A-Za-z0-9-_.]*)\/([A-Za-z0-9][A-Za-z0-9-_.]*?)(?:\.git)?\/?$/i);
  if (m) return `${m[1]}/${m[2]}`;
  if (/^[A-Za-z0-9][A-Za-z0-9-_.]*\/[A-Za-z0-9][A-Za-z0-9-_.]*$/.test(url)) return url;
  return null;
}

function deriveRepoDirName(url) {
  const s = normalizeCloneUrl(url);
  if (!s) return null;
  const stripped = s.replace(/\.git$/i, "");
  const m = stripped.match(/([^/:\s]+)$/);
  return m ? m[1] : null;
}

ipcMain.handle("project-clone", async (_e, args = {}) => {
  const rawUrl = args?.url;
  const parentDir = args?.parentDir;
  if (!rawUrl || !parentDir) return { ok: false, stderr: "Missing url or parentDir" };
  if (!fs.existsSync(parentDir)) return { ok: false, stderr: `Parent directory does not exist: ${parentDir}` };
  const url = normalizeCloneUrl(rawUrl);
  const name = deriveRepoDirName(url);
  if (!name) return { ok: false, stderr: "Could not determine repo name from URL" };
  const destPath = path.join(parentDir, name);
  if (fs.existsSync(destPath)) {
    return { ok: false, stderr: `Destination already exists: ${destPath}` };
  }
  const { execFile } = require("child_process");
  const env = { ...process.env, PATH: buildSpawnPath() };
  const ghOwnerRepo = toGhOwnerRepo(url);
  const run = (bin, cliArgs) => new Promise((resolve) => {
    execFile(bin, cliArgs, { cwd: parentDir, env, timeout: 300000 }, (err, stdout, stderr) => {
      const errText = (stderr || (err && err.message) || "").toString().trim();
      if (err) resolve({ ok: false, stderr: errText });
      else resolve({ ok: true, stdout: (stdout || "").toString() });
    });
  });
  let result;
  if (ghOwnerRepo) {
    result = await run("gh", ["repo", "clone", ghOwnerRepo, destPath]);
    if (!result.ok) {
      const fallback = await run("git", ["clone", url, destPath]);
      if (fallback.ok) result = fallback;
      else result = { ok: false, stderr: `gh: ${result.stderr}\ngit: ${fallback.stderr}` };
    }
  } else {
    result = await run("git", ["clone", url, destPath]);
  }
  if (!result.ok) return { ok: false, stderr: result.stderr };
  return { ok: true, path: destPath };
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
  cancelAllCodex();
  terminalManager.stopServer();
});
