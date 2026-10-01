/**
 * Derived stores recomputed outside React whenever conversations, live
 * stream data or transcript status change. Subscribers only re-render when
 * the derived value's identity changes.
 */

import { createStore, useStore } from "../../store/createStore";
import { convoListStore } from "../../store/convoList";
import { conversationsStore, getConversation } from "../../store/conversations";
import { isTranscriptPending, transcriptStatusStore } from "../stores/transcripts";
import { buildSidebarRows, createSidebarRowCache, SIDEBAR_PREVIEW_THROTTLE_MS, type SidebarRow } from "./sidebarRows";
import { buildPinnedTabs, tabsSignature, type TabDescriptor } from "./tabs";

export interface TabsState {
  /** All pinned tabs (in pin order). */
  pinned: TabDescriptor[];
  /** What the TabStrip shows: the pinned tabs once there are at least two. */
  visible: TabDescriptor[];
}

const EMPTY_TABS: TabDescriptor[] = [];

export const sidebarRowsStore = createStore<SidebarRow[]>([]);
export const tabsStore = createStore<TabsState>({ pinned: EMPTY_TABS, visible: EMPTY_TABS });

const rowCache = createSidebarRowCache();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastTabsSignature = "";

function recomputeSidebarRows(): void {
  const { convos, activeId } = convoListStore.getState();
  const { rows, pendingFlush } = buildSidebarRows(
    { convos, activeId, getLive: getConversation, isTranscriptPending, now: Date.now() },
    rowCache,
  );
  sidebarRowsStore.setState(rows);
  if (pendingFlush && !flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      recomputeSidebarRows();
    }, SIDEBAR_PREVIEW_THROTTLE_MS);
  } else if (!pendingFlush && flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function recomputeTabs(): void {
  const pinned = buildPinnedTabs(convoListStore.getState().convos, getConversation);
  const signature = tabsSignature(pinned);
  if (signature === lastTabsSignature) return;
  lastTabsSignature = signature;
  const stable = pinned.length === 0 ? EMPTY_TABS : pinned;
  tabsStore.setState({ pinned: stable, visible: stable.length > 1 ? stable : EMPTY_TABS });
}

function recompute(): void {
  recomputeSidebarRows();
  recomputeTabs();
}

/** Start keeping the derived stores in sync; returns the stopper. */
export function startDerivedStores(): () => void {
  recompute();
  const unsubscribers = [
    convoListStore.subscribe(recompute),
    conversationsStore.subscribe(recompute),
    transcriptStatusStore.subscribe(recomputeSidebarRows),
  ];
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
  };
}

export function useSidebarRows(): SidebarRow[] {
  return useStore(sidebarRowsStore, (rows) => rows);
}

export function useVisibleTabs(): TabDescriptor[] {
  return useStore(tabsStore, (state) => state.visible);
}

export function getPinnedTabs(): TabDescriptor[] {
  return tabsStore.getState().pinned;
}
