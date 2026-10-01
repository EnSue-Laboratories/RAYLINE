import { lazy, memo, Suspense, useCallback, useRef, useState } from "react";
import { useDismissibleLayer } from "../hooks/useDismissibleLayer";
import { useFontScale } from "../contexts/FontSizeContext";
import { useLocaleTranslator } from "./sidebar/useLocaleTranslator";
import ConversationList from "./sidebar/ConversationList";
import { getProjectMenuPosition, getViewport, type MenuPosition } from "./sidebar/dropdownPosition";
import { closeOtherMenus } from "./sidebar/menuEvents";
import { areProjectGroupsEqual } from "./sidebar/projectGroupEquality";
import ProjectGroupHeader from "./sidebar/ProjectGroupHeader";
import ProjectGroupMenu from "./sidebar/ProjectGroupMenu";
import type {
  DeleteConversation,
  ExtraModels,
  ProjectGroupData,
  SelectConversation,
} from "./sidebar/types";

// Mounted only while open, so the modal's code stays out of the sidebar chunk.
const ProjectContextModal = lazy(() => import("./ProjectContextModal"));

const NO_MODELS: ExtraModels = [];

export interface ProjectGroupProps {
  project: ProjectGroupData;
  active: string | null | undefined;
  onSelect: SelectConversation;
  onDelete: DeleteConversation;
  /** Opens the new-chat flow preselecting this project (null = drafts). */
  onNewInProject: (cwdRoot: string | null) => void;
  onToggleCollapse: (cwdRoot: string) => void;
  onHideProject: (cwdRoot: string) => void;
  onEditContext?: (cwdRoot: string, context: string) => void;
  searchActive: boolean;
  multicaModels?: ExtraModels;
  locale?: string;
}

function ProjectGroup({
  project,
  active,
  onSelect,
  onDelete,
  onNewInProject,
  onToggleCollapse,
  onHideProject,
  onEditContext,
  searchActive,
  multicaModels = NO_MODELS,
  locale,
}: ProjectGroupProps) {
  const s = useFontScale();
  const t = useLocaleTranslator(locale);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuOpen = menuPos !== null;
  const { cwdRoot } = project;

  const closeMenu = useCallback(() => setMenuPos(null), []);
  useDismissibleLayer(menuOpen, moreRef, menuRef, closeMenu);

  const toggleMenu = useCallback(() => {
    if (menuOpen) {
      closeMenu();
      return;
    }
    const anchor = moreRef.current;
    if (!anchor) return;
    closeOtherMenus();
    setMenuPos(getProjectMenuPosition(anchor.getBoundingClientRect(), getViewport()));
  }, [closeMenu, menuOpen]);

  const handleToggle = useCallback(() => onToggleCollapse(cwdRoot), [cwdRoot, onToggleCollapse]);
  const handleNewChat = useCallback(() => onNewInProject(cwdRoot), [cwdRoot, onNewInProject]);
  const handleEditContext = useCallback(() => {
    setContextModalOpen(true);
    closeMenu();
  }, [closeMenu]);
  const handleOpenInFinder = useCallback(() => {
    void window.api?.openPath?.(cwdRoot);
    closeMenu();
  }, [closeMenu, cwdRoot]);
  const handleCopyPath = useCallback(() => {
    void navigator.clipboard.writeText(cwdRoot);
    closeMenu();
  }, [closeMenu, cwdRoot]);
  const handleHide = useCallback(() => {
    onHideProject(cwdRoot);
    closeMenu();
  }, [closeMenu, cwdRoot, onHideProject]);
  const handleCloseContext = useCallback(() => setContextModalOpen(false), []);
  const handleSaveContext = useCallback(
    (value: string) => onEditContext?.(cwdRoot, value),
    [cwdRoot, onEditContext],
  );

  if (project.hidden) return null;

  const expanded = searchActive || !project.collapsed;

  return (
    <div style={{ marginBottom: 2 }}>
      <ProjectGroupHeader
        name={project.name}
        expanded={expanded}
        menuOpen={menuOpen}
        moreRef={moreRef}
        s={s}
        t={t}
        onToggle={handleToggle}
        onNewChat={handleNewChat}
        onToggleMenu={toggleMenu}
      />

      {expanded && (
        <ConversationList
          convos={project.convos}
          active={active}
          onSelect={onSelect}
          onDelete={onDelete}
          multicaModels={multicaModels}
          s={s}
        />
      )}

      {menuPos && (
        <ProjectGroupMenu
          position={menuPos}
          menuRef={menuRef}
          s={s}
          t={t}
          onEditContext={handleEditContext}
          onOpenInFinder={handleOpenInFinder}
          onCopyPath={handleCopyPath}
          onHide={handleHide}
        />
      )}

      {contextModalOpen && (
        <Suspense fallback={null}>
          <ProjectContextModal
            open
            projectName={project.name}
            initialValue={project.context || ""}
            onClose={handleCloseContext}
            onSave={handleSaveContext}
            locale={locale}
          />
        </Suspense>
      )}
    </div>
  );
}

export default memo(ProjectGroup, areProjectGroupsEqual);
