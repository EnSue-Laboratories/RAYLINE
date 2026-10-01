import { memo, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslator } from "../../contexts/LocaleContext";
import { getPaneInteractionStyle } from "../../utils/paneSurface";
import type { PmStateFilter, PmTab } from "../types";

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid var(--text-secondary)" : "2px solid transparent",
        color: active ? "var(--text-primary)" : hovered ? "var(--text-muted)" : "var(--text-subtle)",
        fontSize: 13,
        fontFamily: "var(--font-ui)",
        padding: "10px 16px",
        cursor: "pointer",
        transition: "color .15s, border-color .15s",
      }}
    >
      {label}
    </button>
  );
}

interface StateToggleProps {
  value: PmStateFilter;
  onChange: (value: PmStateFilter) => void;
  openLabel: string;
  closedLabel: string;
}

function StateToggle({ value, onChange, openLabel, closedLabel }: StateToggleProps) {
  const button = (label: string, option: PmStateFilter) => {
    const active = value === option;
    return (
      <button
        onClick={() => onChange(option)}
        style={{
          border: `1px solid ${active ? "var(--control-bg-active)" : "var(--pane-border)"}`,
          borderRadius: 6,
          color: active ? "var(--text-secondary)" : "var(--text-disabled)",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          letterSpacing: ".04em",
          padding: "4px 10px",
          cursor: "pointer",
          transition: "background .15s, color .15s, border-color .15s, box-shadow .15s, backdrop-filter .15s",
          ...getPaneInteractionStyle(active ? "active" : "idle"),
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {button(openLabel, "open")}
      {button(closedLabel, "closed")}
    </div>
  );
}

interface PmToolbarProps {
  activeTab: PmTab;
  stateFilter: PmStateFilter;
  canCreate: boolean;
  onTabChange: (tab: PmTab) => void;
  onStateFilterChange: (filter: PmStateFilter) => void;
  onCreate: () => void;
}

/** Issues / Pull requests tabs, "+ New" and the open / closed toggle. */
function PmToolbar({ activeTab, stateFilter, canCreate, onTabChange, onStateFilterChange, onCreate }: PmToolbarProps) {
  const t = useTranslator();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        borderBottom: "1px solid var(--control-bg)",
        marginBottom: 12,
        flexShrink: 0,
      }}
    >
      <TabButton label={t("pm.issues")} active={activeTab === "issues"} onClick={() => onTabChange("issues")} />
      <TabButton label={t("pm.pullRequests")} active={activeTab === "prs"} onClick={() => onTabChange("prs")} />
      <div style={{ flex: 1 }} />
      {canCreate && (
        <button
          onClick={onCreate}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "var(--pane-interaction-hover-fill, var(--pane-hover))",
            border: "1px solid var(--pane-border)",
            backdropFilter: "var(--pane-interaction-hover-filter, none)",
            boxShadow: "var(--pane-interaction-hover-shadow, none)",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: "pointer",
            color: "var(--text-muted)",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            letterSpacing: ".04em",
            marginRight: 8,
            transition: "background .15s, color .15s, box-shadow .15s, backdrop-filter .15s",
          }}
        >
          <Plus size={11} strokeWidth={2} /> {t("pm.new")}
        </button>
      )}
      <StateToggle
        value={stateFilter}
        openLabel={t("pm.filterOpen")}
        closedLabel={t("pm.filterClosed")}
        onChange={onStateFilterChange}
      />
    </div>
  );
}

export default memo(PmToolbar);
