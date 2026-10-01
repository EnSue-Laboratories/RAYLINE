import { type CSSProperties, memo } from "react";
import { Terminal as TerminalIcon } from "lucide-react";
import type { EffortLevel, ModelDefinition } from "@shared/models/types";
import { useFontScale } from "../../contexts/FontSizeContext";
import type { Translator } from "../../i18n";
import type { ExportableConversation } from "../../utils/exportHelpers";
import { IS_MAC, SIDEBAR_CHROME_RAIL_LEFT, SIDEBAR_CHROME_RAIL_WIDTH } from "../../windowChrome";
import BranchSelector from "../BranchSelector";
import ExportConversationBtn from "../ExportConversationBtn";
import GitStatusPill from "../GitStatusPill";
import type { TabStripTab } from "../sidebar/tabStrip";
import TabStrip from "../TabStrip";
import ChatModelPicker from "./ChatModelPicker";

const NO_TABS: readonly TabStripTab[] = [];
const noop = (): void => {};

export interface ChatHeaderProps {
  t: Translator;
  locale?: string;
  /** Title + count are shown only for an open conversation. */
  title: string | null;
  messageCount: number;
  exportable: ExportableConversation | null;
  showNewChatCard: boolean;
  developerMode: boolean;
  isDraftContext: boolean;
  sidebarOpen: boolean;
  windowControlsVisible: boolean;
  tabs: readonly TabStripTab[];
  activeTabId: string | null;
  onSelectTab?: (id: string) => void;
  onCloseTab?: (id: string) => void;
  cwd: string | null;
  defaultPrBranch?: string | null;
  coauthorEnabled: boolean;
  coauthorTrailer: string;
  onCwdChange?: (cwd: string) => void;
  onRefocusTerminal?: () => void;
  modelId: string;
  onModelChange: (modelId: string) => void;
  effort?: EffortLevel | null;
  onEffortChange?: (effort: EffortLevel | null) => void;
  extraModels?: readonly ModelDefinition[];
  onToggleTerminal?: () => void;
  terminalOpen: boolean;
  terminalCount: number;
}

/** Tab strip, conversation title and the git / model / export / terminal controls. */
function ChatHeader(props: ChatHeaderProps) {
  const { t, showNewChatCard, developerMode, isDraftContext, sidebarOpen, windowControlsVisible, terminalOpen, terminalCount } = props;
  const s = useFontScale();
  const tabs = props.tabs.length > 0 ? props.tabs : NO_TABS;
  const showHeaderTabs = tabs.length > 0 && !showNewChatCard;
  const topTabsLeft = sidebarOpen ? 18 : IS_MAC ? SIDEBAR_CHROME_RAIL_LEFT + SIDEBAR_CHROME_RAIL_WIDTH + 16 : 18;
  const topTabsRight = windowControlsVisible ? 126 : 24;
  const headerLeftPadding = sidebarOpen ? 24 : IS_MAC ? 50 : 24;
  const showGit = !showNewChatCard && developerMode && !isDraftContext;
  const terminalButtonStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    width: terminalCount > 0 ? "auto" : 26,
    height: 23,
    padding: terminalCount > 0 ? "0 8px" : 0,
    borderRadius: 7,
    background: terminalOpen ? "var(--control-bg-active)" : "var(--control-bg)",
    border: `1px solid ${terminalOpen ? "var(--control-border-strong)" : "var(--pane-border)"}`,
    color: "var(--text-secondary)",
    cursor: "pointer",
    transition: "background .2s, border-color .2s",
  };

  return (
    <>
      {showHeaderTabs && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: topTabsLeft,
            right: topTabsRight,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            minWidth: 0,
            pointerEvents: "none",
            WebkitAppRegion: "no-drag",
          }}
        >
          <div style={{ flex: 1, minWidth: 0, pointerEvents: "auto" }}>
            <TabStrip tabs={tabs} activeId={props.activeTabId} onSelect={props.onSelectTab ?? noop} onClose={props.onCloseTab ?? noop} />
          </div>
        </div>
      )}

      <div
        style={{
          padding: `${showHeaderTabs ? 8 : 0}px 24px 12px ${headerLeftPadding}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "padding .16s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", maxWidth: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1, WebkitAppRegion: "no-drag" }}>
            {props.title !== null && !showNewChatCard && (
              <div style={{ animation: "dropIn .2s ease", minWidth: 0 }}>
                <div
                  style={{
                    fontSize: s(12.5),
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-ui)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 360,
                    letterSpacing: "0.01em",
                  }}
                >
                  {props.title}
                </div>
                <div style={{ fontSize: s(9), fontFamily: "var(--font-mono)", color: "var(--text-disabled)", marginTop: 2, letterSpacing: ".1em" }}>
                  {t("chatArea.messages", { count: props.messageCount })}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, WebkitAppRegion: "no-drag" }}>
            {showGit && (
              <GitStatusPill cwd={props.cwd} defaultPrBranch={props.defaultPrBranch} coauthorEnabled={props.coauthorEnabled} coauthorTrailer={props.coauthorTrailer} locale={props.locale} />
            )}
            {showGit && (
              <BranchSelector cwd={props.cwd} onCwdChange={props.onCwdChange} hasMessages={props.messageCount > 0} onRefocusTerminal={props.onRefocusTerminal} locale={props.locale} />
            )}
            {!showNewChatCard && (
              <ChatModelPicker value={props.modelId} onChange={props.onModelChange} extraModels={props.extraModels} effort={props.effort} onEffortChange={props.onEffortChange} />
            )}
            {!showNewChatCard && props.exportable && props.messageCount > 0 && <ExportConversationBtn convo={props.exportable} />}
            {!showNewChatCard && developerMode && props.onToggleTerminal && (
              <button
                type="button"
                onClick={props.onToggleTerminal}
                title={t("chatArea.toggleTerminal")}
                style={terminalButtonStyle}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = "var(--control-bg-active)";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = terminalOpen ? "var(--control-bg-active)" : "var(--control-bg)";
                }}
              >
                <TerminalIcon size={14} strokeWidth={1.5} />
                {terminalCount > 0 && <span style={{ fontSize: s(10), fontFamily: "var(--font-mono)", color: "inherit" }}>{terminalCount}</span>}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default memo(ChatHeader);
