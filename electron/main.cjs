const { app, BrowserWindow, ipcMain, dialog, nativeImage, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { startAgent, cancelAgent, cancelAll, rewindFiles } = require("./agent-manager.cjs");
const { startCodexAgent, cancelCodexAgent, cancelAllCodex } = require("./codex-agent-manager.cjs");
const { listSessions, loadSessionMessages, moveSession } = require("./session-reader.cjs");
const { createCheckpoint, restoreCheckpoint } = require("./checkpoint.cjs");
const terminalManager = require("./terminal-manager.cjs");
const ghManager = require("./github-manager.cjs");

const isDev = !app.isPackaged;
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
let pmWindow;

function getWallpaperStorageDir() {
  const dir = path.join(app.getPath("userData"), "wallpapers");
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
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#000000",
    icon: path.join(__dirname, "../public/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload-pm.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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
    global.terminalWsPort = port;
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

ipcMain.on("open-project-manager", () => {
  createProjectManagerWindow();
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
  if (opts.provider === "codex") {
    startCodexAgent(opts, event.sender);
  } else {
    startAgent(opts, event.sender);
  }
});

ipcMain.on("agent-cancel", (_event, { conversationId }) => {
  cancelAgent(conversationId);
  cancelCodexAgent(conversationId);
});

ipcMain.on("agent-edit-resend", (event, opts) => {
  if (opts.provider === "codex") {
    startCodexAgent({ ...opts, resumeSessionId: opts.resumeSessionId }, event.sender);
  } else {
    startAgent({ ...opts, forkSession: true }, event.sender);
  }
});

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

ipcMain.handle("save-state", async (_event, state) => {
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
      "--model", model || "sonnet",
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

ipcMain.handle("git-worktree-add", async (_event, cwd, worktreePath, branchName) => {
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
  await git(["worktree", "add", worktreePath, "-b", branchName], cwd);
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

// IPC: GitHub Project Manager
ipcMain.handle("gh-check-auth", () => ghManager.checkAuth());
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
