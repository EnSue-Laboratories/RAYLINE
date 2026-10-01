import { memo, useContext, useMemo } from "react";
import { useAppSetting } from "../../store/appSettings";
import { useActiveConvo } from "../../store/convoList";
import { cancelActiveRun, changeCwd, changeEffort, changeModel, closeTab } from "../actions/conversations";
import { cancelNewChat, createChat } from "../actions/create";
import { sendFromComposer } from "../actions/compose";
import { editAndResendMessage } from "../actions/edit";
import { selectConversation } from "../actions/navigation";
import { applyControlChange, canControlTarget } from "../actions/settings";
import { refocusTerminal, resolveTerminalCwd, toggleTerminal } from "../actions/terminal";
import { ChatArea, type ChatAreaConversation } from "../componentBoundaries";
import { useProjectsDerived } from "../derived/projects";
import { useVisibleTabs } from "../derived/store";
import { useRuntimeSetup } from "../hooks/useRuntimeSetup";
import { LiveConversationsContext, selectLiveConversation } from "../stores/live";
import { useModelsField } from "../stores/models";
import { respondPermission, usePermissionRequestsFor } from "../stores/permissions";
import { removeQueuedMessage, updateQueuedMessage, useQueuedMessagesFor } from "../stores/queue";
import { useTerminalSessionCount, useTerminalWindowOpen } from "../stores/terminal";
import { useTranscriptLoading } from "../stores/transcripts";
import { useUi } from "../stores/ui";
import { useTranslator } from "../../contexts/LocaleContext";

const MemoChatArea = memo(ChatArea);

/**
 * Active conversation view. Reads live data from the agent context (so it
 * renders inside the stream's transition) and hands ChatArea a `convo`
 * object whose identity only changes when the active conversation changes;
 * every handler is a stable module function.
 */
export const ChatPane = memo(function ChatPane() {
  const live = useContext(LiveConversationsContext);
  const activeConvo = useActiveConvo();
  const activeId = activeConvo?.id ?? null;
  const data = selectLiveConversation(live, activeId);
  const { messages, isStreaming, error } = data;

  const convo = useMemo<ChatAreaConversation | null>(
    () => (activeConvo ? { ...activeConvo, msgs: messages, isStreaming, error } : null),
    [activeConvo, messages, isStreaming, error],
  );

  const sidebarOpen = useUi("sidebarOpen");
  const draftsPath = useUi("draftsPath");
  const platform = useUi("platform");
  const showNewChatCard = useUi("showNewChatCard");
  const newChatEffort = useUi("newChatEffort");
  const sidebarTerminalOpen = useUi("sidebarTerminalOpen");
  const defaultModel = useAppSetting("defaultModel");
  const wallpaper = useAppSetting("wallpaper");
  const appCwd = useAppSetting("cwd");
  const defaultPrBranch = useAppSetting("defaultPrBranch");
  const coauthorEnabled = useAppSetting("coauthorEnabled");
  const coauthorTrailer = useAppSetting("coauthorTrailer");
  const developerMode = useAppSetting("developerMode");
  const locale = useAppSetting("locale");
  const sidebarTerminalEnabled = useAppSetting("sidebarTerminalEnabled");
  const queuedMessages = useQueuedMessagesFor(activeId);
  const permissionRequests = usePermissionRequestsFor(activeId);
  const tabs = useVisibleTabs();
  const terminalWindowOpen = useTerminalWindowOpen();
  const terminalCount = useTerminalSessionCount();
  const chooserProjects = useProjectsDerived("chooserProjects");
  const cwdRoots = useProjectsDerived("cwdRoots");
  const newChatDefaultCwd = useProjectsDerived("newChatDefaultCwd");
  const remoteModels = useModelsField("remoteModels");
  const runtimeSetup = useRuntimeSetup();
  const transcriptLoading = useTranscriptLoading(activeId);
  const activeCwd: string | null | undefined = activeConvo ? activeConvo.cwd : undefined;

  return (
    <>
      <MemoChatArea
        convo={convo}
        onSend={sendFromComposer}
        onCancel={cancelActiveRun}
        onEdit={editAndResendMessage}
        sidebarOpen={sidebarOpen}
        onModelChange={changeModel}
        defaultModel={defaultModel}
        effort={activeConvo ? activeConvo.effort ?? null : newChatEffort}
        onEffortChange={changeEffort}
        queuedMessages={queuedMessages}
        onUpdateQueuedMessage={updateQueuedMessage}
        onRemoveQueuedMessage={removeQueuedMessage}
        permissionRequests={permissionRequests}
        onRespondPermission={respondPermission}
        onToggleTerminal={toggleTerminal}
        terminalOpen={sidebarTerminalEnabled ? sidebarTerminalOpen : terminalWindowOpen}
        terminalCount={terminalCount}
        tabs={tabs}
        activeTabId={activeId}
        onSelectTab={selectConversation}
        onCloseTab={closeTab}
        wallpaper={wallpaper}
        cwd={resolveTerminalCwd(activeCwd, draftsPath, appCwd)}
        draftsPath={draftsPath}
        onRefocusTerminal={refocusTerminal}
        onCwdChange={changeCwd}
        showNewChatCard={showNewChatCard}
        onCreateChat={createChat}
        onCancelNewChat={cancelNewChat}
        allCwdRoots={cwdRoots}
        projects={chooserProjects}
        defaultPrBranch={defaultPrBranch}
        newChatDefaultCwd={newChatDefaultCwd}
        coauthorEnabled={coauthorEnabled}
        coauthorTrailer={coauthorTrailer}
        onControlChange={applyControlChange}
        canControlTarget={canControlTarget}
        developerMode={developerMode}
        windowControlsVisible={platform === "win32"}
        locale={locale}
        runtimeSetup={runtimeSetup}
        extraModels={remoteModels}
      />
      {transcriptLoading && !showNewChatCard ? <TranscriptLoadingNotice /> : null}
    </>
  );
});

/** Shown while a lazily loaded transcript is read from disk. */
function TranscriptLoadingNotice() {
  // TODO(i18n): a dedicated "chat.loadingConversation" key (requested from data-i18n).
  const t = useTranslator();
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        top: 64,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 5,
        padding: "6px 12px",
        borderRadius: 999,
        fontSize: 12,
        color: "var(--text-secondary, rgba(255,255,255,0.6))",
        background: "var(--pane-hover, rgba(255,255,255,0.06))",
        pointerEvents: "none",
      }}
    >
      {t("newChat.loading")}
    </div>
  );
}
