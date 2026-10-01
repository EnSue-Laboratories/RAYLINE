import { type CSSProperties, type KeyboardEvent, type Ref } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { MODEL_INSTALL_GUIDES, type InstalledProviders } from "@shared/models";
import type { RuntimeProviderId } from "@shared/providers/types";
import type { FontScale } from "../../contexts/FontSizeContext";
import type { Translator } from "../../i18n";
import { groupByProvider, optionDomId, providerGroupLabel, type MenuPosition, type PickerOption, type PickerPurpose } from "./catalogView";
import { ModelOptionRow } from "./ModelOptionRow";

const INSTALL_GUIDE_NAMES: Readonly<Partial<Record<RuntimeProviderId, string>>> = {
  claude: "Claude Code",
  codex: "Codex CLI",
  grok: "Grok",
  agy: "Antigravity",
  opencode: "OpenCode",
};

function installGuideEntries(installed: InstalledProviders): [RuntimeProviderId, string][] {
  return (Object.keys(MODEL_INSTALL_GUIDES) as RuntimeProviderId[])
    .filter((provider) => installed[provider] === false)
    .map((provider) => [provider, MODEL_INSTALL_GUIDES[provider] ?? ""]);
}

interface ModelMenuProps {
  s: FontScale;
  t: Translator;
  menuId: string;
  menuRef: Ref<HTMLDivElement>;
  inputRef: Ref<HTMLInputElement>;
  label: string;
  position: MenuPosition;
  zIndex: number;
  query: string;
  options: readonly PickerOption[];
  selectedId: string | null;
  activeId: string | null;
  purpose: PickerPurpose;
  installed: InstalledProviders;
  extraError: boolean;
  extraLoading: boolean;
  onQueryChange: (query: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onHover: (id: string) => void;
  onChoose: (option: PickerOption) => void;
  onOpenGuide: (url: string) => void;
}

/** The picker popover: search box, provider groups, install / status footer. */
export function ModelMenu({
  s,
  t,
  menuId,
  menuRef,
  inputRef,
  label,
  position,
  zIndex,
  query,
  options,
  selectedId,
  activeId,
  purpose,
  installed,
  extraError,
  extraLoading,
  onQueryChange,
  onKeyDown,
  onHover,
  onChoose,
  onOpenGuide,
}: ModelMenuProps) {
  const listId = `${menuId}-list`;
  const groups = groupByProvider(options);
  const footerAction: CSSProperties = {
    display: "block",
    width: "100%",
    padding: "9px 12px",
    border: 0,
    borderRadius: 6,
    background: "transparent",
    color: "var(--text-secondary)",
    textAlign: "left",
    cursor: "pointer",
    fontSize: s(11),
  };
  const style: CSSProperties = {
    ...position,
    position: "fixed",
    zIndex,
    display: "flex",
    flexDirection: "column",
    background: "var(--surface-glass)",
        // Small, short-lived popover: the blur is cheap and keeps text behind it from bleeding through.
        backdropFilter: "blur(24px) saturate(1.2)",
        WebkitBackdropFilter: "blur(24px) saturate(1.2)",
    border: "1px solid var(--pane-border)",
    borderRadius: 10,
    padding: 4,
    boxShadow: "var(--shadow-md)",
    animation: "dropIn .15s ease",
    WebkitAppRegion: "no-drag",
  };

  return createPortal(
    <div
      ref={menuRef}
      id={menuId}
      role="dialog"
      aria-label={label}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={style}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 9px",
          flexShrink: 0,
          borderBottom: "1px solid var(--pane-border)",
          color: "var(--text-secondary)",
        }}
      >
        <Search size={14} aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-label={t("models.search")}
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId !== null ? optionDomId(menuId, activeId) : undefined}
          value={query}
          placeholder={t("models.search")}
          onChange={(event) => onQueryChange(event.target.value)}
          style={{
            minWidth: 0,
            width: "100%",
            border: 0,
            outline: "none",
            background: "transparent",
            color: "var(--text-primary)",
            fontSize: s(12),
            fontFamily: "var(--font-ui)",
          }}
        />
      </div>
      <div id={listId} role="listbox" aria-label={label} style={{ overflowY: "auto", minHeight: 0 }}>
        {groups.map(({ provider, models }, groupIndex) => {
          const groupLabel = providerGroupLabel(provider, t("dispatch.inheritGroup"));
          return (
            <div key={provider} role="group" aria-label={groupLabel}>
              {groupIndex > 0 && <div style={{ height: 1, background: "var(--control-bg)", margin: "4px 8px" }} />}
              <div
                style={{
                  padding: groupIndex === 0 ? "6px 10px 2px" : "4px 10px 2px",
                  fontSize: s(8),
                  color: "color-mix(in srgb, var(--text-primary) 22%, transparent)",
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {groupLabel}
              </div>
              {models.map((option) => (
                <ModelOptionRow
                  key={option.id || "inherit"}
                  s={s}
                  t={t}
                  option={option}
                  label={option.model.name}
                  domId={optionDomId(menuId, option.id)}
                  selected={option.id === selectedId}
                  active={option.id === activeId}
                  onHover={onHover}
                  onChoose={onChoose}
                />
              ))}
            </div>
          );
        })}
        {options.length === 0 && (
          <div role="status" style={{ padding: 14, fontSize: s(12), color: "var(--text-secondary)" }}>
            {t("models.noResults")}
          </div>
        )}
      </div>
      {purpose === "planner" && (
        <div role="note" style={{ padding: "8px 10px", fontSize: s(10), color: "var(--text-muted)", borderTop: "1px solid var(--pane-border)" }}>
          {t("models.plannerHelp")}
        </div>
      )}
      {!query && (
        <div style={{ flexShrink: 0, borderTop: "1px solid var(--pane-border)" }}>
          {installGuideEntries(installed).map(([provider, url]) => (
            <button key={provider} type="button" style={footerAction} onClick={() => onOpenGuide(url)}>
              {t("models.install", { provider: INSTALL_GUIDE_NAMES[provider] ?? provider })}
            </button>
          ))}
          {(extraError || extraLoading) && (
            <div role="status" style={{ padding: "6px 12px", fontSize: s(10), color: "var(--text-muted)" }}>
              {extraError ? t("models.agentsUnavailable") : t("models.loadingAgents")}
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
