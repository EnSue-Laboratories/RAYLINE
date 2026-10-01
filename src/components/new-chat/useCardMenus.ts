import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { CLOSE_MENUS_EVENT } from "../../hooks/useDismissibleLayer";
import { useStableCallback } from "../../hooks/useStableCallback";

export interface CardMenu {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  /** Wrapper around the chip button. */
  anchorRef: RefObject<HTMLDivElement | null>;
  /** The portal sheet. */
  menuRef: RefObject<HTMLDivElement | null>;
  /** Toggle, closing every other popover in the app first. */
  toggleExclusive: () => void;
}

export interface CardMenus {
  issue: CardMenu;
  branch: CardMenu;
  tree: CardMenu;
}

function useCardMenu(): CardMenu {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const toggleExclusive = () => {
    const wasOpen = open;
    window.dispatchEvent(new Event(CLOSE_MENUS_EVENT));
    setOpen(!wasOpen);
  };
  return { open, setOpen, anchorRef, menuRef, toggleExclusive };
}

function contains(ref: RefObject<HTMLElement | null>, target: EventTarget | null): boolean {
  return target instanceof Node && Boolean(ref.current?.contains(target));
}

export interface CardMenuOptions {
  /** Escape with no menu open. */
  onCancel?: () => void;
  /** Ignore Escape (e.g. while creating). */
  blocked: boolean;
  /** Any element inside the card; Escape is ignored under an `[inert]` ancestor. */
  scopeRef: RefObject<HTMLElement | null>;
  /** The branch menu was dismissed by an outside click. */
  onBranchDismissed?: () => void;
}

/**
 * The new-chat card's three chip dropdowns: open state, refs, outside-click
 * dismissal, the global close-menus event, and layered Escape (innermost
 * menu first, then `onCancel`).
 */
export function useCardMenus({ onCancel, blocked, scopeRef, onBranchDismissed }: CardMenuOptions): CardMenus {
  const issue = useCardMenu();
  const branch = useCardMenu();
  const tree = useCardMenu();
  const cancel = useStableCallback(() => onCancel?.());
  const branchDismissed = useStableCallback(() => onBranchDismissed?.());
  const { setOpen: setIssueOpen, anchorRef: issueAnchor, menuRef: issueMenu, open: issueOpen } = issue;
  const { setOpen: setBranchOpen, anchorRef: branchAnchor, menuRef: branchMenu, open: branchOpen } = branch;
  const { setOpen: setTreeOpen, anchorRef: treeAnchor, menuRef: treeMenu, open: treeOpen } = tree;

  useEffect(() => {
    const closeAll = () => {
      setIssueOpen(false);
      setBranchOpen(false);
      setTreeOpen(false);
    };
    window.addEventListener(CLOSE_MENUS_EVENT, closeAll);
    return () => window.removeEventListener(CLOSE_MENUS_EVENT, closeAll);
  }, [setIssueOpen, setBranchOpen, setTreeOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.isComposing || blocked) return;
      if (scopeRef.current?.closest("[inert]")) return;
      e.preventDefault();
      if (issueOpen) { setIssueOpen(false); return; }
      if (branchOpen) { setBranchOpen(false); return; }
      if (treeOpen) { setTreeOpen(false); return; }
      cancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [blocked, scopeRef, cancel, issueOpen, branchOpen, treeOpen, setIssueOpen, setBranchOpen, setTreeOpen]);

  useEffect(() => {
    if (!issueOpen && !branchOpen && !treeOpen) return;
    const outside = (anchor: RefObject<HTMLElement | null>, menu: RefObject<HTMLElement | null>, target: EventTarget | null) =>
      !contains(anchor, target) && !contains(menu, target);
    const handler = (e: MouseEvent) => {
      if (issueOpen && outside(issueAnchor, issueMenu, e.target)) setIssueOpen(false);
      if (branchOpen && outside(branchAnchor, branchMenu, e.target)) {
        setBranchOpen(false);
        branchDismissed();
      }
      if (treeOpen && outside(treeAnchor, treeMenu, e.target)) setTreeOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [
    issueOpen, branchOpen, treeOpen, issueAnchor, issueMenu, branchAnchor, branchMenu, treeAnchor, treeMenu,
    setIssueOpen, setBranchOpen, setTreeOpen, branchDismissed,
  ]);

  return { issue, branch, tree };
}
