import { memo, useState, type ReactNode } from "react";
import { FolderPlus, Plus, Search, Workflow } from "lucide-react";
import { NO_DRAG } from "./appRegion";
import { applyPaneInteractionStyle, getPaneInteractionStyle } from "../../utils/paneSurface";
import type { FontScale, Translator } from "./types";

function GitHubIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function MenuButton({ s, icon, label, onClick }: { s: FontScale; icon: ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 7,
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--sb-text)",
        fontSize: s(12),
        fontFamily: "var(--font-ui)",
        transition: "background .15s, color .15s, box-shadow .15s, backdrop-filter .15s",
        textAlign: "left",
      }}
      onMouseEnter={(e) => {
        applyPaneInteractionStyle(e.currentTarget, "hover");
        e.currentTarget.style.color = "var(--sb-text-hover)";
      }}
      onMouseLeave={(e) => {
        applyPaneInteractionStyle(e.currentTarget, "idle");
        e.currentTarget.style.color = "var(--sb-text)";
      }}
    >
      {icon}
      {label}
    </button>
  );
}

const LOADER_DOTS = [0, 1, 2] as const;

export interface SearchStatus {
  active: boolean;
  loading: boolean;
  resultCount: number;
}

interface SearchBoxProps {
  s: FontScale;
  t: Translator;
  value: string;
  status: SearchStatus;
  onChange: (value: string) => void;
  /** Blur with an empty query collapses the box back into the menu button. */
  onDismiss: () => void;
}

function SearchBox({ s, t, value, status, onChange, onDismiss }: SearchBoxProps) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "6px 10px",
          border: "1px solid " + (focused ? "var(--control-border)" : "var(--pane-border)"),
          borderRadius: 8,
          transition: "background .2s, color .2s, border-color .2s, box-shadow .2s, backdrop-filter .2s",
          ...(focused
            ? getPaneInteractionStyle("active")
            : { background: "var(--pane-elevated)", backdropFilter: "none", boxShadow: "none" }),
        }}
      >
        <span style={{ color: "var(--sb-text-mid)", flexShrink: 0, display: "flex" }}>
          <Search size={13} strokeWidth={1.5} />
        </span>
        <input
          type="text"
          placeholder={t("sidebar.searchPlaceholder")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (!value.trim()) onDismiss();
          }}
          autoFocus
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            color: "var(--sb-text-hover)",
            fontSize: s(11),
            fontFamily: "var(--font-mono)",
          }}
        />
      </div>
      {status.active && (
        <div
          style={{
            minHeight: 16,
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "0 2px 0 10px",
            fontSize: s(8.5),
            fontFamily: "var(--font-mono)",
            letterSpacing: ".08em",
            color: status.loading ? "var(--sb-text-search)" : "var(--sb-text-search-dim)",
          }}
        >
          {status.loading ? (
            <>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {LOADER_DOTS.map((index) => (
                  <span
                    key={index}
                    className="sidebar-search-loader-dot"
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: "currentColor",
                      animationDelay: `${index * 0.12}s`,
                    }}
                  />
                ))}
              </span>
              {t("sidebar.searchingChats")}
            </>
          ) : status.resultCount === 0 ? (
            t("sidebar.searchNoResults")
          ) : (
            t("sidebar.searchHits", { value: status.resultCount, suffix: status.resultCount === 1 ? "" : "S" })
          )}
        </div>
      )}
    </div>
  );
}

export interface SidebarMenuProps {
  s: FontScale;
  t: Translator;
  developerMode: boolean;
  hasConvos: boolean;
  searchOpen: boolean;
  searchValue: string;
  searchStatus: SearchStatus;
  onNew?: () => void;
  onOpenDispatch?: () => void;
  onOpenNewProject?: () => void;
  onOpenProjectManager?: () => void;
  onOpenSearch: () => void;
  onSearchChange: (value: string) => void;
  onDismissSearch: () => void;
}

/** Top-of-sidebar actions plus the expandable chat search. */
function SidebarMenu({
  s,
  t,
  developerMode,
  hasConvos,
  searchOpen,
  searchValue,
  searchStatus,
  onNew,
  onOpenDispatch,
  onOpenNewProject,
  onOpenProjectManager,
  onOpenSearch,
  onSearchChange,
  onDismissSearch,
}: SidebarMenuProps) {
  return (
    <div style={{ padding: "0 12px 14px", display: "flex", flexDirection: "column", gap: 2, ...NO_DRAG }}>
      <MenuButton s={s} icon={<Plus size={15} strokeWidth={1.5} />} label={t("sidebar.newChat")} onClick={onNew} />
      <MenuButton s={s} icon={<Workflow size={15} strokeWidth={1.5} />} label={t("sidebar.dispatch")} onClick={onOpenDispatch} />
      <MenuButton s={s} icon={<FolderPlus size={15} strokeWidth={1.5} />} label={t("sidebar.newProject")} onClick={onOpenNewProject} />
      {developerMode && (
        <MenuButton s={s} icon={<GitHubIcon size={15} />} label={t("sidebar.githubProjects")} onClick={onOpenProjectManager} />
      )}
      {hasConvos && !searchOpen && (
        <MenuButton s={s} icon={<Search size={15} strokeWidth={1.5} />} label={t("sidebar.search")} onClick={onOpenSearch} />
      )}
      {searchOpen && (
        <SearchBox s={s} t={t} value={searchValue} status={searchStatus} onChange={onSearchChange} onDismiss={onDismissSearch} />
      )}
    </div>
  );
}

export default memo(SidebarMenu);
