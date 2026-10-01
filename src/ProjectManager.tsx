import { useState } from "react";
import AuthModal from "./pm-components/AuthModal";
import AccountManager from "./pm-components/AccountManager";
import CreateForm, { type CreatedItem } from "./pm-components/CreateForm";
import RepoManager from "./pm-components/RepoManager";
import IssueList from "./pm-components/IssueList";
import PRList from "./pm-components/PRList";
import ItemDetail from "./pm-components/ItemDetail";
import WindowControls from "./components/WindowControls";
import { LocaleProvider } from "./contexts/LocaleContext";
import { useStableCallback } from "./hooks/useStableCallback";
import { CheckingAuthScreen, SignInScreen } from "./pm/shell/AuthScreens";
import PmToolbar from "./pm/shell/PmToolbar";
import RepoSidebar from "./pm/shell/RepoSidebar";
import { usePmAuth } from "./pm/shell/usePmAuth";
import { usePmWindowState } from "./pm/shell/usePmWindowState";
import { dragRegionStyle } from "./pm/styles";
import type { AuthModalMode, FreshIssue, FreshPr, PmItemType, PmStateFilter, PmTab, SelectedItem } from "./pm/types";
import { getPaneSurfaceStyle } from "./utils/paneSurface";
import { getWallpaperImageFilter } from "./utils/wallpaper";

function matchesSelected(item: { _repo: string; number: number | null } | null, selected: SelectedItem): boolean {
  return Boolean(item && item._repo === selected.repo && item.number === selected.number);
}

/** Project Manager window: GitHub issues and PRs across the user's chosen repos. */
export default function ProjectManager() {
  const { authOk, authUser, refreshAuth } = usePmAuth();
  const { locale, setLocale, wallpaper, platform, repos, setRepos } = usePmWindowState();
  const [activeTab, setActiveTab] = useState<PmTab>("issues");
  const [stateFilter, setStateFilter] = useState<PmStateFilter>("open");
  const [repoFilter, setRepoFilter] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode | null>(null);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [showAccountManager, setShowAccountManager] = useState(false);
  const [showCreate, setShowCreate] = useState<PmItemType | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [freshIssue, setFreshIssue] = useState<FreshIssue | null>(null);
  const [freshPR, setFreshPR] = useState<FreshPr | null>(null);
  const showWindowControls = platform === "win32";
  const dragRegionRight = showWindowControls ? 126 : 0;
  const wallpaperUrl = wallpaper?.dataUrl;
  const hasWallpaper = Boolean(wallpaperUrl);
  const bumpRefresh = () => setRefreshSignal((k) => k + 1);

  const handleAuthSuccess = useStableCallback(async () => {
    await refreshAuth();
    setAuthModalMode(null);
    // Force lists and repo pickers to refetch under the new account.
    setSelectedItem(null);
    bumpRefresh();
  });

  const handleAddRepo = useStableCallback((repo: string) => {
    setRepos((prev) => (prev.includes(repo) ? prev : [...prev, repo]));
  });

  const handleRemoveRepo = useStableCallback((repo: string) => {
    setRepos((prev) => prev.filter((r) => r !== repo));
    if (repoFilter === repo) setRepoFilter(null);
  });

  const handleBackFromDetail = () => {
    if (selectedItem?.type === "issue") {
      setFreshIssue((item) => (matchesSelected(item, selectedItem) ? null : item));
    } else if (selectedItem?.type === "pr") {
      setFreshPR((item) => (matchesSelected(item, selectedItem) ? null : item));
    }
    setSelectedItem(null);
    bumpRefresh();
  };

  const handleCreated = (created: CreatedItem) => {
    if (created.type === "issue") setFreshIssue(created.item);
    else setFreshPR(created.item);
    bumpRefresh();
  };

  const handleTabChange = useStableCallback((tab: PmTab) => {
    setActiveTab(tab);
    setSelectedItem(null);
  });

  const handleStateFilterChange = useStableCallback((filter: PmStateFilter) => {
    setStateFilter(filter);
    setSelectedItem(null);
  });

  const openCreate = useStableCallback(() => setShowCreate(activeTab === "issues" ? "issue" : "pr"));
  const openAddRepo = useStableCallback(() => setShowAddRepo(true));
  const openAccountManager = useStableCallback(() => setShowAccountManager(true));
  const closeAuthModal = useStableCallback(() => setAuthModalMode(null));

  const authModal = authModalMode && (
    <AuthModal mode={authModalMode} currentUser={authUser} onClose={closeAuthModal} onAuthSuccess={() => void handleAuthSuccess()} />
  );

  let content;
  if (authOk === null) {
    content = <CheckingAuthScreen showWindowControls={showWindowControls} dragRegionRight={dragRegionRight} />;
  } else if (!authOk) {
    content = (
      <>
        <SignInScreen
          showWindowControls={showWindowControls}
          dragRegionRight={dragRegionRight}
          onSignIn={() => setAuthModalMode("signin")}
        />
        {authModal}
      </>
    );
  } else {
    content = (
      <div
        style={{
          display: "flex",
          height: "100vh",
          width: "100vw",
          overflow: "hidden",
          background: "var(--pane-background)",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-ui)",
          position: "relative",
        }}
      >
        <WindowControls visible={showWindowControls} />

        {/* Background — wallpaper only; the default pane surface is opaque. */}
        {wallpaperUrl ? (
          <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: `url(${wallpaperUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                filter: getWallpaperImageFilter(wallpaper),
                opacity: ((wallpaper?.imgOpacity ?? 100) / 100).toFixed(3),
                transform: wallpaper?.imgBlur ? "scale(1.05)" : "none",
              }}
            />
          </div>
        ) : null}

        {/* Drag region — leave the controls hit area clear on Windows */}
        <div style={{ ...dragRegionStyle, right: dragRegionRight }} />

        <RepoSidebar
          repos={repos}
          repoFilter={repoFilter}
          hasWallpaper={hasWallpaper}
          onFilter={setRepoFilter}
          onRemoveRepo={handleRemoveRepo}
          onAddRepo={openAddRepo}
          onManageAccount={openAccountManager}
        />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            position: "relative",
            zIndex: 10,
            ...getPaneSurfaceStyle(hasWallpaper),
            backdropFilter: hasWallpaper ? "saturate(1.1)" : "none",
          }}
        >
          {/* Traffic light spacer */}
          <div style={{ height: 52, flexShrink: 0 }} />

          {!selectedItem && (
            <PmToolbar
              activeTab={activeTab}
              stateFilter={stateFilter}
              canCreate={repos.length > 0}
              onTabChange={handleTabChange}
              onStateFilterChange={handleStateFilterChange}
              onCreate={openCreate}
            />
          )}

          <div style={{ flex: 1, overflow: "auto" }}>
            {selectedItem ? (
              <ItemDetail repo={selectedItem.repo} number={selectedItem.number} type={selectedItem.type} onBack={handleBackFromDetail} />
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
              />
            )}
          </div>
        </div>

        {showCreate && (
          <CreateForm repos={repos} type={showCreate} onClose={() => setShowCreate(null)} onCreated={handleCreated} />
        )}

        {showAddRepo && <RepoManager repos={repos} onAdd={handleAddRepo} onClose={() => setShowAddRepo(false)} />}

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
              bumpRefresh();
            }}
            onSignedOut={async () => {
              setShowAccountManager(false);
              setSelectedItem(null);
              await refreshAuth();
            }}
            onClose={() => setShowAccountManager(false)}
          />
        )}

        {authModal}
      </div>
    );
  }

  return (
    <LocaleProvider locale={locale} onLocaleChange={setLocale}>
      {content}
    </LocaleProvider>
  );
}
