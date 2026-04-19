import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import AuroraCanvas from "./components/AuroraCanvas";
import Grain        from "./components/Grain";
import Sidebar      from "./components/Sidebar";
import ChatArea     from "./components/ChatArea";
import useAgent     from "./hooks/useAgent";
import useTerminal  from "./hooks/useTerminal";
import TerminalDrawer from "./components/TerminalDrawer";
import Settings     from "./components/Settings";
import { DEFAULT_MODEL_ID, getM, normalizeModelId } from "./data/models";
import { buildConversationPrime, buildCrossProviderPrime, decoratePromptWithPrime } from "./utils/crossProviderPrime";
import { FontSizeContext } from "./contexts/FontSizeContext";
import { getPaneSurfaceStyle } from "./utils/paneSurface";
import { DEFAULT_WALLPAPER, getPersistedWallpaper, getWallpaperImageFilter, normalizeWallpaper } from "./utils/wallpaper";

function logCheckpoint(...args) {
  console.log("[checkpoint-ui]", ...args);
}

function logSendFlow(...args) {
  console.log("[send-flow]", ...args);
}

const SHELL_TRANSCRIPT_LIMIT = 12000;
const SHELL_TERMINAL_TIMEOUT_MS = 15000;
const LAB_CONTROL_ENDPOINT = "http://127.0.0.1:4001/control";
const LAB_CONTROL_COMMIT_DELAY_MS = 1000;
const DEFAULT_SIDEBAR_ACTIVE_OPACITY = 4;

function logSessionState(...args) {
  console.log("[session-state]", ...args);
}

function getMainRepoRoot(dir) {
  if (!dir) return dir;
  const wtIdx = dir.indexOf("/.worktrees/");
  return wtIdx !== -1 ? dir.slice(0, wtIdx) : dir;
}

function getEffectiveConversationCwd(conversation, appCwd, draftsPath) {
  const convoCwd = conversation?.cwd;
  if (convoCwd === null) return draftsPath || undefined;
  if (convoCwd !== undefined) return convoCwd || undefined;
  return appCwd || undefined;
}

function truncateShellText(text) {
  if (!text) return "";
  if (text.length <= SHELL_TRANSCRIPT_LIMIT) return text;
  const remaining = text.length - SHELL_TRANSCRIPT_LIMIT;
  return `${text.slice(0, SHELL_TRANSCRIPT_LIMIT)}\n\n[output truncated: ${remaining} more characters]`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deriveConversationTitle(text, attachments) {
  const trimmed = (text || "").trim();
  if (trimmed) return trimmed.slice(0, 50);
  const list = Array.isArray(attachments) ? attachments : [];
  if (list.length) {
    const first = list[0];
    const name = first?.name || (first?.type === "image" ? "Image" : "Attachment");
    const extra = list.length > 1 ? ` +${list.length - 1}` : "";
    return `${name}${extra}`.slice(0, 50);
  }
  return "New chat";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function stripAnsi(text) {
  const esc = String.fromCharCode(27);
  return text.replace(new RegExp(`${esc}(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])`, "g"), "");
}

function cleanTerminalShellOutput(text, marker) {
  if (!text) return "";

  const markerPattern = new RegExp(`^${escapeRegExp(marker)}:\\d+$`);
  const helperPatterns = [
    /^__claudi_exit_code=\$\?$/,
    /^printf ['"].*__CLAUDI_SHELL_EXIT__.*$/,
  ];

  return stripAnsi(text)
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (markerPattern.test(trimmed)) return false;
      return !helperPatterns.some((pattern) => pattern.test(trimmed));
    })
    .join("\n")
    .trim();
}

function postLabControlUpdate(target, value) {
  return fetch(LAB_CONTROL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ target, value }),
  });
}

async function runShellViaTerminalApi({ command, cwd }) {
  if (!window.api?.terminalCreate || !window.api?.terminalSend || !window.api?.terminalRead || !window.api?.terminalKill) {
    return {
      ok: false,
      command,
      cwd,
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      truncated: false,
      error: "Terminal session APIs are not available.",
    };
  }

  const sessionName = `shell-run-${Date.now()}`;
  const marker = `__CLAUDI_SHELL_EXIT__${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + SHELL_TERMINAL_TIMEOUT_MS;

  const createResult = await window.api.terminalCreate({ name: sessionName, cwd });
  if (createResult?.error) {
    return {
      ok: false,
      command,
      cwd,
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      truncated: false,
      error: createResult.error,
    };
  }

  const sendInput = async (text) => {
    const result = await window.api.terminalSend({ name: sessionName, text });
    if (result?.error) throw new Error(result.error);
  };

  try {
    await sendInput(`${command}\n`);
    await sendInput("__claudi_exit_code=$?\n");
    await sendInput(`printf '${marker}:%s\\n' "$__claudi_exit_code"\n`);

    let rawOutput = "";
    let exitCode = null;

    while (Date.now() < deadline) {
      const readResult = await window.api.terminalRead({ name: sessionName, lines: 400 });
      if (readResult?.error) throw new Error(readResult.error);

      rawOutput = (readResult?.lines || []).join("\n");
      const match = rawOutput.match(new RegExp(`${escapeRegExp(marker)}:(\\d+)`));
      if (match) {
        exitCode = Number(match[1]);
        break;
      }

      await sleep(120);
    }

    const output = cleanTerminalShellOutput(rawOutput, marker);

    if (exitCode == null) {
      return {
        ok: true,
        command,
        cwd,
        stdout: output,
        stderr: "",
        exitCode: null,
        timedOut: true,
        truncated: false,
      };
    }

    return {
      ok: true,
      command,
      cwd,
      stdout: output,
      stderr: "",
      exitCode,
      timedOut: false,
      truncated: false,
    };
  } catch (error) {
    return {
      ok: false,
      command,
      cwd,
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      truncated: false,
      error: error.message || String(error),
    };
  } finally {
    try {
      await window.api.terminalKill({ name: sessionName });
    } catch (error) {
      console.warn("[shell-fallback] terminal kill failed:", error);
    }
  }
}

function formatShellResult(result) {
  const fence = "````";

  if (!result.ok) {
    return `${fence}text\n${result.error || "Unknown error"}\n${fence}`;
  }

  const stdout = truncateShellText(result.stdout || "");
  const stderr = truncateShellText(result.stderr || "");
  const sections = [];

  if (stdout) {
    sections.push(`${fence}text\n${stdout}\n${fence}`);
  }

  if (stderr) {
    if (stdout) sections.push("");
    sections.push(`${fence}text\n${stderr}\n${fence}`);
  }

  if (!stdout && !stderr) {
    sections.push(`${fence}text\n(no output)\n${fence}`);
  }

  return sections.join("\n");
}

function normalizeProjectsMeta(projectsMeta) {
  const normalized = {};
  const entries = Object.entries(projectsMeta || {}).sort(([a], [b]) => {
    const aIsRoot = a === getMainRepoRoot(a);
    const bIsRoot = b === getMainRepoRoot(b);
    return Number(aIsRoot) - Number(bIsRoot);
  });

  for (const [path, meta] of entries) {
    const root = getMainRepoRoot(path);
    if (!root) continue;
    const prev = normalized[root] || {};
    normalized[root] = {
      ...prev,
      ...meta,
      name: path === root ? (meta.name || root.split("/").pop()) : (prev.name || root.split("/").pop()),
      manual: Boolean(prev.manual || meta.manual),
    };
  }

  return normalized;
}

function extractLoadedSessionMeta(result) {
  const msgs = result?.messages || result;
  return {
    msgs: Array.isArray(msgs) ? msgs : [],
    sessionCwd: result?.cwd || null,
    sessionProvider: result?.provider || null,
  };
}

function makeSessionLedgerId(provider = "unknown") {
  return `session-${provider}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sortConversationSessions(sessions) {
  return [...(sessions || [])].sort((a, b) => {
    const updatedDiff = (b.updatedAt || 0) - (a.updatedAt || 0);
    if (updatedDiff !== 0) return updatedDiff;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

function createConversationSession({
  id,
  provider,
  nativeSessionId = null,
  model = null,
  syncedThroughMessageCount = 0,
  createdAt,
  updatedAt,
  origin = "unknown",
} = {}) {
  const now = Date.now();
  const created = Number.isFinite(createdAt) ? createdAt : now;
  return {
    id: id || makeSessionLedgerId(provider),
    provider: provider || null,
    nativeSessionId: nativeSessionId || null,
    model: model || null,
    syncedThroughMessageCount: Number.isFinite(syncedThroughMessageCount)
      ? syncedThroughMessageCount
      : 0,
    createdAt: created,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : created,
    origin,
  };
}

function normalizeConversationSession(session, archivedMessageCount = 0) {
  if (!session?.provider) return null;
  return createConversationSession({
    ...session,
    syncedThroughMessageCount:
      Number.isFinite(session.syncedThroughMessageCount)
        ? session.syncedThroughMessageCount
        : archivedMessageCount,
  });
}

function buildProviderSessionLookup(sessions) {
  const providerSessions = {};
  for (const session of sortConversationSessions(sessions)) {
    if (!session.provider || !session.nativeSessionId || providerSessions[session.provider]) continue;
    providerSessions[session.provider] = session.nativeSessionId;
  }
  return providerSessions;
}

function normalizeConversationState(conversation) {
  if (!conversation) return conversation;

  const archivedMessages = Array.isArray(conversation.archivedMessages)
    ? conversation.archivedMessages
    : [];
  const archivedMessageCount = archivedMessages.length;
  const sessionMap = new Map();

  for (const rawSession of Array.isArray(conversation.sessions) ? conversation.sessions : []) {
    const session = normalizeConversationSession(rawSession, archivedMessageCount);
    if (!session) continue;
    const key = session.nativeSessionId
      ? `${session.provider}:${session.nativeSessionId}`
      : `id:${session.id}`;
    const existing = sessionMap.get(key);
    if (!existing || (session.updatedAt || 0) >= (existing.updatedAt || 0)) {
      sessionMap.set(key, session);
    }
  }

  const legacyProviderSessions = { ...(conversation.providerSessions || {}) };
  if (conversation.sessionId && conversation.sessionProvider && !legacyProviderSessions[conversation.sessionProvider]) {
    legacyProviderSessions[conversation.sessionProvider] = conversation.sessionId;
  }

  for (const [provider, nativeSessionId] of Object.entries(legacyProviderSessions)) {
    if (!provider || !nativeSessionId) continue;
    const key = `${provider}:${nativeSessionId}`;
    if (!sessionMap.has(key)) {
      sessionMap.set(
        key,
        createConversationSession({
          provider,
          nativeSessionId,
          model: conversation.model || null,
          syncedThroughMessageCount: archivedMessageCount,
          createdAt: conversation.ts,
          updatedAt: conversation.ts,
          origin: "legacy",
        })
      );
    }
  }

  if (conversation.sessionId && !conversation.sessionProvider) {
    const fallbackProvider = conversation.lastProvider || conversation.provider || null;
    if (fallbackProvider) {
      const key = `${fallbackProvider}:${conversation.sessionId}`;
      if (!sessionMap.has(key)) {
        sessionMap.set(
          key,
          createConversationSession({
            provider: fallbackProvider,
            nativeSessionId: conversation.sessionId,
            model: conversation.model || null,
            syncedThroughMessageCount: archivedMessageCount,
            createdAt: conversation.ts,
            updatedAt: conversation.ts,
            origin: "legacy-primary",
          })
        );
      }
    }
  }

  const sessions = sortConversationSessions([...sessionMap.values()]);
  let activeSession = sessions.find((session) => session.id === conversation.activeSessionId) || null;

  if (!activeSession && conversation.sessionId) {
    activeSession =
      sessions.find((session) => session.nativeSessionId === conversation.sessionId) || null;
  }
  if (!activeSession && conversation.lastProvider) {
    activeSession =
      sessions.find((session) => session.provider === conversation.lastProvider) || null;
  }
  if (!activeSession) {
    activeSession = sessions[0] || null;
  }

  return {
    ...conversation,
    archivedMessages,
    sessions,
    activeSessionId: activeSession?.id || null,
    providerSessions: buildProviderSessionLookup(sessions),
    sessionId: activeSession?.nativeSessionId || null,
    sessionProvider: activeSession?.provider || null,
    lastProvider:
      conversation.lastProvider ||
      (archivedMessageCount > 0 ? activeSession?.provider || undefined : undefined),
  };
}

function getConversationSessions(conversation) {
  return sortConversationSessions(conversation?.sessions || []);
}

function getActiveConversationSession(conversation) {
  if (!conversation) return null;
  return (
    getConversationSessions(conversation).find((session) => session.id === conversation.activeSessionId) ||
    null
  );
}

function getLatestSessionForProvider(conversation, provider, { requireNative = false } = {}) {
  if (!conversation || !provider) return null;
  return (
    getConversationSessions(conversation).find(
      (session) =>
        session.provider === provider && (!requireNative || Boolean(session.nativeSessionId))
    ) || null
  );
}

function getPreferredLoadSessionId(conversation) {
  if (!conversation) return null;
  const activeSession = getActiveConversationSession(conversation);
  if (activeSession?.nativeSessionId) return activeSession.nativeSessionId;

  const lastProviderSession = conversation.lastProvider
    ? getLatestSessionForProvider(conversation, conversation.lastProvider, { requireNative: true })
    : null;
  if (lastProviderSession?.nativeSessionId) return lastProviderSession.nativeSessionId;

  return getConversationSessions(conversation).find((session) => session.nativeSessionId)?.nativeSessionId || null;
}

function getStoredConversationMessageCount(conversation) {
  if (!conversation) return 0;

  const archivedMessageCount = Array.isArray(conversation.archivedMessages)
    ? conversation.archivedMessages.length
    : 0;
  const syncedMessageCount = Array.isArray(conversation.sessions)
    ? conversation.sessions.reduce(
        (max, session) => Math.max(max, session?.syncedThroughMessageCount || 0),
        0
      )
    : 0;

  return Math.max(archivedMessageCount, syncedMessageCount);
}

function hasConversationMessages(conversation, conversationData) {
  const liveMessageCount = Array.isArray(conversationData?.messages)
    ? conversationData.messages.length
    : 0;
  return Math.max(getStoredConversationMessageCount(conversation), liveMessageCount) > 0;
}

function upsertConversationSession(
  conversation,
  sessionInput,
  {
    activate = true,
    preferPendingActive = false,
    lastProvider,
  } = {}
) {
  if (!conversation || !sessionInput?.provider) return normalizeConversationState(conversation);

  const current = normalizeConversationState(conversation);
  const sessions = [...getConversationSessions(current)];
  const candidate = normalizeConversationSession(sessionInput, current.archivedMessages?.length || 0);
  if (!candidate) return current;

  let matchIndex = -1;
  if (candidate.id) {
    matchIndex = sessions.findIndex((session) => session.id === candidate.id);
  }
  if (matchIndex === -1 && candidate.nativeSessionId) {
    matchIndex = sessions.findIndex(
      (session) =>
        session.provider === candidate.provider &&
        session.nativeSessionId === candidate.nativeSessionId
    );
  }
  if (matchIndex === -1 && preferPendingActive) {
    const activeSession = getActiveConversationSession(current);
    matchIndex = sessions.findIndex(
      (session) =>
        session.id === activeSession?.id &&
        session.provider === candidate.provider &&
        !session.nativeSessionId
    );
  }

  let activeSessionId = current.activeSessionId || null;
  if (matchIndex >= 0) {
    const existing = sessions[matchIndex];
    const merged = createConversationSession({
      ...existing,
      ...candidate,
      id: existing.id,
      provider: candidate.provider || existing.provider,
      nativeSessionId: candidate.nativeSessionId || existing.nativeSessionId,
      model: candidate.model || existing.model,
      syncedThroughMessageCount: Math.max(
        existing.syncedThroughMessageCount || 0,
        candidate.syncedThroughMessageCount || 0
      ),
      createdAt: existing.createdAt,
      updatedAt: Math.max(existing.updatedAt || 0, candidate.updatedAt || 0, Date.now()),
      origin: candidate.origin || existing.origin,
    });
    sessions[matchIndex] = merged;
    if (activate) activeSessionId = merged.id;
  } else {
    const created = createConversationSession(candidate);
    sessions.unshift(created);
    if (activate) activeSessionId = created.id;
  }

  return normalizeConversationState({
    ...current,
    sessions,
    activeSessionId,
    ...(lastProvider ? { lastProvider } : {}),
  });
}

function markConversationSessionSynced(conversation, sessionId, syncedThroughMessageCount) {
  if (!conversation || !sessionId || !Number.isFinite(syncedThroughMessageCount)) {
    return normalizeConversationState(conversation);
  }

  return normalizeConversationState({
    ...conversation,
    sessions: getConversationSessions(conversation).map((session) =>
      session.id === sessionId
        ? {
            ...session,
            syncedThroughMessageCount,
            updatedAt: Date.now(),
          }
        : session
    ),
  });
}

function createSeedSession(conversation, provider, { model, syncedThroughMessageCount = 0, origin = "fresh" } = {}) {
  return createConversationSession({
    provider,
    nativeSessionId: provider === "claude" ? crypto.randomUUID() : null,
    model: model || conversation?.model || null,
    syncedThroughMessageCount,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    origin,
  });
}

function serializeMessagesForState(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((message) => {
    const next = {
      id: message.id,
      role: message.role,
    };
    if (typeof message.text === "string") next.text = message.text;
    if (message.mode) next.mode = message.mode;
    if (message.command) next.command = message.command;
    if (message.exitCode != null) next.exitCode = message.exitCode;
    if (message.localOnly) next.localOnly = true;
    if (Array.isArray(message.parts)) {
      next.parts = message.parts.map((part) => ({
        type: part.type,
        ...(part.id ? { id: part.id } : {}),
        ...(part.name ? { name: part.name } : {}),
        ...(part.text != null ? { text: part.text } : {}),
        ...(part.args != null ? { args: part.args } : {}),
        ...(part.result != null ? { result: part.result } : {}),
        ...(part.status ? { status: part.status } : {}),
        ...(part.kind ? { kind: part.kind } : {}),
        ...(part.title ? { title: part.title } : {}),
      }));
    }
    if (Array.isArray(message.images) && message.images.length > 0) next.images = message.images;
    if (Array.isArray(message.files) && message.files.length > 0) next.files = message.files;
    if (message.claudeUuid) next.claudeUuid = message.claudeUuid;
    if (message._elapsedMs != null) next._elapsedMs = message._elapsedMs;
    if (message._usage && typeof message._usage === "object") {
      const usage = {};
      for (const key of [
        "input_tokens",
        "output_tokens",
        "total_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
        "context_window",
      ]) {
        if (Number.isFinite(message._usage[key])) usage[key] = message._usage[key];
      }
      if (Object.keys(usage).length > 0) next._usage = usage;
    }
    return next;
  });
}

function getArchivedMessageText(message) {
  if (!message) return "";
  if (typeof message.text === "string") return message.text.trim();
  if (!Array.isArray(message.parts)) return "";
  return message.parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function getArchivedMessageSignature(message) {
  const normalizedText = getArchivedMessageText(message).replace(/\s+/g, " ").slice(0, 400);
  return [
    message?.role || "",
    message?.mode || "",
    message?.command || "",
    message?.exitCode ?? "",
    Array.isArray(message?.images) ? message.images.length : 0,
    Array.isArray(message?.files) ? message.files.length : 0,
    normalizedText,
  ].join("|");
}

function mergeArchivedMessages(existingMessages, loadedMessages) {
  const existing = Array.isArray(existingMessages) ? existingMessages : [];
  const loaded = Array.isArray(loadedMessages) ? loadedMessages : [];

  if (loaded.length === 0) return existing;
  if (existing.length === 0) return loaded;

  const existingSignatures = existing.map(getArchivedMessageSignature);
  const loadedSignatures = loaded.map(getArchivedMessageSignature);
  const maxOverlap = Math.min(existingSignatures.length, loadedSignatures.length);

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    let matches = true;
    for (let i = 0; i < overlap; i += 1) {
      if (existingSignatures[existingSignatures.length - overlap + i] !== loadedSignatures[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return [...existing, ...loaded.slice(overlap)];
    }
  }

  return loaded.length > existing.length ? loaded : existing;
}

export default function App() {
  const {
    conversations,
    getConversation,
    prepareMessage,
    appendLocalMessages,
    startPreparedMessage,
    cancelMessage,
    editAndResend,
    loadMessages,
  } = useAgent();
  const terminal = useTerminal();

  // convos: array of { id, sessionId, title, model, ts }
  const [convoList, setConvoList] = useState([]);
  const [active, setActive] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [defaultModel, setDefaultModel] = useState(DEFAULT_MODEL_ID);
  const [cwd, setCwd] = useState(null);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [wallpaper, setWallpaper] = useState(null);
  const [fontSize, setFontSize] = useState(15);
  const [sidebarActiveOpacity, setSidebarActiveOpacity] = useState(DEFAULT_SIDEBAR_ACTIVE_OPACITY);
  const [defaultPrBranch, setDefaultPrBranch] = useState("main");
  const [appBlur, setAppBlur] = useState(0);
  const [appOpacity, setAppOpacity] = useState(100);
  const [developerMode, setDeveloperMode] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [projects, setProjects] = useState({});
  const [draftsCollapsed, setDraftsCollapsed] = useState(false);
  const [draftsPath, setDraftsPath] = useState(null);
  const [showNewChatCard, setShowNewChatCard] = useState(false);
  const messageQueue = useRef([]);
  const [queuedMessages, setQueuedMessages] = useState([]);
  const labControlTimersRef = useRef(new Map());
  const persistableConversations = useMemo(
    () =>
      convoList
        .map((conversation) => normalizeConversationState(conversation))
        .filter((conversation) => hasConversationMessages(conversation, getConversation(conversation.id))),
    [convoList, getConversation]
  );
  const persistedActive = useMemo(
    () => (
      persistableConversations.some((conversation) => conversation.id === active)
        ? active
        : persistableConversations[0]?.id || null
    ),
    [active, persistableConversations]
  );

  const canControlTarget = useCallback((target) => (
    target === "wallpaper.imgBlur"
    || target === "wallpaper.imgOpacity"
    || target === "app.blur"
    || target === "app.opacity"
    || target === "fontSize"
    || target === "app.fontSize"
    || target === "sidebar.activeOpacity"
    || target === "lab.imageOpacity"
    || target === "lab.imageBlur"
    || target === "lab.panelOpacity"
  ), []);

  useEffect(() => () => {
    for (const timer of labControlTimersRef.current.values()) {
      clearTimeout(timer);
    }
    labControlTimersRef.current.clear();
  }, []);

  const queueLabControlUpdate = useCallback((target, value) => {
    const timers = labControlTimersRef.current;
    const existingTimer = timers.get(target);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      void postLabControlUpdate(target, value).catch((error) => {
        console.warn("[control-bridge] failed to update lab target:", target, error);
      });
      timers.delete(target);
    }, LAB_CONTROL_COMMIT_DELAY_MS);

    timers.set(target, timer);
  }, []);

  const handleControlChange = useCallback(({ target, value }) => {
    if (!target) return;

    switch (target) {
      case "wallpaper.imgBlur":
        setWallpaper((prev) => normalizeWallpaper({
          ...(prev ?? DEFAULT_WALLPAPER),
          imgBlur: clampNumber(value, 0, 32, DEFAULT_WALLPAPER.imgBlur),
        }));
        return;
      case "wallpaper.imgOpacity":
        setWallpaper((prev) => normalizeWallpaper({
          ...(prev ?? DEFAULT_WALLPAPER),
          imgOpacity: clampNumber(value, 0, 100, DEFAULT_WALLPAPER.imgOpacity),
        }));
        return;
      case "app.blur":
        setAppBlur(clampNumber(value, 0, 20, 0));
        return;
      case "app.opacity":
        setAppOpacity(clampNumber(value, 30, 100, 100));
        return;
      case "fontSize":
      case "app.fontSize":
        setFontSize(clampNumber(value, 12, 22, 15));
        return;
      case "sidebar.activeOpacity":
        setSidebarActiveOpacity(clampNumber(value, 0, 20, DEFAULT_SIDEBAR_ACTIVE_OPACITY));
        return;
      case "lab.imageOpacity":
      case "lab.imageBlur":
      case "lab.panelOpacity":
        queueLabControlUpdate(target, value);
        return;
      default:
        return;
    }
  }, [queueLabControlUpdate]);

  // Load state from file on mount
  useEffect(() => {
    if (!window.api) { setStateLoaded(true); return; }
    window.api.loadState().then((state) => {
      if (state) {
        if (state.convos) {
          const restoredConversations = state.convos
            .map((convo) =>
              normalizeConversationState({
                ...convo,
                model: normalizeModelId(convo.model),
                lastProvider: convo.lastProvider || convo.provider || undefined,
                sessionProvider: convo.sessionProvider || undefined,
                archivedMessages: Array.isArray(convo.archivedMessages) ? convo.archivedMessages : [],
              })
            )
            .filter((conversation) => hasConversationMessages(conversation));

          setConvoList(restoredConversations);
          setActive(
            restoredConversations.some((conversation) => conversation.id === state.active)
              ? state.active
              : restoredConversations[0]?.id || null
          );
        }
        else if (state.active) setActive(state.active);
        if (state.cwd) setCwd(state.cwd);
        if (state.defaultModel) setDefaultModel(normalizeModelId(state.defaultModel));
        if (state.fontSize) setFontSize(state.fontSize);
        if (state.sidebarActiveOpacity != null) {
          setSidebarActiveOpacity(clampNumber(state.sidebarActiveOpacity, 0, 20, DEFAULT_SIDEBAR_ACTIVE_OPACITY));
        }
        if (state.defaultPrBranch) setDefaultPrBranch(state.defaultPrBranch);
        if (state.appBlur != null) setAppBlur(clampNumber(state.appBlur, 0, 20, 0));
        if (state.appOpacity != null) setAppOpacity(clampNumber(state.appOpacity, 30, 100, 100));
        if (state.developerMode != null) setDeveloperMode(!!state.developerMode);
        if (state.wallpaper) {
          setWallpaper(normalizeWallpaper(state.wallpaper));
          // Reload data URL from disk (not persisted — too large for JSON)
          if (state.wallpaper.path && window.api.readImage) {
            window.api.readImage(state.wallpaper.path).then((dataUrl) => {
              if (dataUrl) setWallpaper((prev) => (prev ? normalizeWallpaper({ ...prev, dataUrl }) : prev));
            });
          }
        }
        if (state.projects) setProjects(normalizeProjectsMeta(state.projects));
        if (state.draftsCollapsed != null) setDraftsCollapsed(state.draftsCollapsed);
      }
      setStateLoaded(true);
    });
    window.api.getDraftsPath?.().then((p) => { if (p) setDraftsPath(p); });
  }, []);

  // Persist state to file on changes (skip until initial load is done)
  const saveTimer = useRef(null);
  useEffect(() => {
    if (!stateLoaded || !window.api) return;
    // Debounce saves
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Strip dataUrl before persisting (too large for JSON, reloaded on startup)
      const wpSave = getPersistedWallpaper(wallpaper);
      window.api.saveState({
        convos: persistableConversations,
        active: persistedActive,
        cwd,
        defaultModel,
        fontSize,
        sidebarActiveOpacity,
        wallpaper: wpSave,
        projects,
        draftsCollapsed,
        defaultPrBranch,
        appBlur,
        appOpacity,
        developerMode,
      });
    }, 300);
  }, [persistableConversations, persistedActive, cwd, defaultModel, fontSize, sidebarActiveOpacity, wallpaper, projects, draftsCollapsed, defaultPrBranch, appBlur, appOpacity, developerMode, stateLoaded]);

  // Push window opacity to Electron
  useEffect(() => {
    if (!stateLoaded || !window.api?.setWindowOpacity) return;
    window.api.setWindowOpacity(Math.max(0.3, Math.min(1, appOpacity / 100)));
  }, [appOpacity, stateLoaded]);

  const activeConvo = convoList.find((c) => c.id === active);
  const activeData  = active ? getConversation(active) : { messages: [], isStreaming: false, error: null };

  const resolveStoredSessionProvider = useCallback(async (conversation) => {
    if (!conversation) return null;
    const normalizedConversation = normalizeConversationState(conversation);
    if (normalizedConversation.sessionProvider) return normalizedConversation.sessionProvider;
    const preferredSessionId = getPreferredLoadSessionId(normalizedConversation);
    if (!preferredSessionId || !window.api?.loadSession) return null;

    try {
      const result = await window.api.loadSession(preferredSessionId);
      const provider = result?.provider || null;
      if (provider) {
        logSessionState("resolveStoredSessionProvider", {
          conversationId: normalizedConversation.id,
          sessionId: preferredSessionId,
          provider,
          lastProvider: normalizedConversation.lastProvider || null,
          providerSessions: normalizedConversation.providerSessions || null,
          activeSessionId: normalizedConversation.activeSessionId || null,
        });
        setConvoList((p) =>
          p.map((c) =>
            c.id === normalizedConversation.id
              ? upsertConversationSession(
                  {
                    ...c,
                    sessionProvider: c.sessionProvider || provider,
                  },
                  {
                    provider,
                    nativeSessionId: preferredSessionId,
                    model: c.model,
                    syncedThroughMessageCount:
                      c.archivedMessages?.length || c.sessions?.[0]?.syncedThroughMessageCount || 0,
                    origin: "resolved",
                  },
                  {
                    activate: true,
                    lastProvider: c.lastProvider || provider,
                  }
                )
              : c
          )
        );
      }
      return provider;
    } catch {
      return null;
    }
  }, []);

  const resolveConversationLastProvider = useCallback(async (conversation) => {
    if (!conversation) return null;
    return (
      conversation.lastProvider ||
      getActiveConversationSession(conversation)?.provider ||
      resolveStoredSessionProvider(conversation)
    );
  }, [resolveStoredSessionProvider]);

  const resolveConversationProviderSession = useCallback(async (conversation, provider) => {
    if (!conversation || !provider) return null;
    const directSession = getLatestSessionForProvider(conversation, provider, { requireNative: true });
    if (directSession) return directSession;

    const storedProvider = await resolveStoredSessionProvider(conversation);
    const normalizedConversation = normalizeConversationState(conversation);
    if (storedProvider === provider && normalizedConversation.sessionId) {
      return getLatestSessionForProvider(normalizedConversation, provider, { requireNative: true }) || {
        provider,
        nativeSessionId: normalizedConversation.sessionId,
        syncedThroughMessageCount: normalizedConversation.archivedMessages?.length || 0,
      };
    }
    return null;
  }, [resolveStoredSessionProvider]);

  // Load messages and session metadata when selecting a conversation
  const handleSelect = useCallback(async (id) => {
    setShowNewChatCard(false);
    setActive(id);
    const convo = convoList.find((c) => c.id === id);
    const data = getConversation(id);
    if (convo && window.api) {
      if (data.messages.length === 0 && Array.isArray(convo.archivedMessages) && convo.archivedMessages.length > 0) {
        loadMessages(id, convo.archivedMessages);
      }
      try {
        const sessionIdToLoad = getPreferredLoadSessionId(convo);
        if (!sessionIdToLoad) return;
        const result = await window.api.loadSession(sessionIdToLoad);
        const { msgs, sessionCwd, sessionProvider } = extractLoadedSessionMeta(result);
        logSessionState("handleSelect:loaded", {
          conversationId: id,
          sessionIdToLoad,
          sessionProvider,
          lastProvider: convo.lastProvider || null,
          providerSessions: convo.providerSessions || null,
        });
        if (msgs && msgs.length > 0) {
          const serializedSessionMessages = serializeMessagesForState(msgs);
          if (data.messages.length === 0) {
            // For forked conversations, only load messages up to the fork point
            loadMessages(id, msgs);
          }
          const lastMsg = msgs[msgs.length - 1];
          const previewText = lastMsg?.parts
            ? lastMsg.parts.filter(p => p.type === "text").map(p => p.text).join(" ")
            : (lastMsg?.text || "");
          setConvoList((p) =>
            p.map((c) => {
              if (c.id !== id) return c;
              const next = sessionProvider
                ? upsertConversationSession(
                    {
                      ...c,
                      ...(sessionIdToLoad === c.sessionId ? { sessionProvider } : {}),
                    },
                    {
                      provider: sessionProvider,
                      nativeSessionId: sessionIdToLoad,
                      model: c.model,
                      syncedThroughMessageCount: msgs.length,
                      origin: "loaded",
                    },
                    {
                      activate: true,
                      lastProvider: c.lastProvider || sessionProvider,
                    }
                  )
                : normalizeConversationState(c);

              return normalizeConversationState({
                ...next,
                ...(previewText ? { lastPreview: previewText.slice(0, 60) } : {}),
                ...(sessionCwd ? { cwd: sessionCwd } : {}),
                archivedMessages: mergeArchivedMessages(c.archivedMessages, serializedSessionMessages),
              });
            })
          );
        } else if (sessionProvider || sessionCwd) {
          setConvoList((p) =>
            p.map((c) => {
              if (c.id !== id) return c;
              const next = sessionProvider
                ? upsertConversationSession(
                    {
                      ...c,
                      ...(sessionIdToLoad === c.sessionId ? { sessionProvider } : {}),
                    },
                    {
                      provider: sessionProvider,
                      nativeSessionId: sessionIdToLoad,
                      model: c.model,
                      syncedThroughMessageCount: c.archivedMessages?.length || 0,
                      origin: "loaded-meta",
                    },
                    {
                      activate: true,
                      lastProvider: c.lastProvider || sessionProvider,
                    }
                  )
                : normalizeConversationState(c);

              return normalizeConversationState({
                ...next,
                ...(sessionCwd ? { cwd: sessionCwd } : {}),
              });
            })
          );
        }
      } catch (e) {
        console.error("Failed to load session:", e);
      }
    }
  }, [convoList, getConversation, loadMessages]);

  // Load active conversation + previews after state is loaded
  useEffect(() => {
    if (!stateLoaded) return;
    if (active) handleSelect(active);
  }, [stateLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load previews for conversations missing them (runs after state load)
  useEffect(() => {
    if (!stateLoaded || !window.api) return;
    convoList.forEach(async (c) => {
      if (!c.lastPreview || c.lastPreview === "Empty" || !c.cwd || !c.lastProvider) {
        try {
          const sessionIdToLoad = getPreferredLoadSessionId(c);
          if (!sessionIdToLoad) return;
          const result = await window.api.loadSession(sessionIdToLoad);
          const { msgs, sessionCwd, sessionProvider } = extractLoadedSessionMeta(result);
          if (msgs && msgs.length > 0) {
            const serializedSessionMessages = serializeMessagesForState(msgs);
            const lastMsg = msgs[msgs.length - 1];
            const previewText = lastMsg?.parts
              ? lastMsg.parts.filter(p => p.type === "text").map(p => p.text).join(" ")
              : (lastMsg?.text || "");
            setConvoList((p) =>
              p.map((cv) => {
                if (cv.id !== c.id) return cv;
                const next = sessionProvider
                  ? upsertConversationSession(
                      {
                        ...cv,
                        ...(sessionIdToLoad === cv.sessionId ? { sessionProvider } : {}),
                      },
                      {
                        provider: sessionProvider,
                        nativeSessionId: sessionIdToLoad,
                        model: cv.model,
                        syncedThroughMessageCount: msgs.length,
                        origin: "preview-load",
                      },
                      {
                        activate: !cv.activeSessionId,
                        lastProvider: cv.lastProvider || sessionProvider,
                      }
                    )
                  : normalizeConversationState(cv);

                return normalizeConversationState({
                  ...next,
                  ...(previewText ? { lastPreview: previewText.slice(0, 60) } : {}),
                  ...(sessionCwd && !cv.cwd ? { cwd: sessionCwd } : {}),
                  archivedMessages: mergeArchivedMessages(cv.archivedMessages, serializedSessionMessages),
                });
              })
            );
          } else if (sessionProvider || sessionCwd) {
            setConvoList((p) =>
              p.map((cv) => {
                if (cv.id !== c.id) return cv;
                const next = sessionProvider
                  ? upsertConversationSession(
                      {
                        ...cv,
                        ...(sessionIdToLoad === cv.sessionId ? { sessionProvider } : {}),
                      },
                      {
                        provider: sessionProvider,
                        nativeSessionId: sessionIdToLoad,
                        model: cv.model,
                        syncedThroughMessageCount: cv.archivedMessages?.length || 0,
                        origin: "preview-meta",
                      },
                      {
                        activate: !cv.activeSessionId,
                        lastProvider: cv.lastProvider || sessionProvider,
                      }
                    )
                  : normalizeConversationState(cv);

                return normalizeConversationState({
                  ...next,
                  ...(sessionCwd && !cv.cwd ? { cwd: sessionCwd } : {}),
                });
              })
            );
          }
        } catch {}
      }
    });
  }, [stateLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ────────────────────────────────────────────────────────────────

  const createConversationDraft = useCallback(({
    id,
    title,
    modelId,
    ts,
    cwd: conversationCwd,
  }) => {
    const provider = getM(modelId).provider || "claude";
    const seedSession = createConversationSession({
      provider,
      nativeSessionId: null,
      model: modelId,
      syncedThroughMessageCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      origin: "draft",
    });

    return normalizeConversationState({
      id,
      title,
      model: modelId,
      ts,
      cwd: conversationCwd,
      sessions: [seedSession],
      activeSessionId: seedSession.id,
      archivedMessages: [],
    });
  }, []);

  const handleNew = () => {
    setShowNewChatCard(true);
  };

  const handleToggleProjectCollapse = (cwdRoot) => {
    const projectRoot = getMainRepoRoot(cwdRoot);
    setProjects((prev) => ({
      ...prev,
      [projectRoot]: { ...prev[projectRoot], collapsed: !prev[projectRoot]?.collapsed },
    }));
  };

  const handleHideProject = (cwdRoot) => {
    const projectRoot = getMainRepoRoot(cwdRoot);
    setProjects((prev) => ({
      ...prev,
      [projectRoot]: { ...prev[projectRoot], hidden: true },
    }));
  };

  const handleNewInProject = (cwdRoot) => {
    const id = "c" + Date.now();
    const n = createConversationDraft({
      id,
      title: "New chat",
      modelId: defaultModel,
      ts: Date.now(),
      cwd: cwdRoot || undefined,
    });
    setConvoList((p) => [n, ...p]);
    setActive(id);
    setShowNewChatCard(false);
    if (cwdRoot && projects[cwdRoot]?.hidden) {
      setProjects((prev) => ({
        ...prev,
        [cwdRoot]: { ...prev[cwdRoot], hidden: false },
      }));
    }
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    cancelMessage(id);
    const remaining = convoList.filter((c) => c.id !== id);
    setConvoList(remaining);
    if (active === id) setActive(remaining[0]?.id || null);
  };

  // Capture provider-native session IDs as they arrive from the agent streams.
  useEffect(() => {
    if (!active) return;
    const data = getConversation(active);
    const convo = convoList.find(c => c.id === active);
    if (!convo) return;
    const normalizedConvo = normalizeConversationState(convo);
    const activeSession = getActiveConversationSession(normalizedConvo);

    const nextCodexThreadId = data._codexThreadId || null;
    const nextClaudeSessionId = data._claudeSessionId || null;
    const hasNewCodexThreadId =
      nextCodexThreadId && normalizedConvo.providerSessions?.codex !== nextCodexThreadId;
    const hasNewClaudeSessionId =
      nextClaudeSessionId && normalizedConvo.providerSessions?.claude !== nextClaudeSessionId;

    if (!hasNewCodexThreadId && !hasNewClaudeSessionId) return;

    logSessionState("captureProviderSession", {
      conversationId: active,
      nextCodexThreadId,
      nextClaudeSessionId,
      lastProvider: normalizedConvo.lastProvider || null,
      sessionId: normalizedConvo.sessionId || null,
      sessionProvider: normalizedConvo.sessionProvider || null,
      providerSessions: normalizedConvo.providerSessions || null,
      activeSessionId: normalizedConvo.activeSessionId || null,
      activeSession,
    });

    setConvoList((p) =>
      p.map((c) => {
        if (c.id !== active) return c;
        let next = normalizeConversationState(c);
        if (hasNewCodexThreadId) {
          next = upsertConversationSession(
            next,
            {
              id:
                activeSession?.provider === "codex" && !activeSession.nativeSessionId
                  ? activeSession.id
                  : undefined,
              provider: "codex",
              nativeSessionId: nextCodexThreadId,
              model: next.model,
              syncedThroughMessageCount: Math.max(
                activeSession?.syncedThroughMessageCount || 0,
                next.archivedMessages?.length || 0
              ),
              origin: "capture",
            },
            {
              activate: true,
              preferPendingActive: true,
              lastProvider: next.lastProvider || "codex",
            }
          );
        }
        if (hasNewClaudeSessionId) {
          next = upsertConversationSession(
            next,
            {
              id:
                activeSession?.provider === "claude" && !activeSession.nativeSessionId
                  ? activeSession.id
                  : undefined,
              provider: "claude",
              nativeSessionId: nextClaudeSessionId,
              model: next.model,
              syncedThroughMessageCount: Math.max(
                activeSession?.syncedThroughMessageCount || 0,
                next.archivedMessages?.length || 0
              ),
              origin: "capture",
            },
            {
              activate: true,
              preferPendingActive: true,
              lastProvider: next.lastProvider || "claude",
            }
          );
        }
        return next;
      })
    );
  }, [active, convoList, conversations, getConversation]);

  const sendMessageToConversation = useCallback(
    async ({ conversationId, conversation, text, attachments, titleText }) => {
      if (!conversationId || !conversation) return false;

      const effectiveCwd = getEffectiveConversationCwd(conversation, cwd, draftsPath);
      const thisConvoData = getConversation(conversationId);
      const normalizedConversation = normalizeConversationState(conversation);
      const activeSession = getActiveConversationSession(normalizedConversation);
      const isFirstMessage = thisConvoData.messages.length === 0;
      const messageIndex = thisConvoData.messages.length;
      const syncedMessageCount = thisConvoData.messages.length;
      const images = attachments?.filter((a) => a.type === "image").map((a) => a.dataUrl);
      const files = attachments?.filter((a) => a.type === "file");
      const m = getM(normalizedConversation.model);
      const currentProvider = m.provider || "claude";
      const prevProvider = isFirstMessage
        ? normalizedConversation.lastProvider || activeSession?.provider || null
        : await resolveConversationLastProvider(normalizedConversation);
      const currentProviderSession = await resolveConversationProviderSession(
        normalizedConversation,
        currentProvider
      );
      const providerSwitched =
        !isFirstMessage && prevProvider && prevProvider !== currentProvider;
      const canResumeExistingSession =
        !isFirstMessage &&
        prevProvider === currentProvider &&
        Boolean(currentProviderSession?.nativeSessionId) &&
        currentProviderSession.syncedThroughMessageCount === syncedMessageCount;
      const needsHistoryPrimeFallback =
        !isFirstMessage && !providerSwitched && !canResumeExistingSession;
      const needsFreshSession = isFirstMessage || providerSwitched || needsHistoryPrimeFallback;
      const seededSession =
        needsFreshSession
          ? (
              isFirstMessage && activeSession?.provider === currentProvider
                ? {
                    ...activeSession,
                    nativeSessionId:
                      currentProvider === "claude"
                        ? activeSession.nativeSessionId || crypto.randomUUID()
                        : activeSession.nativeSessionId || null,
                    model: normalizedConversation.model,
                    syncedThroughMessageCount: syncedMessageCount,
                    updatedAt: Date.now(),
                    origin: isFirstMessage ? "initial-send" : (providerSwitched ? "handoff" : "resync"),
                  }
                : createSeedSession(normalizedConversation, currentProvider, {
                    model: normalizedConversation.model,
                    syncedThroughMessageCount: syncedMessageCount,
                    origin: isFirstMessage ? "initial-send" : (providerSwitched ? "handoff" : "resync"),
                  })
            )
          : null;
      const initialSessionId =
        needsFreshSession && currentProvider === "claude"
          ? seededSession?.nativeSessionId || undefined
          : undefined;
      const prime = providerSwitched
        ? buildCrossProviderPrime(thisConvoData.messages)
        : needsHistoryPrimeFallback
          ? buildConversationPrime(thisConvoData.messages)
          : null;
      const wirePrompt = prime ? decoratePromptWithPrime(text, prime) : text;
      const sendStartedAt = Date.now();

      if (isFirstMessage) {
        const newTitle = deriveConversationTitle(titleText || text, attachments);
        setConvoList((p) =>
          p.map((c) => c.id === conversationId ? { ...c, title: newTitle } : c)
        );
      }

      logSendFlow("handleSend:start", {
        conversationId,
        effectiveCwd,
        isFirstMessage,
        messageIndex,
        currentProvider,
        prevProvider: prevProvider || null,
        providerSwitched,
        sessionId: normalizedConversation.sessionId || null,
        sessionProvider: normalizedConversation.sessionProvider || null,
        providerSessions: normalizedConversation.providerSessions || null,
        activeSessionId: normalizedConversation.activeSessionId || null,
        activeSession,
        currentProviderSession,
        initialSessionId: initialSessionId || null,
        resumeSessionId: canResumeExistingSession ? currentProviderSession.nativeSessionId : null,
        primeMode: providerSwitched ? "cross-provider" : (needsHistoryPrimeFallback ? "history-fallback" : null),
      });

      const pendingId = prepareMessage({
        conversationId,
        prompt: text,
        images: images?.length ? images : undefined,
        files: files?.length ? files : undefined,
      });

      logSendFlow("handleSend:seeded", {
        conversationId,
        pendingId,
        elapsedMs: Date.now() - sendStartedAt,
      });

      // Create a git checkpoint before sending (for future edit rewind)
      if (effectiveCwd && window.api) {
        const checkpointStartedAt = Date.now();
        logCheckpoint("checkpointCreate:start", { cwdPath: effectiveCwd, conversationId, messageIndex });
        try {
          const cp = await window.api.checkpointCreate(effectiveCwd);
          logCheckpoint("checkpointCreate:success", {
            cwdPath: effectiveCwd,
            conversationId,
            messageIndex,
            ref: cp?.ref || null,
            durationMs: Date.now() - checkpointStartedAt,
            totalElapsedMs: Date.now() - sendStartedAt,
          });
          if (cp?.ref) {
            setConvoList((p) =>
              p.map((c) => {
                if (c.id !== conversationId) return c;
                const checkpoints = { ...(c.checkpoints || {}) };
                checkpoints[messageIndex] = cp.ref;
                return { ...c, checkpoints };
              })
            );
          }
        } catch (e) {
          logCheckpoint("checkpointCreate:failed", {
            cwdPath: effectiveCwd,
            conversationId,
            messageIndex,
            durationMs: Date.now() - checkpointStartedAt,
            totalElapsedMs: Date.now() - sendStartedAt,
            error: e.message,
          });
          console.warn("Checkpoint creation failed:", e.message);
        }
      }

      const started = startPreparedMessage({
        conversationId,
        pendingId,
        sessionId: initialSessionId,
        resumeSessionId: canResumeExistingSession ? currentProviderSession.nativeSessionId : undefined,
        prompt: wirePrompt,
        model: m.cliFlag,
        provider: m.provider || "claude",
        effort: m.effort,
        cwd: effectiveCwd,
        images: images?.length ? images : undefined,
        files: files?.length ? files : undefined,
      });

      if (started) {
        const providerUsed = m.provider || "claude";
        setConvoList((p) =>
          p.map((c) => {
            if (c.id !== conversationId) return c;
            let next = normalizeConversationState(c);
            if (seededSession) {
              next = upsertConversationSession(next, seededSession, {
                activate: true,
                preferPendingActive: true,
                lastProvider: providerUsed,
              });
            } else if (currentProviderSession?.id) {
              next = normalizeConversationState({
                ...next,
                activeSessionId: currentProviderSession.id,
                lastProvider: providerUsed,
              });
            } else {
              next = normalizeConversationState({
                ...next,
                lastProvider: providerUsed,
              });
            }
            return next;
          })
        );
      }

      logSendFlow("handleSend:agent-start", {
        conversationId,
        pendingId,
        started,
        totalElapsedMs: Date.now() - sendStartedAt,
      });

      return started;
    },
    [cwd, draftsPath, getConversation, prepareMessage, resolveConversationLastProvider, resolveConversationProviderSession, startPreparedMessage]
  );

  const handleSend = useCallback(
    async (text, attachments) => {
      const trimmed = text.trim();
      const isShellCommand = trimmed.startsWith("!") && trimmed.length > 1;
      if (trimmed === "!") return;

      // Handle slash commands client-side
      if (trimmed.startsWith("/") && !trimmed.includes(" ")) {
        const cmd = trimmed.toLowerCase();
        if (cmd === "/clear" || cmd === "/new") {
          handleNew();
          return;
        }
        if (cmd === "/model") {
          // No-op — model picker is in the top bar
          return;
        }
        if (cmd === "/" || cmd.length <= 1) {
          return; // Don't send bare /
        }
        // /compact and others — send as regular text so Claude handles them
      }

      // Queue if currently streaming
      if (activeData.isStreaming && active) {
        messageQueue.current.push({ text, attachments });
        setQueuedMessages([...messageQueue.current]);
        return;
      }

      let convo = activeConvo;
      let convoId = active;

      // Auto-create conversation if none exists
      if (!convo) {
        const id = "c" + Date.now();
        convo = createConversationDraft({
          id,
          title: deriveConversationTitle(text, attachments),
          modelId: defaultModel,
          ts: Date.now(),
          cwd: getMainRepoRoot(cwd) || undefined,
        });
        convoId = id;
        setConvoList((p) => [convo, ...p]);
        setActive(id);
      }

      if (isShellCommand) {
        const command = trimmed.slice(1).trim();
        const effectiveCwd = getEffectiveConversationCwd(convo, cwd, draftsPath);
        const normalizedConversation = normalizeConversationState(convo);
        const activeSession = getActiveConversationSession(normalizedConversation);
        const currentProvider = getM(normalizedConversation.model).provider || "claude";
        const currentMessageCount = getConversation(convoId).messages.length;
        const isFirstMessage = currentMessageCount === 0;
        let result;

        if (window.api?.shellRun) {
          result = await window.api.shellRun({ command, cwd: effectiveCwd });
        } else if (window.api?.terminalCreate && window.api?.terminalSend && window.api?.terminalRead && window.api?.terminalKill) {
          result = await runShellViaTerminalApi({ command, cwd: effectiveCwd });
        } else {
          result = {
            ok: false,
            command,
            cwd: effectiveCwd,
            error: "Shell mode is not available in this environment.",
          };
        }

        if (isFirstMessage) {
          setConvoList((p) =>
            p.map((c) => c.id === convoId ? { ...c, title: trimmed.slice(0, 50) } : c)
          );
        }

        setConvoList((p) =>
          p.map((c) => {
            if (c.id !== convoId) return c;
            return upsertConversationSession(
              normalizeConversationState(c),
              {
                id:
                  activeSession?.provider === currentProvider && !activeSession?.nativeSessionId
                    ? activeSession.id
                    : undefined,
                provider: currentProvider,
                nativeSessionId: null,
                model: normalizedConversation.model,
                syncedThroughMessageCount: currentMessageCount + 2,
                origin: "local-shell",
              },
              {
                activate: true,
                preferPendingActive: true,
              }
            );
          })
        );

        appendLocalMessages(convoId, [
          {
            role: "user",
            text: command,
            mode: "shell-command",
            localOnly: true,
          },
          {
            role: "system",
            text: formatShellResult(result),
            mode: "shell-result",
            command,
            exitCode: result.exitCode,
            localOnly: true,
          },
        ]);
        return;
      }

      await sendMessageToConversation({
        conversationId: convoId,
        conversation: convo,
        text,
        attachments,
        titleText: text,
      });
    },
    [activeConvo, active, activeData, appendLocalMessages, cwd, defaultModel, draftsPath, getConversation, sendMessageToConversation]
  );

  // Process queued messages when streaming ends
  useEffect(() => {
    if (!activeData.isStreaming && messageQueue.current.length > 0) {
      const next = messageQueue.current.shift();
      setQueuedMessages([...messageQueue.current]);
      setTimeout(() => handleSend(next.text, next.attachments), 300);
    }
  }, [activeData.isStreaming, handleSend]);

  const handleCreateChat = useCallback(async (opts) => {
    const id = "c" + Date.now();
    const effectiveCwd = opts.cwd !== undefined ? opts.cwd : (getMainRepoRoot(cwd) || undefined);
    const modelId = opts.model || defaultModel;
    const n = createConversationDraft({
      id,
      title: opts.title || opts.prompt?.slice(0, 50) || "New chat",
      modelId,
      ts: Date.now(),
      cwd: effectiveCwd,
    });

    if (opts.worktree && !opts.branch) {
      throw new Error("A worktree requires a branch name.");
    }

    if (opts.branch && effectiveCwd) {
      if (opts.worktree) {
        const wtPath = `${effectiveCwd}/.worktrees/${opts.branch}`;
        await window.api?.gitWorktreeAdd(effectiveCwd, wtPath, opts.branch, {
          createBranch: true,
          startPoint: opts.worktreeBaseBranch,
        });
        n.cwd = wtPath;
      } else if (opts.branchMode === "existing") {
        await window.api?.gitCheckout(effectiveCwd, opts.branch);
      } else {
        await window.api?.gitCreateBranch(effectiveCwd, opts.branch);
      }
    }

    setConvoList((p) => [n, ...p]);
    setActive(id);
    setShowNewChatCard(false);

    const projectRoot = getMainRepoRoot(opts.cwd || effectiveCwd);
    if (projectRoot && !projects[projectRoot]) {
      setProjects((prev) => ({
        ...prev,
        [projectRoot]: { name: projectRoot.split("/").pop(), manual: true },
      }));
    }

    // Unhide if hidden
    if (projectRoot && projects[projectRoot]?.hidden) {
      setProjects((prev) => ({
        ...prev,
        [projectRoot]: { ...prev[projectRoot], hidden: false },
      }));
    }

    let prompt = opts.prompt || "";
    if (opts.issueContext) {
      prompt = `${opts.issueContext}\n\n${prompt}`;
    }

    if (prompt) {
      await sendMessageToConversation({
        conversationId: id,
        conversation: n,
        text: prompt,
        attachments: opts.attachments,
      });
    }
  }, [createConversationDraft, cwd, defaultModel, projects, sendMessageToConversation]);

  const handleCancel = useCallback(() => {
    if (active) cancelMessage(active);
  }, [active, cancelMessage]);

  const handleEdit = useCallback(
    async (messageIndex, newText) => {
      if (!activeConvo) return;
      const normalizedConvo = normalizeConversationState(activeConvo);
      const m = getM(normalizedConvo.model);
      const convoCwd = normalizedConvo.cwd || cwd || undefined;
      const currentMessages = getConversation(active).messages;

      // Restore git checkpoint to the state before this message
      const checkpointRef = normalizedConvo.checkpoints?.[messageIndex];
      logCheckpoint("handleEdit", {
        convoId: active,
        messageIndex,
        checkpointRef: checkpointRef || null,
        convoCwd,
      });
      if (checkpointRef && convoCwd && window.api) {
        try {
          await window.api.checkpointRestore(convoCwd, checkpointRef);
        } catch (e) {
          console.error("Checkpoint restore failed:", e);
        }
      }

      const currentProvider = m.provider || "claude";
      const activeSession = getActiveConversationSession(normalizedConvo);
      const prevProvider = await resolveConversationLastProvider(normalizedConvo);
      const currentProviderSession = await resolveConversationProviderSession(
        normalizedConvo,
        currentProvider
      );
      // For edits, treat it like a mid-chat send: if the last turn used a
      // different provider than the current one, prime.
      const providerSwitched = prevProvider && prevProvider !== currentProvider;
      const canResumeExistingSession =
        prevProvider === currentProvider &&
        Boolean(currentProviderSession?.nativeSessionId) &&
        currentProviderSession.syncedThroughMessageCount === currentMessages.length;
      const priorMessages = currentMessages.slice(0, messageIndex);
      const needsHistoryPrimeFallback = !providerSwitched && !canResumeExistingSession;
      const seededEditSession = !canResumeExistingSession
        ? createConversationSession({
            provider: currentProvider,
            nativeSessionId: null,
            model: normalizedConvo.model,
            syncedThroughMessageCount: priorMessages.length,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            origin: providerSwitched ? "handoff-edit" : "resync-edit",
          })
        : null;
      const prime = providerSwitched
        ? buildCrossProviderPrime(priorMessages)
        : needsHistoryPrimeFallback
          ? buildConversationPrime(priorMessages)
          : null;
      const wirePrompt = prime ? decoratePromptWithPrime(newText, prime) : newText;

      logSendFlow("handleEdit:start", {
        conversationId: active,
        currentProvider,
        prevProvider: prevProvider || null,
        providerSwitched,
        sessionId: normalizedConvo.sessionId || null,
        sessionProvider: normalizedConvo.sessionProvider || null,
        providerSessions: normalizedConvo.providerSessions || null,
        activeSessionId: normalizedConvo.activeSessionId || null,
        activeSession,
        currentProviderSession,
        resumeSessionId: canResumeExistingSession ? currentProviderSession.nativeSessionId : null,
        primeMode: providerSwitched ? "cross-provider" : (needsHistoryPrimeFallback ? "history-fallback" : null),
      });

      const started = editAndResend({
        conversationId: active,
        sessionId: canResumeExistingSession ? currentProviderSession.nativeSessionId : undefined,
        messageIndex,
        newText,
        wirePrompt,
        model: m.cliFlag,
        provider: currentProvider,
        effort: m.effort,
        cwd: convoCwd,
      });

      if (started) {
        setConvoList((p) =>
          p.map((c) => {
            if (c.id !== active) return c;
            let next = normalizeConversationState(c);
            if (seededEditSession) {
              next = upsertConversationSession(next, seededEditSession, {
                activate: true,
                preferPendingActive: true,
                lastProvider: currentProvider,
              });
            } else if (currentProviderSession?.id) {
              next = normalizeConversationState({
                ...next,
                activeSessionId: currentProviderSession.id,
                lastProvider: currentProvider,
              });
            } else {
              next = normalizeConversationState({
                ...next,
                lastProvider: currentProvider,
              });
            }
            return next;
          })
        );
      }
    },
    [activeConvo, active, cwd, getConversation, editAndResend, resolveConversationLastProvider, resolveConversationProviderSession]
  );

  const handleModelChange = (modelId) => {
    const nextProvider = getM(modelId).provider || "claude";
    const normalizedActiveConvo = activeConvo ? normalizeConversationState(activeConvo) : null;
    logSessionState("handleModelChange", {
      conversationId: active || null,
      modelId,
      nextProvider,
      lastProvider: normalizedActiveConvo?.lastProvider || null,
      sessionId: normalizedActiveConvo?.sessionId || null,
      sessionProvider: normalizedActiveConvo?.sessionProvider || null,
      providerSessions: normalizedActiveConvo?.providerSessions || null,
      activeSessionId: normalizedActiveConvo?.activeSessionId || null,
    });
    if (active) {
      setConvoList((p) =>
        p.map((c) => (c.id === active ? { ...c, model: modelId } : c))
      );
    }
    setDefaultModel(modelId);
  };

  const handlePickFolder = async () => {
    if (!window.api) return;
    const folder = await window.api.pickFolder();
    if (folder) {
      setCwd(folder);
      // If there's an active conversation, copy its session to the new directory
      if (activeConvo && activeConvo.cwd !== folder) {
        try {
          const claudeSessionId =
            getLatestSessionForProvider(normalizeConversationState(activeConvo), "claude", {
              requireNative: true,
            })?.nativeSessionId || null;
          if (claudeSessionId) {
            await window.api.moveSession(claudeSessionId, folder);
          }
          setConvoList((p) =>
            p.map((c) => c.id === active ? { ...c, cwd: folder } : c)
          );
        } catch (e) {
          console.error("Failed to move session:", e);
        }
      }
    }
  };

  // Update saved preview when active conversation messages change
  useEffect(() => {
    if (active && activeData.messages.length > 0 && !activeData.isStreaming) {
      const lastMsg = activeData.messages[activeData.messages.length - 1];
      const msgText = lastMsg?.parts
        ? lastMsg.parts.filter(p => p.type === "text").map(p => p.text).join(" ")
        : (lastMsg?.text || "");
      const preview = msgText.slice(0, 60);
      const archivedMessages = serializeMessagesForState(activeData.messages);
      const syncedMessageCount = activeData.messages.length;
      if (preview) {
        setConvoList((p) =>
          p.map((c) => {
            if (c.id !== active) return c;
            const normalized = normalizeConversationState({
              ...c,
              lastPreview: preview,
              archivedMessages,
            });
            const activeSession = getActiveConversationSession(normalized);
            return activeSession
              ? markConversationSessionSynced(
                  normalized,
                  activeSession.id,
                  syncedMessageCount
                )
              : normalized;
          })
        );
      } else {
        setConvoList((p) =>
          p.map((c) => {
            if (c.id !== active) return c;
            const normalized = normalizeConversationState({
              ...c,
              archivedMessages,
            });
            const activeSession = getActiveConversationSession(normalized);
            return activeSession
              ? markConversationSessionSynced(
                  normalized,
                  activeSession.id,
                  syncedMessageCount
                )
              : normalized;
          })
        );
      }
    }
  }, [active, activeData.isStreaming, activeData.messages]);

  // Build convo object for ChatArea
  const convo = activeConvo
    ? {
        ...activeConvo,
        msgs: activeData.messages,
        isStreaming: activeData.isStreaming,
        error: activeData.error,
      }
    : null;

  // Build convos for Sidebar
  const convosForSidebar = convoList.map((c) => {
    const data = getConversation(c.id);
    const msgs = data.messages;
    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    const lastText = lastMsg?.parts
      ? lastMsg.parts.filter(p => p.type === "text").map(p => p.text).join(" ")
      : (lastMsg?.text || "");
    const preview = lastText ? lastText.slice(0, 45) : null;
    return {
      ...c,
      msgs,
      lastPreview: preview || c.lastPreview || "Empty",
      isStreaming: data.isStreaming,
    };
  }).filter((conversation) => (
    conversation.id === active || hasConversationMessages(conversation, { messages: conversation.msgs })
  ));

  // Refresh terminal sessions periodically (catches Claude-created sessions)
  useEffect(() => {
    terminal.refreshSessions();
    const interval = setInterval(() => terminal.refreshSessions(), 3000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allCwdRoots = useMemo(() => {
    const roots = new Set();
    convoList.forEach(c => { if (c.cwd) roots.add(getMainRepoRoot(c.cwd)); });
    Object.keys(projects).forEach(r => roots.add(getMainRepoRoot(r)));
    return [...roots];
  }, [convoList, projects]);

  const terminalCwd = activeConvo?.cwd === null ? (draftsPath || undefined) : (activeConvo?.cwd || cwd);

  const handleToggleTerminal = async () => {
    if (terminal.drawerOpen) {
      terminal.setDrawerOpen(false);
      return;
    }

    if (terminal.sessions.length === 0) {
      await terminal.createSession({ name: `shell-${Date.now()}`, cwd: terminalCwd });
      return;
    }

    terminal.setDrawerOpen(true);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <FontSizeContext.Provider value={fontSize}>
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", position: "relative" }}>
      {wallpaper?.dataUrl ? (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          filter: appBlur > 0 ? `blur(${appBlur}px)` : "none",
          transition: "filter .2s",
        }}>
          <div style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${wallpaper.dataUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            filter: getWallpaperImageFilter(wallpaper),
            opacity: ((wallpaper.imgOpacity ?? 100) / 100).toFixed(3),
            transform: (wallpaper.imgBlur || appBlur) ? "scale(1.05)" : "none", // prevent blur edge artifacts
          }} />
        </div>
      ) : (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          filter: appBlur > 0 ? `blur(${appBlur}px)` : "none",
          transform: appBlur > 0 ? "scale(1.05)" : "none",
          transition: "filter .2s",
        }}>
          <AuroraCanvas />
          <Grain />
        </div>
      )}

      <div
        style={{
          display: "flex",
          flex: 1,
          minWidth: 0,
          height: "100%",
        }}
      >
      {/* Sidebar */}
      <div
        style={{
          width: sidebarOpen ? 264 : 0,
          minWidth: sidebarOpen ? 264 : 0,
          borderRight: sidebarOpen ? "1px solid rgba(255,255,255,0.025)" : "none",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 10,
          ...getPaneSurfaceStyle(Boolean(wallpaper?.dataUrl), {
            hoverOpacity: clampNumber(sidebarActiveOpacity * 0.6, 0.8, sidebarActiveOpacity),
            activeOpacity: sidebarActiveOpacity,
          }),
          backdropFilter: wallpaper?.dataUrl ? "saturate(1.1)" : "blur(56px) saturate(1.1)",
          transition: "all .35s cubic-bezier(.16,1,.3,1)",
          overflow: "hidden",
        }}
      >
        <Sidebar
          convos={convosForSidebar}
          active={active}
          onSelect={handleSelect}
          onNew={handleNew}
          onDelete={handleDelete}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          cwd={activeConvo?.cwd === null ? (draftsPath || undefined) : (activeConvo?.cwd || cwd)}
          onPickFolder={handlePickFolder}
          onOpenSettings={() => setShowSettings(true)}
          onOpenProjectManager={() => window.api?.openProjectManager()}
          projects={projects}
          onToggleProjectCollapse={handleToggleProjectCollapse}
          onHideProject={handleHideProject}
          onNewInProject={handleNewInProject}
          draftsCollapsed={draftsCollapsed}
          onToggleDraftsCollapsed={() => setDraftsCollapsed(p => !p)}
          developerMode={developerMode}
        />
      </div>

      {/* Main content: Settings or Chat */}
      {showSettings ? (
        <Settings
          wallpaper={wallpaper}
          onWallpaperChange={setWallpaper}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          defaultPrBranch={defaultPrBranch}
          onDefaultPrBranchChange={setDefaultPrBranch}
          appBlur={appBlur}
          onAppBlurChange={setAppBlur}
          appOpacity={appOpacity}
          onAppOpacityChange={setAppOpacity}
          developerMode={developerMode}
          onDeveloperModeChange={setDeveloperMode}
          onClose={() => setShowSettings(false)}
        />
      ) : (
        <ChatArea
          convo={convo}
          onSend={handleSend}
          onCancel={handleCancel}
          onEdit={handleEdit}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          sidebarOpen={sidebarOpen}
          onNew={handleNew}
          onModelChange={handleModelChange}
          defaultModel={defaultModel}
          queuedMessages={queuedMessages}
          onToggleTerminal={handleToggleTerminal}
          terminalOpen={terminal.drawerOpen}
          terminalCount={terminal.sessions.length}
          wallpaper={wallpaper}
          cwd={terminalCwd}
          onRefocusTerminal={terminal.focusActiveSession}
          onCwdChange={(newCwd) => {
            setCwd(newCwd);
            if (active) {
              // Assign a new sessionId so next message starts a fresh Claude session
              // in the new cwd instead of trying to --resume the old one
              setConvoList((p) =>
                p.map((c) => c.id === active ? { ...c, cwd: newCwd } : c)
              );
            }
          }}
          showNewChatCard={showNewChatCard}
          onCreateChat={handleCreateChat}
          onCancelNewChat={() => setShowNewChatCard(false)}
          allCwdRoots={allCwdRoots}
          projects={projects}
          defaultPrBranch={defaultPrBranch}
          onControlChange={handleControlChange}
          canControlTarget={canControlTarget}
          developerMode={developerMode}
        />
      )}

      {/* Terminal drawer */}
      <TerminalDrawer
        sessions={terminal.sessions}
        activeSession={terminal.activeSession}
        onSelectSession={terminal.setActiveSession}
        onCreateSession={terminal.createSession}
        cwd={terminalCwd}
        onKillSession={terminal.killSession}
        onSendInput={terminal.sendInput}
        onResizeSession={terminal.resizeSession}
        drawerOpen={terminal.drawerOpen}
        onToggleDrawer={() => terminal.setDrawerOpen((o) => !o)}
        registerTerminal={terminal.registerTerminal}
        unregisterTerminal={terminal.unregisterTerminal}
        wallpaper={wallpaper}
      />
      </div>
    </div>
    </FontSizeContext.Provider>
  );
}
