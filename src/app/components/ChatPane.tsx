import { memo } from "react";
import { useAppSetting } from "../../store/appSettings";
import { useActiveConvo } from "../../store/convoList";
import { cancelActiveRun, changeCwd, changeEffort, changeModel, closeTab } from "../actions/conversations";
import { cancelNewChat, createChat } from "../actions/create";
import { sendFromComposer } from "../actions/compose";
import { editAndResendMessage } from "../actions/edit";
import { selectConversation } from "../actions/navigation";
import { applyControlChange, canControlTarget } from "../actions/settings";
import { refocusTerminal, resolveTerminalCwd, toggleTerminal } from "../actions/terminal";
import { useProjectsDerived } from "../derived/projects";
import { useVisibleTabs } from "../derived/store";
import { useRuntimeSetup } from "../hooks/useRuntimeSetup";
import { useModelsField } from "../stores/models";
import { respondPermission, usePermissionRequestsFor } from "../stores/permissions";
import { removeQueuedMessage, updateQueuedMessage, useQueuedMessagesFor } from "../stores/queue";
import { useTerminalSessionCount, useTerminalWindowOpen } from "../stores/terminal";
import { useTranscriptLoading } from "../stores/transcripts";
import { useUi } from "../stores/ui";
import { useTranslator } from "../../contexts/LocaleContext";
import ChatArea from "../../components/ChatArea";

const MemoChatArea = memo(ChatArea);

/**
 * Active conversation view. ChatArea reads live messages and stream status
 * from the conversations store by id (narrow selectors), so this pane does
 * not re-render on stream flushes; `convo` is the sidebar row itself and
 * every handler is a stable module function.
 */
export const ChatPane = memo(function ChatPane() {
  const activeConvo = useActiveConvo();
  const activeId = activeConvo?.id ?? null;

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
        convo={activeConvo}
        onSend={sendFromComposer}
        onCancel={cancelActiveRun}
        onEdit={editAndResendMessage}
        sidebarOpen={sidebarOpen}
        onModelChange={changeModel}
        defaultModel={defaultModel}
        effort={activeConvo && !showNewChatCard ? activeConvo.effort ?? null : newChatEffort}
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
      {t("chat.loadingConversation")}
    </div>
  );
}
