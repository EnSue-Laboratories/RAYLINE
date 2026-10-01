import { lazy, memo, Suspense } from "react";
import { useAppSetting } from "../../store/appSettings";
import { dispatchRows } from "../actions/create";
import { handleClonedRepo, registerManualProject } from "../actions/projects";
import { useProjectsDerived } from "../derived/projects";
import { useModelsField } from "../stores/models";
import { useStore } from "../../store/createStore";
import { convoListStore, type ConvoListState } from "../../store/convoList";
import type { EffortLevel } from "@shared/models/types";

/** The default model was last picked in the active chat, so its effort is the default effort. */
function selectDefaultEffort(state: ConvoListState, defaultModel: string): EffortLevel | null {
  const active = state.activeId ? state.convos.find((c) => c.id === state.activeId) : undefined;
  return active?.model === defaultModel ? active.effort ?? null : null;
}
import { patchUi, useUi } from "../stores/ui";

// Code-split and mounted only while open.
const DispatchCard = lazy(() => import("../../components/DispatchCard"));
const MulticaSetupModal = lazy(() => import("../../components/MulticaSetupModal"));
const NewProjectModal = lazy(() => import("../../components/NewProjectModal"));

const closeDispatch = () => patchUi({ showDispatchCard: false });
const closeMulticaSetup = () => patchUi({ showMulticaSetup: false });
const closeNewProject = () => patchUi({ showNewProject: false });

const DispatchLayer = memo(function DispatchLayer() {
  const newChatDefaultCwd = useProjectsDerived("newChatDefaultCwd");
  const defaultModel = useAppSetting("defaultModel");
  const locale = useAppSetting("locale");
  const availableModels = useModelsField("availableModels");
  const defaultEffort = useStore(convoListStore, (state) => selectDefaultEffort(state, defaultModel));
  return (
    <DispatchCard
      onClose={closeDispatch}
      onDispatch={dispatchRows}
      currentCwd={newChatDefaultCwd || undefined}
      defaultModel={defaultModel}
      defaultEffort={defaultEffort}
      availableModels={availableModels}
      locale={locale}
    />
  );
});

/** Dispatch card and modals: code-split and mounted only while open. */
export const Overlays = memo(function Overlays() {
  const showDispatchCard = useUi("showDispatchCard");
  const showMulticaSetup = useUi("showMulticaSetup");
  const showNewProject = useUi("showNewProject");
  const locale = useAppSetting("locale");
  if (!showDispatchCard && !showMulticaSetup && !showNewProject) return null;
  return (
    <Suspense fallback={null}>
      {showDispatchCard ? <DispatchLayer /> : null}
      {showMulticaSetup ? <MulticaSetupModal open onClose={closeMulticaSetup} /> : null}
      {showNewProject ? (
        <NewProjectModal
          open
          locale={locale}
          onClose={closeNewProject}
          onCloned={handleClonedRepo}
          onPickedLocalFolder={registerManualProject}
        />
      ) : null}
    </Suspense>
  );
});
