"use strict";

const {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  screen,
  shell,
  systemPreferences,
} = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { startAgent, cancelAgent } = require("./agent-manager.cjs");
const { startCodexAgent, cancelCodexAgent } = require("./codex-agent-manager.cjs");
const { startOpenCodeAgent, cancelOpenCodeAgent } = require("./opencode-agent-manager.cjs");
const { resolveCliBin } = require("./cli-bin-resolver.cjs");
const { resolveOpenCodeBin } = require("./opencode-agent-manager.cjs");
const { createLogger } = require("./logger.cjs");

const DEFAULT_SHORTCUT = "CommandOrControl+Shift+Space";
const WINDOW_WIDTH = 560;
const WINDOW_HEIGHT = 420;
const MIN_WIDTH = 420;
const MIN_HEIGHT = 320;

const BUILTIN_MODELS = {
  opus: { id: "opus", label: "Claude Opus", provider: "claude", cliFlag: "opus" },
  "opus-1m": { id: "opus-1m", label: "Claude Opus (1M)", provider: "claude", cliFlag: "opus[1m]" },
  sonnet: { id: "sonnet", label: "Claude Sonnet", provider: "claude", cliFlag: "sonnet" },
  "gpt55-med": { id: "gpt55-med", label: "GPT-5.5", provider: "codex", cliFlag: "gpt-5.5", effort: "medium" },
  "gpt55-high": { id: "gpt55-high", label: "GPT-5.5 high", provider: "codex", cliFlag: "gpt-5.5", effort: "high" },
  "gpt55-xhigh": { id: "gpt55-xhigh", label: "GPT-5.5 xhigh", provider: "codex", cliFlag: "gpt-5.5", effort: "xhigh" },
  "gpt54-med": { id: "gpt54-med", label: "GPT-5.4", provider: "codex", cliFlag: "gpt-5.4", effort: "medium" },
  "gpt54-high": { id: "gpt54-high", label: "GPT-5.4 high", provider: "codex", cliFlag: "gpt-5.4", effort: "high" },
  "gpt54-xhigh": { id: "gpt54-xhigh", label: "GPT-5.4 xhigh", provider: "codex", cliFlag: "gpt-5.4", effort: "xhigh" },
};

function normalizeShortcut(shortcut) {
  const value = String(shortcut || "").trim();
  return value || DEFAULT_SHORTCUT;
}

function providerRuntimeName(provider) {
  if (provider === "codex") return "Codex";
  if (provider === "opencode") return "OpenCode";
  return "Claude Code";
}

function parseOpenCodeModelId(id) {
  if (typeof id !== "string" || !id.startsWith("opencode:")) return null;
  const value = id.slice("opencode:".length).trim();
  const slashIndex = value.indexOf("/");
  if (slashIndex <= 0 || slashIndex >= value.length - 1) return null;
  return {
    id,
    label: `OpenCode ${value}`,
    provider: "opencode",
    cliFlag: value,
    providerId: value.slice(0, slashIndex),
    modelId: value.slice(slashIndex + 1),
  };
}

function getActiveModelId(state) {
  const activeId = typeof state?.active === "string" ? state.active : "";
  const activeConversation = Array.isArray(state?.convos)
    ? state.convos.find((conversation) => conversation?.id === activeId)
    : null;
  return activeConversation?.model || state?.defaultModel || "sonnet";
}

function resolveModel(state) {
  const modelId = getActiveModelId(state);
  const openCodeModel = parseOpenCodeModelId(modelId);
  if (openCodeModel) return openCodeModel;
  if (typeof modelId === "string" && modelId.startsWith("multica:")) {
    return {
      id: modelId,
      label: "Multica agent",
      provider: "multica",
      cliFlag: modelId,
      unsupported: true,
    };
  }
  return BUILTIN_MODELS[modelId] || BUILTIN_MODELS.sonnet;
}

function getCliInstalledSnapshot() {
  return {
    claude: Boolean(resolveCliBin("claude", { envVarName: "CLAUDE_BIN" })),
    codex: Boolean(resolveCliBin("codex", { envVarName: "CODEX_BIN" })),
    opencode: Boolean(resolveOpenCodeBin()),
  };
}

function buildRuntime(state) {
  const model = resolveModel(state);
  const installed = getCliInstalledSnapshot();
  const available =
    model.provider === "claude" ? installed.claude :
    model.provider === "codex" ? installed.codex :
    model.provider === "opencode" ? installed.opencode :
    false;

  const unavailableReason = model.unsupported
    ? "Quick Q supports Claude Code, Codex, and OpenCode runtimes in v1."
    : `Quick Q needs ${providerRuntimeName(model.provider)} installed for the current model.`;

  return {
    ...model,
    runtimeName: providerRuntimeName(model.provider),
    displayLabel: `${model.label} via ${providerRuntimeName(model.provider)}`,
    installed,
    available,
    unavailableReason: available ? "" : unavailableReason,
  };
}

function isMacScreenPermissionDenied(status) {
  return status === "denied" || status === "restricted";
}

function getScreenPermissionStatus() {
  if (process.platform !== "darwin") return "granted";
  try {
    return systemPreferences.getMediaAccessStatus("screen");
  } catch {
    return "unknown";
  }
}

function displayBoundsForWindow(display) {
  const area = display?.workArea || display?.bounds || { x: 0, y: 0, width: WINDOW_WIDTH, height: WINDOW_HEIGHT };
  return {
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: Math.round(area.x + Math.max(0, (area.width - WINDOW_WIDTH) / 2)),
    y: Math.round(area.y + Math.max(0, (area.height - WINDOW_HEIGHT) / 2)),
  };
}

function makeConversationId() {
  return `quick-q-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function serializeState(state) {
  if (!state) return null;
  return {
    invocationId: state.invocationId,
    conversationId: state.conversationId,
    screenshotDataUrl: state.screenshotDataUrl || null,
    captureError: state.captureError || "",
    permissionStatus: state.permissionStatus || "unknown",
    runtime: state.runtime,
    cwd: state.cwd,
    shortcut: state.shortcut,
    shortcutStatus: state.shortcutStatus,
  };
}

function createQuickQManager({
  isDev,
  getVitePort,
  getMainWindow,
  getPersistedState,
} = {}) {
  const log = createLogger("quick-q");
  let quickWindow = null;
  let currentState = null;
  let configuredShortcut = DEFAULT_SHORTCUT;
  let registeredShortcut = "";
  let shortcutStatus = {
    shortcut: DEFAULT_SHORTCUT,
    registered: false,
    error: "Shortcut has not been registered yet.",
  };

  function getScratchDir() {
    const dir = path.join(app.getPath("userData"), "quick-q");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function sendToQuickWindow(channel, payload) {
    if (!quickWindow || quickWindow.isDestroyed()) return;
    quickWindow.webContents.send(channel, payload);
  }

  function broadcastShortcutStatus() {
    const payload = { ...shortcutStatus };
    const mainWindow = getMainWindow?.();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("quick-q-shortcut-status", payload);
    }
    sendToQuickWindow("quick-q-shortcut-status", payload);
  }

  function notifyMainWindow(payload) {
    const mainWindow = getMainWindow?.();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("quick-q-notice", payload);
  }

  function getConfiguredShortcutFromState(state = getPersistedState?.()) {
    return normalizeShortcut(state?.quickQShortcut || configuredShortcut || DEFAULT_SHORTCUT);
  }

  function unregisterCurrentShortcut() {
    if (!registeredShortcut) return;
    try {
      globalShortcut.unregister(registeredShortcut);
    } catch (error) {
      log("Failed to unregister shortcut:", error.message);
    }
    registeredShortcut = "";
  }

  function registerShortcut(shortcut = getConfiguredShortcutFromState()) {
    configuredShortcut = normalizeShortcut(shortcut);
    unregisterCurrentShortcut();

    if (!app.isReady()) {
      shortcutStatus = {
        shortcut: configuredShortcut,
        registered: false,
        error: "App is not ready.",
      };
      return shortcutStatus;
    }

    let registered = false;
    try {
      registered = globalShortcut.register(configuredShortcut, () => {
        fire().catch((error) => {
          log("Quick Q fire failed:", error?.message || error);
        });
      });
    } catch (error) {
      shortcutStatus = {
        shortcut: configuredShortcut,
        registered: false,
        error: error.message || "Shortcut registration failed.",
      };
      broadcastShortcutStatus();
      return shortcutStatus;
    }

    registeredShortcut = registered ? configuredShortcut : "";
    shortcutStatus = {
      shortcut: configuredShortcut,
      registered,
      error: registered ? "" : "Couldn't register shortcut. Try a different combo.",
    };
    broadcastShortcutStatus();
    log("Shortcut registration:", shortcutStatus);
    return shortcutStatus;
  }

  function syncShortcutFromState(state) {
    const nextShortcut = getConfiguredShortcutFromState(state);
    if (nextShortcut === configuredShortcut && shortcutStatus.shortcut === nextShortcut) {
      return shortcutStatus;
    }
    return registerShortcut(nextShortcut);
  }

  function unregisterShortcut() {
    unregisterCurrentShortcut();
  }

  async function captureDisplay(display) {
    const permissionStatus = getScreenPermissionStatus();
    if (isMacScreenPermissionDenied(permissionStatus)) {
      return {
        dataUrl: null,
        permissionStatus,
        error: "screen-permission-denied",
      };
    }

    const scaleFactor = Number(display?.scaleFactor) || 1;
    const sourceSize = display?.size || display?.bounds || { width: 1440, height: 900 };
    const thumbnailSize = {
      width: Math.max(1, Math.round(sourceSize.width * scaleFactor)),
      height: Math.max(1, Math.round(sourceSize.height * scaleFactor)),
    };

    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize,
        fetchWindowIcons: false,
      });
      const source = sources.find((item) => String(item.display_id) === String(display?.id))
        || sources.find((item) => item.thumbnail && !item.thumbnail.isEmpty())
        || sources[0];
      const thumbnail = source?.thumbnail;
      if (!thumbnail || thumbnail.isEmpty()) {
        return {
          dataUrl: null,
          permissionStatus,
          error: "capture-empty",
        };
      }
      return {
        dataUrl: thumbnail.toDataURL(),
        permissionStatus,
        error: "",
      };
    } catch (error) {
      log("Capture failed:", error?.message || error);
      return {
        dataUrl: null,
        permissionStatus,
        error: error?.message || "capture-failed",
      };
    }
  }

  async function buildInvocationState(display) {
    const runtime = buildRuntime(getPersistedState?.());
    const capture = await captureDisplay(display);
    return {
      invocationId: crypto.randomUUID(),
      conversationId: makeConversationId(),
      screenshotDataUrl: capture.dataUrl,
      captureError: capture.error,
      permissionStatus: capture.permissionStatus,
      runtime,
      cwd: getScratchDir(),
      shortcut: configuredShortcut,
      shortcutStatus,
    };
  }

  function createWindow(display) {
    if (quickWindow && !quickWindow.isDestroyed()) return quickWindow;

    quickWindow = new BrowserWindow({
      title: "Quick Q",
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      x: displayBoundsForWindow(display).x,
      y: displayBoundsForWindow(display).y,
      show: false,
      frame: false,
      transparent: true,
      resizable: true,
      roundedCorners: true,
      hasShadow: true,
      alwaysOnTop: false,
      backgroundColor: "#00000000",
      icon: path.join(__dirname, "../public/icon.png"),
      webPreferences: {
        preload: path.join(__dirname, "preload-quick-q.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    quickWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });

    quickWindow.webContents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      const closeRequested =
        input.key === "Escape" ||
        ((input.meta || input.control) && String(input.key || "").toLowerCase() === "w");
      if (closeRequested) {
        event.preventDefault();
        quickWindow?.close();
      }
    });

    quickWindow.on("closed", () => {
      cancelCurrentAgent();
      quickWindow = null;
      currentState = null;
    });

    if (isDev) {
      const port = getVitePort?.() || process.env.VITE_PORT || "5173";
      quickWindow.loadURL(`http://localhost:${port}/src/quick-q.html`);
    } else {
      quickWindow.loadFile(path.join(__dirname, "../dist/src/quick-q.html"));
    }

    return quickWindow;
  }

  function revealWindow(win, display) {
    const bounds = displayBoundsForWindow(display);
    win.setBounds(bounds);
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  }

  function sendResetWhenReady(win) {
    const payload = serializeState(currentState);
    const send = () => {
      if (!win || win.isDestroyed()) return;
      win.webContents.send("quick-q-reset", payload);
    };

    if (win.webContents.isLoading()) {
      win.webContents.once("did-finish-load", send);
    } else {
      send();
    }
  }

  async function fire() {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const runtime = buildRuntime(getPersistedState?.());
    if (!runtime.available) {
      notifyMainWindow({
        type: "runtime-unavailable",
        message: runtime.unavailableReason || "Quick Q needs a local runtime before it can start.",
      });
      return { ok: false, error: runtime.unavailableReason };
    }

    cancelCurrentAgent();
    currentState = await buildInvocationState(display);

    const win = createWindow(display);
    revealWindow(win, display);
    sendResetWhenReady(win);
    return { ok: true };
  }

  async function retakeScreenshot() {
    if (!currentState) return null;
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const capture = await captureDisplay(display);
    currentState = {
      ...currentState,
      screenshotDataUrl: capture.dataUrl,
      captureError: capture.error,
      permissionStatus: capture.permissionStatus,
    };
    return {
      screenshotDataUrl: capture.dataUrl,
      captureError: capture.error,
      permissionStatus: capture.permissionStatus,
    };
  }

  function cancelCurrentAgent() {
    const conversationId = currentState?.conversationId;
    if (!conversationId) return;
    cancelAgent(conversationId);
    cancelCodexAgent(conversationId);
    cancelOpenCodeAgent(conversationId);
  }

  function startQuickAgent(event, opts = {}) {
    if (!currentState || event.sender !== quickWindow?.webContents) return;
    if (opts.conversationId !== currentState.conversationId) return;
    if (!currentState.runtime?.available) {
      event.sender.send("agent-error", {
        conversationId: opts.conversationId,
        error: currentState.runtime?.unavailableReason || "Runtime unavailable.",
      });
      event.sender.send("agent-done", { conversationId: opts.conversationId, exitCode: -1 });
      return;
    }

    const runtime = currentState.runtime;
    const payload = {
      ...opts,
      conversationId: currentState.conversationId,
      cwd: getScratchDir(),
      projectContext: "",
      provider: runtime.provider,
      model: runtime.cliFlag,
      effort: runtime.effort,
      thinking: typeof opts.thinking === "boolean" ? opts.thinking : runtime.thinking,
    };

    if (runtime.provider === "codex") {
      startCodexAgent(payload, event.sender);
    } else if (runtime.provider === "opencode") {
      startOpenCodeAgent(payload, event.sender);
    } else {
      startAgent(payload, event.sender);
    }
  }

  function registerIpc() {
    ipcMain.handle("quick-q-state", () => serializeState(currentState));
    ipcMain.handle("quick-q-retake-screenshot", () => retakeScreenshot());
    ipcMain.handle("quick-q-screen-permission-status", () => getScreenPermissionStatus());
    ipcMain.handle("quick-q-open-screen-settings", () => {
      if (process.platform === "darwin") {
        shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
        return true;
      }
      return false;
    });
    ipcMain.handle("quick-q-close", (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return false;
      win.close();
      return true;
    });
    ipcMain.handle("quick-q-set-shortcut", (_event, shortcut) => registerShortcut(shortcut));
    ipcMain.handle("quick-q-shortcut-status", () => ({ ...shortcutStatus }));
    ipcMain.on("quick-q-agent-start", startQuickAgent);
    ipcMain.on("quick-q-agent-cancel", (_event, { conversationId } = {}) => {
      if (!conversationId || conversationId !== currentState?.conversationId) return;
      cancelCurrentAgent();
    });
  }

  function openFromMainForDebug() {
    return fire();
  }

  return {
    DEFAULT_SHORTCUT,
    fire,
    openFromMainForDebug,
    registerIpc,
    registerShortcut,
    syncShortcutFromState,
    unregisterShortcut,
    getShortcutStatus: () => ({ ...shortcutStatus }),
  };
}

module.exports = {
  DEFAULT_SHORTCUT,
  createQuickQManager,
};
