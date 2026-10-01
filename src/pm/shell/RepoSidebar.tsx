import { memo, useState, type CSSProperties } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { useTranslator } from "../../contexts/LocaleContext";
import { getPaneInteractionStyle, getPaneSurfaceStyle } from "../../utils/paneSurface";
import { HoverIconButton } from "../boundary";

const iconBtnStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 6,
  border: "1px solid var(--pane-border)",
  background: "var(--pane-interaction-hover-fill, var(--pane-hover))",
  backdropFilter: "var(--pane-interaction-hover-filter, none)",
  boxShadow: "var(--pane-interaction-hover-shadow, none)",
  color: "var(--text-muted)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background .15s, color .15s, box-shadow .15s, backdrop-filter .15s",
  padding: 0,
};

const removeModeBtnStyle: CSSProperties = {
  ...iconBtnStyle,
  border: "1px solid var(--success-border)",
  background: "var(--success-bg)",
  boxShadow: "0 0 0 1px var(--success-ring) inset",
};

interface RepoFilterItemProps {
  label: string;
  active: boolean;
  onClick: () => void;
  removeMode?: boolean;
  isAll?: boolean;
}

function RepoFilterItem({ label, active, onClick, removeMode = false, isAll = false }: RepoFilterItemProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "6px 10px",
        borderRadius: 6,
        border: "none",
        cursor: "pointer",
        fontSize: 12,
        fontFamily: "var(--font-ui)",
        color: active ? "var(--text-primary)" : "var(--text-subtle)",
        transition: "background .15s, color .15s, box-shadow .15s, backdrop-filter .15s",
        textAlign: "left",
        marginBottom: 1,
        ...getPaneInteractionStyle(active ? "active" : hovered ? "hover" : "idle"),
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {removeMode && !isAll && hovered && <X size={12} style={{ color: "var(--danger-text)", flexShrink: 0, marginLeft: 4 }} />}
    </button>
  );
}

interface RepoSidebarProps {
  repos: string[];
  repoFilter: string | null;
  hasWallpaper: boolean;
  onFilter: (repo: string | null) => void;
  onRemoveRepo: (repo: string) => void;
  onAddRepo: () => void;
  onManageAccount: () => void;
}

/** Left column: repo filter list with edit (remove) / add buttons and the account link. */
function RepoSidebar({ repos, repoFilter, hasWallpaper, onFilter, onRemoveRepo, onAddRepo, onManageAccount }: RepoSidebarProps) {
  const t = useTranslator();
  const [removeMode, setRemoveMode] = useState(false);

  return (
    <div
      style={{
        width: 200,
        minWidth: 200,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--control-bg-soft)",
        position: "relative",
        zIndex: 10,
        ...getPaneSurfaceStyle(hasWallpaper),
        backdropFilter: hasWallpaper ? "saturate(1.1)" : "none",
      }}
    >
      {/* Spacer for traffic lights */}
      <div style={{ height: 52, flexShrink: 0 }} />

      <div style={{ padding: "0 16px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)", letterSpacing: ".08em" }}>{t("pm.repos")}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <HoverIconButton
            onClick={() => setRemoveMode(!removeMode)}
            ariaLabel={removeMode ? t("pm.doneEditingRepos") : t("pm.editRepos")}
            baseColor={removeMode ? "var(--success-text)" : "var(--text-muted)"}
            hoverColor={removeMode ? "var(--success-text-strong)" : "var(--text-primary)"}
            style={removeMode ? removeModeBtnStyle : iconBtnStyle}
          >
            {removeMode ? <Check size={12} strokeWidth={1.8} /> : <Pencil size={12} strokeWidth={1.6} />}
          </HoverIconButton>
          <HoverIconButton
            onClick={() => {
              setRemoveMode(false);
              onAddRepo();
            }}
            ariaLabel={t("pm.addRepo")}
            baseColor="var(--text-muted)"
            hoverColor="var(--text-primary)"
            style={{ ...iconBtnStyle, color: undefined }}
          >
            <Plus size={12} strokeWidth={1.5} />
          </HoverIconButton>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 6px" }}>
        <RepoFilterItem label={t("pm.allRepos")} active={repoFilter === null} onClick={() => onFilter(null)} isAll />
        {repos.map((repo) => (
          <RepoFilterItem
            key={repo}
            label={repo.split("/")[1] ?? repo}
            active={repoFilter === repo}
            onClick={() => (removeMode ? onRemoveRepo(repo) : onFilter(repo))}
            removeMode={removeMode}
          />
        ))}
      </div>

      <div style={{ padding: "12px 16px" }}>
        <button
          onClick={onManageAccount}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--text-faint)",
            letterSpacing: ".08em",
            padding: 0,
            textAlign: "left",
            transition: "color .2s",
          }}
        >
          {t("pm.manageAccount")}
        </button>
      </div>
    </div>
  );
}

export default memo(RepoSidebar);
