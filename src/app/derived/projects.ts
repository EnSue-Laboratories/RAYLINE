/**
 * Project-picker values derived from conversations + settings + UI:
 * chooser projects (stable across unrelated project-meta edits), project
 * roots, and the new-chat card's default project. Recomputed outside React;
 * identities only change when the content does.
 */

import { appSettingsStore } from "../../store/appSettings";
import { convoListStore } from "../../store/convoList";
import { createStore, shallowEqual, useStore } from "../../store/createStore";
import {
  buildProjectChooserProjects,
  collectCwdRoots,
  getProjectChooserSignature,
  resolveNewChatDefaultCwd,
  type ChooserProjects,
} from "../conversation/paths";
import { uiStore } from "../stores/ui";

export interface ProjectsDerived {
  chooserProjects: ChooserProjects;
  cwdRoots: string[];
  newChatDefaultCwd: string | null;
}

export const projectsDerivedStore = createStore<ProjectsDerived>({ chooserProjects: {}, cwdRoots: [], newChatDefaultCwd: null });

let chooserSignature: string | null = null;

function recompute(): void {
  const { convos, activeId } = convoListStore.getState();
  const { projects, cwd: appCwd } = appSettingsStore.getState();
  const { draftsPath, newChatProject } = uiStore.getState();
  const prev = projectsDerivedStore.getState();

  const signature = getProjectChooserSignature(projects);
  const chooserProjects = signature === chooserSignature ? prev.chooserProjects : buildProjectChooserProjects(projects);
  chooserSignature = signature;

  const roots = collectCwdRoots(convos, chooserProjects, draftsPath);
  const cwdRoots = shallowEqual(roots, prev.cwdRoots) ? prev.cwdRoots : roots;
  const active: { cwd?: string | null } | undefined = activeId ? convos.find((c) => c.id === activeId) : undefined;
  const newChatDefaultCwd = resolveNewChatDefaultCwd({
    explicitProject: newChatProject,
    activeCwd: active?.cwd,
    appCwd,
    convos,
    draftsPath,
  });

  if (chooserProjects === prev.chooserProjects && cwdRoots === prev.cwdRoots && newChatDefaultCwd === prev.newChatDefaultCwd) return;
  projectsDerivedStore.setState({ chooserProjects, cwdRoots, newChatDefaultCwd });
}

export function startProjectsDerivation(): () => void {
  recompute();
  const unsubscribers = [convoListStore.subscribe(recompute), appSettingsStore.subscribe(recompute), uiStore.subscribe(recompute)];
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}

export function useProjectsDerived<K extends keyof ProjectsDerived>(key: K): ProjectsDerived[K] {
  return useStore(projectsDerivedStore, (s) => s[key]);
}
