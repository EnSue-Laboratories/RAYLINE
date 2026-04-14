import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";

function GitHubIcon({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
import AuroraCanvas from "./components/AuroraCanvas";
import Grain from "./components/Grain";
import CreateForm from "./pm-components/CreateForm";
import RepoManager from "./pm-components/RepoManager";
import IssueList from "./pm-components/IssueList";
import PRList from "./pm-components/PRList";
import ItemDetail from "./pm-components/ItemDetail";

const iconBtnStyle = {
  width: 28,
  height: 28,
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.06)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background .15s, color .15s",
  padding: 0,
};

function RepoFilterItem({ label, active, onClick, removeMode }) {
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
        fontFamily: "system-ui, sans-serif",
        color: active
          ? "rgba(255,255,255,0.9)"
          : "rgba(255,255,255,0.45)",
        background: active
          ? "rgba(255,255,255,0.07)"
          : hovered
            ? "rgba(255,255,255,0.04)"
            : "transparent",
        transition: "background .15s, color .15s",
        textAlign: "left",
        marginBottom: 1,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      {removeMode && label !== "All" && hovered && (
        <X size={12} style={{ color: "rgba(200,80,80,0.7)", flexShrink: 0, marginLeft: 4 }} />
      )}
    </button>
  );
}

function TabButton({ label, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid rgba(255,255,255,0.8)" : "2px solid transparent",
        color: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
        fontSize: 13,
        fontFamily: "system-ui, sans-serif",
        padding: "10px 16px",
        cursor: "pointer",
        transition: "color .15s, border-color .15s",
        ...(hovered && !active ? { color: "rgba(255,255,255,0.6)" } : {}),
      }}
    >
      {label}
    </button>
  );
}

function StateToggle({ value, onChange }) {
  const btn = (label, val) => {
    const active = value === val;
    return (
      <button
        onClick={() => onChange(val)}
        style={{
          background: active ? "rgba(255,255,255,0.08)" : "transparent",
          border: "1px solid " + (active ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)"),
          borderRadius: 6,
          color: active ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.35)",
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: ".04em",
          padding: "4px 10px",
          cursor: "pointer",
          transition: "all .15s",
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {btn("OPEN", "open")}
      {btn("CLOSED", "closed")}
    </div>
  );
}

export default function ProjectManager() {
  const [repos, setRepos] = useState([]);
  const [activeTab, setActiveTab] = useState("issues");
  const [stateFilter, setStateFilter] = useState("open");
  const [repoFilter, setRepoFilter] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [authOk, setAuthOk] = useState(null);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const [wallpaper, setWallpaper] = useState(null);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(null); // null | "issue" | "pr"
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    window.ghApi.checkAuth().then(({ ok }) => setAuthOk(ok));
    window.ghApi.loadPmState().then(({ repos, wallpaper: wp }) => {
      setRepos(repos);
      if (wp?.path) {
        setWallpaper(wp);
        window.ghApi.readImage(wp.path).then((dataUrl) => {
          if (dataUrl) setWallpaper((prev) => prev ? { ...prev, dataUrl } : prev);
        });
      }
      setStateLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (stateLoaded) {
      window.ghApi.savePmState({ repos });
    }
  }, [repos]);

  const handleAddRepo = (repo) => {
    if (!repos.includes(repo)) {
      setRepos([...repos, repo]);
    }
  };

  const handleRemoveRepo = (repo) => {
    setRepos(repos.filter((r) => r !== repo));
    if (repoFilter === repo) setRepoFilter(null);
  };

  // Loading state
  if (authOk === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#000",
          color: "rgba(255,255,255,0.3)",
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        Checking authentication...
      </div>
    );
  }

  // Auth failed
  if (authOk === false) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 16,
          background: "#000",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <GitHubIcon size={48} />
        <div style={{ fontSize: 16, color: "rgba(255,255,255,0.6)" }}>
          GitHub CLI not authenticated
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
          Run{" "}
          <code
            style={{
              background: "rgba(255,255,255,0.06)",
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            gh auth login
          </code>{" "}
          in your terminal
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "#000",
        color: "rgba(255,255,255,0.85)",
        fontFamily: "system-ui, sans-serif",
        position: "relative",
      }}
    >
      {/* Background — wallpaper or aurora */}
      {wallpaper?.dataUrl ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${wallpaper.dataUrl})`,
            backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat",
            filter: wallpaper.imgBlur ? `blur(${wallpaper.imgBlur}px)` : "none",
            transform: wallpaper.imgBlur ? "scale(1.05)" : "none",
          }} />
          {(wallpaper.imgDarken > 0) && (
            <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${wallpaper.imgDarken / 100})` }} />
          )}
        </div>
      ) : (
        <>
          <AuroraCanvas />
          <Grain />
        </>
      )}

      {/* Drag region */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 52,
          WebkitAppRegion: "drag",
          zIndex: 100,
        }}
      />

      {/* Left sidebar */}
      <div
        style={{
          width: 200,
          minWidth: 200,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid rgba(255,255,255,0.025)",
          position: "relative",
          zIndex: 10,
          background: `rgba(0,0,0,${wallpaper?.dataUrl ? (wallpaper.opacity / 100) : 0.65})`,
          backdropFilter: wallpaper?.dataUrl ? "saturate(1.1)" : "blur(56px) saturate(1.1)",
        }}
      >
        {/* Spacer for traffic lights */}
        <div style={{ height: 52, flexShrink: 0 }} />

        {/* Header: title + add button */}
        <div
          style={{
            padding: "0 16px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              color: "rgba(255,255,255,0.5)",
              letterSpacing: ".08em",
            }}
          >
            REPOS
          </span>
          <button onClick={() => setShowAddRepo(true)} style={iconBtnStyle}>
            <Plus size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Repo filter list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 6px" }}>
          <RepoFilterItem
            label="All"
            active={repoFilter === null}
            onClick={() => setRepoFilter(null)}
          />
          {repos.map((r) => (
            <RepoFilterItem
              key={r}
              label={r.split("/")[1]}
              active={repoFilter === r}
              onClick={() =>
                removeMode ? handleRemoveRepo(r) : setRepoFilter(r)
              }
              removeMode={removeMode}
            />
          ))}
        </div>

        {/* Manage repos button */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          <button
            onClick={() => setRemoveMode(!removeMode)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              color: removeMode
                ? "rgba(200,80,80,0.6)"
                : "rgba(255,255,255,0.3)",
              letterSpacing: ".08em",
              padding: 0,
              transition: "color .2s",
            }}
          >
            {removeMode ? "DONE" : "MANAGE REPOS"}
          </button>
        </div>
      </div>

      {/* Right content area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
          zIndex: 10,
          background: `rgba(0,0,0,${wallpaper?.dataUrl ? (wallpaper.opacity / 100) : 0.65})`,
          backdropFilter: wallpaper?.dataUrl ? "saturate(1.1)" : "blur(56px) saturate(1.1)",
        }}
      >
        {/* Traffic light spacer */}
        <div style={{ height: 52, flexShrink: 0 }} />

        {/* Tab bar — hidden in detail view */}
        {!selectedItem && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 20px",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              marginBottom: 12,
              flexShrink: 0,
            }}
          >
            <TabButton
              label="Issues"
              active={activeTab === "issues"}
              onClick={() => {
                setActiveTab("issues");
                setSelectedItem(null);
              }}
            />
            <TabButton
              label="Pull Requests"
              active={activeTab === "prs"}
              onClick={() => {
                setActiveTab("prs");
                setSelectedItem(null);
              }}
            />
            <div style={{ flex: 1 }} />
            {repos.length > 0 && (
              <button
                onClick={() => setShowCreate(activeTab === "issues" ? "issue" : "pr")}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                  color: "rgba(255,255,255,0.5)", fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em",
                  marginRight: 8, transition: "all .15s",
                }}
              >
                <Plus size={11} strokeWidth={2} /> NEW
              </button>
            )}
            <StateToggle
              value={stateFilter}
              onChange={(v) => {
                setStateFilter(v);
                setSelectedItem(null);
              }}
            />
          </div>
        )}

        {/* Content: list or detail */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {selectedItem ? (
            <ItemDetail
              repo={selectedItem.repo}
              number={selectedItem.number}
              type={selectedItem.type}
              onBack={() => setSelectedItem(null)}
            />
          ) : activeTab === "issues" ? (
            <IssueList
              key={`issues-${refreshKey}`}
              repos={repos}
              stateFilter={stateFilter}
              repoFilter={repoFilter}
              onSelectItem={setSelectedItem}
            />
          ) : (
            <PRList
              key={`prs-${refreshKey}`}
              repos={repos}
              stateFilter={stateFilter}
              repoFilter={repoFilter}
              onSelectItem={setSelectedItem}
            />
          )}
        </div>
      </div>

      {/* Create issue/PR modal */}
      {showCreate && (
        <CreateForm
          repos={repos}
          type={showCreate}
          onClose={() => setShowCreate(null)}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {/* Add repo modal */}
      {showAddRepo && (
        <RepoManager
          repos={repos}
          onAdd={handleAddRepo}
          onClose={() => setShowAddRepo(false)}
        />
      )}
    </div>
  );
}
