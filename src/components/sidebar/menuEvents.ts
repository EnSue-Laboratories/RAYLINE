import { CLOSE_MENUS_EVENT } from "../../hooks/useDismissibleLayer";

/** Ask every open popover (useDismissibleLayer) to close before opening another. */
export function closeOtherMenus(): void {
  window.dispatchEvent(new Event(CLOSE_MENUS_EVENT));
}
