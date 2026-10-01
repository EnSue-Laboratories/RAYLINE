/**
 * Chat pane (public entry). Pieces live in ./chat/: header, windowed
 * transcript (store selectors), composer, scroll manager.
 *
 * Every handler from App is wrapped in a stable proxy before it reaches a
 * memoized child, and the transcript reads messages from the conversations
 * store by id, so a stream flush re-renders only the streaming message.
 */
import { type DragEvent, lazy, Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslator } from "../contexts/LocaleContext";
import { useStableCallback } from "../hooks/useStableCallback";
import { isMulticaModelId } from "../data/models";
import { createTranslator } from "../i18n";
import { getConversation, useConversationStatus, useMessageIds } from "../store/conversations";
import { getPaneSurfaceStyle } from "../utils/paneSurface";
import type { ExportableConversation } from "../utils/exportHelpers";
import useGitStatus from "../hooks/useGitStatus";
import ChatComposer, { type ComposerHandle } from "./chat/ChatComposer";
import ChatHeader from "./chat/ChatHeader";
import ChatTranscript from "./chat/ChatTranscript";
import { composerDraftScope } from "./chat/composerDraft";
import { branchAttention, isDraftContext, shellLocationLabel } from "./chat/logic";
import ScrollToBottomButton from "./chat/ScrollToBottomButton";
import type { ChatAreaProps } from "./chat/types";
import type { NewChatRequest } from "./NewChatCard";
import type { TabStripTab } from "./sidebar/tabStrip";
import { useOptionalStableCallback } from "./chat/useOptionalStableCallback";
import { useScrollManager } from "./chat/useScrollManager";
import EmptyState from "./EmptyState";
import SelectionToolbar from "./SelectionToolbar";
import WindowDragSpacer from "./WindowDragSpacer";

export type { ChatAreaConversation, ChatAreaProps, ChatRuntimeSetup, CreateChatRequest, PermissionResponseInput, SendHandler } from "./chat/types";

// Only shown on first run / for a new chat: keep them out of the startup bundle.
const NewChatCard = lazy(() => import("./NewChatCard"));
const RuntimeSetupCard = lazy(() => import("./RuntimeSetupCard"));

const NO_TABS: readonly TabStripTab[] = [];

export default function ChatArea(props: ChatAreaProps) {
  const {
    convo,
    sidebarOpen,
    defaultModel,
    wallpaper,
    cwd = null,
    draftsPath = null,
    showNewChatCard = false,
    newChatDefaultCwd = null,
    developerMode = true,
    windowControlsVisible = false,
    locale,
    runtimeSetup = null,
  } = props;
  const contextT = useTranslator();
  // An explicit locale prop wins (App passes it; translators are cached per locale).
  const t = locale ? createTranslator(locale) : contextT;
  const hasWallpaper = Boolean(wallpaper?.dataUrl);
  const convoId = convo?.id ?? null;
  const messageIds = useMessageIds(convoId);
  const { isStreaming } = useConversationStatus(convoId);
  const { scrollRef, endRef, followingRef, setMessageBodyNode, messageBodyRef, showScrollToBottom, scrollToBottom } = useScrollManager(convoId, messageIds.length);
  const composerApiRef = useRef<ComposerHandle>(null);

  // Stable proxies: App re-creates most of these on every render.
  const onSend = useStableCallback(props.onSend);
  const onCancel = useStableCallback(props.onCancel);
  const onModelChange = useStableCallback(props.onModelChange);
  // The effort picked in the card reaches createChat through onEffortChange
  // (App consumes it once when creating), so the request is passed through.
  const onCreateChat = useStableCallback((request: NewChatRequest) => props.onCreateChat(request));
  const onEdit = useOptionalStableCallback(props.onEdit);
  const onControlChange = useOptionalStableCallback(props.onControlChange);
  const canControlTargetProxy = useStableCallback((target: string) => Boolean(props.canControlTarget?.(target)));
  const canControlTarget = props.canControlTarget ? canControlTargetProxy : undefined;
  const onEffortChange = useOptionalStableCallback(props.onEffortChange);
  const onCwdChange = useOptionalStableCallback(props.onCwdChange);
  const onRefocusTerminal = useOptionalStableCallback(props.onRefocusTerminal);
  const onToggleTerminal = useOptionalStableCallback(props.onToggleTerminal);
  const onSelectTab = useOptionalStableCallback(props.onSelectTab);
  const onCloseTab = useOptionalStableCallback(props.onCloseTab);
  const onCancelNewChat = useOptionalStableCallback(props.onCancelNewChat);
  const onRespondPermission = useOptionalStableCallback(props.onRespondPermission);
  const onUpdateQueuedMessage = useOptionalStableCallback(props.onUpdateQueuedMessage);
  const onRemoveQueuedMessage = useOptionalStableCallback(props.onRemoveQueuedMessage);
  const handleAnswer = useCallback((text: string) => void onSend(text), [onSend]);
  const handlePickFolder = useCallback(async () => (await window.api?.pickFolder?.()) ?? null, []);
  const handleQuote = useCallback((text: string) => composerApiRef.current?.quote(text), []);

  const modelId = convo?.model || defaultModel || "sonnet";
  const draftContext = showNewChatCard ? newChatDefaultCwd == null : convo ? isDraftContext(convo.cwd, draftsPath) : false;
  const { status: gitStatus } = useGitStatus(cwd);
  const branch = branchAttention(gitStatus);
  // Messages are read when exporting (getter), so streaming never re-renders
  // the header; the object changes only when messages are added / removed.
  const exportable = useMemo<ExportableConversation | null>(() => {
    if (!convo || messageIds.length === 0) return null;
    const id = convo.id;
    return {
      id,
      title: convo.title,
      model: convo.model,
      cwd: convo.cwd,
      get msgs() {
        return getConversation(id).messages;
      },
    };
  }, [convo, messageIds]);
  const setupRequired = Boolean(runtimeSetup?.required);
  const draftScope = composerDraftScope(convoId, cwd || draftsPath || newChatDefaultCwd);

  // Dropping a file outside the composer's drop zone must not navigate away.
  useEffect(() => {
    const preventNav = (event: Event): void => event.preventDefault();
    window.addEventListener("dragover", preventNav);
    window.addEventListener("drop", preventNav);
    return () => {
      window.removeEventListener("dragover", preventNav);
      window.removeEventListener("drop", preventNav);
    };
  }, []);

  const renderBody = () => {
    if (runtimeSetup?.required) {
      return (
        <Suspense fallback={null}>
          <RuntimeSetupCard
            state={runtimeSetup}
            platform={runtimeSetup.platform}
            onRunCommand={runtimeSetup.onRunCommand}
            onRefresh={runtimeSetup.onRefresh}
            onConfigureOpenCode={runtimeSetup.onConfigureOpenCode}
          />
        </Suspense>
      );
    }
    if (showNewChatCard) {
      return (
        <Suspense fallback={null}>
          <NewChatCard
            key={newChatDefaultCwd || "drafts"}
            defaultCwd={newChatDefaultCwd}
            defaultModel={modelId}
            defaultBranch={props.defaultPrBranch}
            allCwdRoots={props.allCwdRoots}
            projects={props.projects}
            onPickFolder={handlePickFolder}
            onCreateChat={onCreateChat}
            onCancel={onCancelNewChat}
            developerMode={developerMode}
            extraModels={props.extraModels}
            effort={props.effort}
            onEffortChange={onEffortChange}
            locale={locale}
          />
        </Suspense>
      );
    }
    if (!convo || messageIds.length === 0) return <EmptyState model={modelId} />;
    return (
      <ChatTranscript
        key={convo.id}
        conversationId={convo.id}
        modelId={modelId}
        wallpaper={wallpaper}
        onEdit={onEdit}
        onAnswer={handleAnswer}
        onControlChange={onControlChange}
        canControlTarget={canControlTarget}
        messageBodyRef={setMessageBodyNode}
        endRef={endRef}
        scrollRef={scrollRef}
        followingRef={followingRef}
      />
    );
  };

  const hasMessages = Boolean(convo) && messageIds.length > 0;

  return (
    <div
      style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 10, ...getPaneSurfaceStyle(hasWallpaper) }}
      onDrop={(event: DragEvent) => {
        event.stopPropagation();
        composerApiRef.current?.handleDrop(event);
        composerApiRef.current?.resetDragState();
      }}
      onDragEnter={(event) => composerApiRef.current?.handleDragEnter(event)}
      onDragOver={(event) => composerApiRef.current?.handleDragOver(event)}
      onDragLeave={(event) => composerApiRef.current?.handleDragLeave(event)}
    >
      {/* Drag region (Windows: keep custom window controls out of it). */}
      <div style={{ marginRight: windowControlsVisible ? 126 : 0 }}>
        <WindowDragSpacer reserveWindowsHeader={windowControlsVisible && !sidebarOpen} />
      </div>

      <ChatHeader
        t={t}
        locale={locale}
        title={convo ? convo.title : null}
        messageCount={convo ? messageIds.length : 0}
        exportable={exportable}
        showNewChatCard={showNewChatCard}
        developerMode={developerMode}
        isDraftContext={draftContext}
        sidebarOpen={sidebarOpen}
        windowControlsVisible={windowControlsVisible}
        tabs={props.tabs ?? NO_TABS}
        activeTabId={props.activeTabId ?? null}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        cwd={cwd}
        defaultPrBranch={props.defaultPrBranch}
        coauthorEnabled={props.coauthorEnabled ?? false}
        coauthorTrailer={props.coauthorTrailer ?? ""}
        onCwdChange={onCwdChange}
        onRefocusTerminal={onRefocusTerminal}
        modelId={modelId}
        onModelChange={onModelChange}
        effort={props.effort}
        onEffortChange={onEffortChange}
        extraModels={props.extraModels}
        onToggleTerminal={onToggleTerminal}
        terminalOpen={Boolean(props.terminalOpen)}
        terminalCount={props.terminalCount ?? 0}
      />

      <div
        ref={scrollRef}
        // Prepends compensate scrollTop themselves; native anchoring would double it.
        style={{ flex: 1, overflowY: "auto", overflowAnchor: "none", padding: "32px 28px", display: "flex", flexDirection: "column" }}
      >
        {renderBody()}
      </div>

      {!showNewChatCard && hasMessages && <SelectionToolbar onQuote={handleQuote} model={modelId} selectionRootRef={messageBodyRef} />}

      {!showNewChatCard && hasMessages && (
        <ScrollToBottomButton visible={showScrollToBottom} label={t("chatArea.scrollToBottom")} hasWallpaper={hasWallpaper} onClick={scrollToBottom} />
      )}

      {/* Composer owns urgent keystroke state; keyed per draft scope (PR #230). */}
      {!showNewChatCard && (
        <ChatComposer
          key={draftScope}
          composerRef={composerApiRef}
          draftScope={draftScope}
          onSend={onSend}
          onCancel={onCancel}
          isStreaming={isStreaming}
          setupRequired={setupRequired}
          shellLocation={shellLocationLabel(cwd)}
          permissionRequests={props.permissionRequests}
          onRespondPermission={onRespondPermission}
          queuedMessages={props.queuedMessages}
          onUpdateQueuedMessage={onUpdateQueuedMessage}
          onRemoveQueuedMessage={onRemoveQueuedMessage}
          isMulticaModel={isMulticaModelId(modelId)}
          branchNeedsAttention={branch.needsAttention}
          branchHintText={t(branch.hintKey)}
          convoId={convoId}
          hasWallpaper={hasWallpaper}
          t={t}
        />
      )}
    </div>
  );
}
