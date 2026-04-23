import { useState, useEffect } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";

function GitHubIcon({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
import AuroraCanvas from "./components/AuroraCanvas";
import Grain from "./components/Grain";
import AuthModal from "./pm-components/AuthModal";
import AccountManager from "./pm-components/AccountManager";
import CreateForm from "./pm-components/CreateForm";
import RepoManager from "./pm-components/RepoManager";
import IssueList from "./pm-components/IssueList";
import PRList from "./pm-components/PRList";
import ItemDetail from "./pm-components/ItemDetail";
import HoverIconButton from "./components/HoverIconButton";
import { getPaneInteractionStyle, getPaneSurfaceStyle } from "./utils/paneSurface";
import { getWallpaperImageFilter, normalizeWallpaper } from "./utils/wallpaper";
import { createTranslator, detectDefaultLocale, normalizeLocale } from "./i18n";

const iconBtnStyle = {
  width: 24,
  height: 24,
  borderRadius: 6,
  border: "1px solid var(--pane-border)",
  background: "var(--pane-interaction-hover-fill, var(--pane-hover))",
  backdropFilter: "var(--pane-interaction-hover-filter, none)",
  boxShadow: "var(--pane-interaction-hover-shadow, none)",
  color: "rgba(255,255,255,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background .15s, color .15s, box-shadow .15s, backdrop-filter .15s",
  padding: 0,
};

function RepoFilterItem({ label, active, onClick, removeMode, isAll = false }) {
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
        transition: "background .15s, color .15s, box-shadow .15s, backdrop-filter .15s",
        textAlign: "left",
        marginBottom: 1,
        ...(active
          ? getPaneInteractionStyle("active")
          : hovered
            ? getPaneInteractionStyle("hover")
            : getPaneInteractionStyle("idle")),
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      {removeMode && !isAll && hovered && (
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

function StateToggle({ value, onChange, openLabel = "OPEN", closedLabel = "CLOSED" }) {
  const btn = (label, val) => {
    const active = value === val;
    return (
      <button
        onClick={() => onChange(val)}
        style={{
          border: "1px solid " + (active ? "rgba(255,255,255,0.1)" : "var(--pane-border)"),
          borderRadius: 6,
          color: active ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.35)",
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: ".04em",
          padding: "4px 10px",
          cursor: "pointer",
          transition: "background .15s, color .15s, border-color .15s, box-shadow .15s, backdrop-filter .15s",
          ...(active ? getPaneInteractionStyle("active") : getPaneInteractionStyle("idle")),
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {btn(openLabel, "open")}
      {btn(closedLabel, "closed")}
    </div>
  );
}

export default function ProjectManager() {
  const [locale, setLocale] = useState(() => detectDefaultLocale());
  const [repos, setRepos] = useState([]);
  const [activeTab, setActiveTab] = useState("issues");
  const [stateFilter, setStateFilter] = useState("open");
  const [repoFilter, setRepoFilter] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [authOk, setAuthOk] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [authModalMode, setAuthModalMode] = useState(null); // null | "signin" | "add"
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [showAccountManager, setShowAccountManager] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const [wallpaper, setWallpaper] = useState(null);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(null); // null | "issue" | "pr"
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [freshIssue, setFreshIssue] = useState(null);
  const [freshPR, setFreshPR] = useState(null);
  const t = createTranslator(locale);

  const refreshAuth = () =>
    window.ghApi.checkAuth().then(({ ok, user }) => {
      setAuthOk(ok);
      setAuthUser(ok ? user || null : null);
      return ok;
    });

  useEffect(() => {
    refreshAuth();
    Promise.all([
      window.ghApi.loadPmState(),
      window.ghApi.loadAppState ? window.ghApi.loadAppState().catch(() => null) : Promise.resolve(null),
    ]).then(([pmState, appState]) => {
      const { repos, wallpaper: wp } = pmState || {};
      setRepos(Array.isArray(repos) ? repos : []);
      if (appState?.locale) setLocale(normalizeLocale(appState.locale));
      if (wp?.path) {
        setWallpaper(normalizeWallpaper(wp));
        window.ghApi.readImage(wp.path).then((dataUrl) => {
          if (dataUrl) setWallpaper((prev) => (prev ? normalizeWallpaper({ ...prev, dataUrl }) : prev));
        });
      }
      setStateLoaded(true);
    });
  }, []);

  const handleAuthSuccess = async () => {
    await refreshAuth();
    setAuthModalMode(null);
    // Force lists and repo pickers to refetch under the new account.
    setSelectedItem(null);
    setRefreshSignal((k) => k + 1);
  };

  useEffect(() => {
    if (stateLoaded) {
      window.ghApi.savePmState({ repos });
    }
  }, [repos, stateLoaded]);

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
          background: "var(--pane-background)",
          color: "rgba(255,255,255,0.3)",
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        {t("pm.checkingAuth")}
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
          background: "var(--pane-background)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <GitHubIcon size={48} />
        <div style={{ fontSize: 16, color: "rgba(255,255,255,0.6)" }}>
          {t("pm.authMissingTitle")}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", maxWidth: 360, textAlign: "center" }}>
          {t("pm.authMissingBody")}
        </div>
        <button
          onClick={() => setAuthModalMode("signin")}
          style={{
            marginTop: 4,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 18px",
            borderRadius: 8,
            border: "1px solid var(--pane-border)",
            background: "rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.9)",
            fontSize: 13,
            fontFamily: "system-ui, sans-serif",
            cursor: "pointer",
          }}
        >
          <GitHubIcon size={14} /> {t("pm.signIn")}
        </button>
        {authModalMode && (
          <AuthModal
            mode={authModalMode}
            currentUser={authUser}
            onClose={() => setAuthModalMode(null)}
            onAuthSuccess={handleAuthSuccess}
            locale={locale}
          />
        )}
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
        background: "var(--pane-background)",
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
            filter: getWallpaperImageFilter(wallpaper),
            opacity: ((wallpaper.imgOpacity ?? 100) / 100).toFixed(3),
            transform: wallpaper.imgBlur ? "scale(1.05)" : "none",
          }} />
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
          ...getPaneSurfaceStyle(Boolean(wallpaper?.dataUrl)),
          backdropFilter: wallpaper?.dataUrl ? "saturate(1.1)" : "blur(56px) saturate(1.1)",
        }}
      >
        {/* Spacer for traffic lights */}
        <div style={{ height: 52, flexShrink: 0 }} />

        {/* Header: title + repo actions */}
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
            {t("pm.repos")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HoverIconButton
              onClick={() => setRemoveMode(!removeMode)}
              ariaLabel={removeMode ? t("pm.doneEditingRepos") : t("pm.editRepos")}
              baseColor={removeMode ? "rgba(120,230,150,0.9)" : "rgba(255,255,255,0.5)"}
              hoverColor={removeMode ? "rgba(150,245,170,1)" : "rgba(255,255,255,0.9)"}
              style={{
                ...iconBtnStyle,
                ...(removeMode
                  ? {
                    border: "1px solid rgba(120,230,150,0.22)",
                    background: "rgba(120,230,150,0.12)",
                    boxShadow: "0 0 0 1px rgba(120,230,150,0.06) inset",
                  }
                  : {}),
              }}
            >
              {removeMode
                ? <Check size={12} strokeWidth={1.8} />
                : <Pencil size={12} strokeWidth={1.6} />}
            </HoverIconButton>
            <HoverIconButton
              onClick={() => {
                setRemoveMode(false);
                setShowAddRepo(true);
              }}
              ariaLabel={t("pm.addRepo")}
              baseColor="rgba(255,255,255,0.5)"
              hoverColor="rgba(255,255,255,0.9)"
              style={{ ...iconBtnStyle, color: undefined }}
            >
              <Plus size={12} strokeWidth={1.5} />
            </HoverIconButton>
          </div>
        </div>

        {/* Repo filter list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 6px" }}>
          <RepoFilterItem
            label={t("pm.allRepos")}
            active={repoFilter === null}
            onClick={() => setRepoFilter(null)}
            isAll
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

        {/* Footer: account management */}
        <div
          style={{
            padding: "12px 16px",
          }}
        >
          <button
            onClick={() => setShowAccountManager(true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              color: "rgba(255,255,255,0.3)",
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

      {/* Right content area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
          zIndex: 10,
          ...getPaneSurfaceStyle(Boolean(wallpaper?.dataUrl)),
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
              label={t("pm.issues")}
              active={activeTab === "issues"}
              onClick={() => {
                setActiveTab("issues");
                setSelectedItem(null);
              }}
            />
            <TabButton
              label={t("pm.pullRequests")}
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
              background: "var(--pane-interaction-hover-fill, var(--pane-hover))", border: "1px solid var(--pane-border)",
              backdropFilter: "var(--pane-interaction-hover-filter, none)",
              boxShadow: "var(--pane-interaction-hover-shadow, none)",
              borderRadius: 6, padding: "4px 10px", cursor: "pointer",
              color: "rgba(255,255,255,0.5)", fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em",
                  marginRight: 8, transition: "background .15s, color .15s, box-shadow .15s, backdrop-filter .15s",
                }}
              >
                <Plus size={11} strokeWidth={2} /> {t("pm.new")}
              </button>
            )}
            <StateToggle
              value={stateFilter}
              openLabel={t("pm.filterOpen")}
              closedLabel={t("pm.filterClosed")}
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
              repos={repos}
              stateFilter={stateFilter}
              repoFilter={repoFilter}
              onSelectItem={setSelectedItem}
              refreshSignal={refreshSignal}
              freshItem={freshIssue}
            />
          ) : (
            <PRList
              repos={repos}
              stateFilter={stateFilter}
              repoFilter={repoFilter}
              onSelectItem={setSelectedItem}
              refreshSignal={refreshSignal}
              freshItem={freshPR}
              locale={locale}
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
          onCreated={(item) => {
            if (showCreate === "issue") setFreshIssue(item);
            else setFreshPR(item);
            setRefreshSignal((k) => k + 1);
          }}
          locale={locale}
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

      {/* Account manager modal */}
      {showAccountManager && (
        <AccountManager
          currentUser={authUser}
          onAddAccount={() => {
            setShowAccountManager(false);
            setAuthModalMode("add");
          }}
          onAccountSwitched={async () => {
            await refreshAuth();
            setSelectedItem(null);
            setRefreshSignal((k) => k + 1);
          }}
          onSignedOut={async () => {
            setShowAccountManager(false);
            setSelectedItem(null);
            await refreshAuth();
          }}
          onClose={() => setShowAccountManager(false)}
        />
      )}

      {/* Auth modal (sign in or switch account) */}
      {authModalMode && (
        <AuthModal
          mode={authModalMode}
          currentUser={authUser}
          onClose={() => setAuthModalMode(null)}
          onAuthSuccess={handleAuthSuccess}
          locale={locale}
        />
      )}
    </div>
  );
}
