import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, FolderClosed, FolderOpen } from "lucide-react";
import { useFontScale, type FontScale } from "../contexts/FontSizeContext";
import { useTranslator } from "../contexts/LocaleContext";
import { useDismissibleLayer } from "../hooks/useDismissibleLayer";
import { NO_DRAG } from "./sidebar/appRegion";
import { getProjectPickerPosition, getViewport, type PickerMenuPosition } from "./sidebar/dropdownPosition";
import { closeOtherMenus } from "./sidebar/menuEvents";
import { getProjectDisplayName, listPickerProjectRoots } from "./sidebar/projectGrouping";
import type { ProjectsMeta } from "./sidebar/types";

const HOVER_BG = "color-mix(in srgb, var(--control-bg) 63%, transparent)";

export interface ProjectPickerProps {
  /** Selected project root; null = Drafts. */
  value: string | null;
  onChange: (cwdRoot: string | null) => void;
  allCwdRoots?: readonly string[] | null;
  projects?: ProjectsMeta | null;
  onBrowse: () => void;
}

function PickerOption({
  s,
  selected,
  onClick,
  children,
}: {
  s: FontScale;
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "8px 12px",
        background: selected ? "var(--control-bg)" : "transparent",
        border: "none",
        borderRadius: 7,
        color: selected ? "var(--text-primary)" : "var(--text-secondary)",
        fontSize: s(11),
        fontFamily: "var(--font-mono)",
        cursor: "pointer",
        textAlign: "left",
        transition: "all .12s",
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = HOVER_BG; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}

const DIVIDER = <div style={{ height: 1, background: "var(--control-bg)", margin: "3px 6px" }} />;

/** Arrow-key focus cycling across the menu's buttons. */
function moveFocus(menu: HTMLElement | null, direction: 1 | -1) {
  if (!menu) return;
  const buttons = [...menu.querySelectorAll("button")];
  if (!buttons.length) return;
  const active = document.activeElement;
  const index = buttons.findIndex((button) => button === active);
  buttons[(index + direction + buttons.length) % buttons.length]?.focus();
}

/** New-chat project chooser: Drafts, known projects, or browse for a folder. */
export default function ProjectPicker({ value, onChange, allCwdRoots, projects, onBrowse }: ProjectPickerProps) {
  const s = useFontScale();
  const t = useTranslator();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<PickerMenuPosition | null>(null);

  const projectName = value ? getProjectDisplayName(value, projects) : t("projectPicker.drafts");

  const updateMenuPosition = useCallback(() => {
    if (!ref.current) return;
    setMenuStyle(getProjectPickerPosition(ref.current.getBoundingClientRect(), getViewport()));
  }, []);

  const close = useCallback(() => setOpen(false), []);
  useDismissibleLayer(open, ref, menuRef, close);

  useEffect(() => {
    const anchor = ref.current;
    if (!open || !anchor) return undefined;
    menuRef.current?.querySelector("button")?.focus();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    const ro = new ResizeObserver(updateMenuPosition);
    ro.observe(anchor);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      ro.disconnect();
    };
  }, [open, updateMenuPosition]);

  const choose = (next: string | null) => {
    onChange(next);
    setMenuStyle(null);
    setOpen(false);
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      ref.current?.querySelector("button")?.focus();
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(menuRef.current, event.key === "ArrowDown" ? 1 : -1);
    }
    if (event.key === "Tab") close();
  };

  const visibleRoots = listPickerProjectRoots(allCwdRoots, projects, value);

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 0, maxWidth: "100%" }}>
      <button
        type="button"
        aria-label={t("projectPicker.choose")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            setOpen(false);
            setMenuStyle(null);
            return;
          }
          closeOtherMenus();
          updateMenuPosition();
          setOpen(true);
        }}
        style={{
          display: "flex",
          maxWidth: "100%",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          background: "color-mix(in srgb, var(--control-bg) 50%, transparent)",
          border: "1px solid var(--control-bg)",
          borderRadius: 7,
          color: "var(--text-secondary)",
          fontSize: s(10),
          fontFamily: "var(--font-mono)",
          cursor: "pointer",
          transition: "all .2s",
          letterSpacing: ".04em",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--text-primary) 11%, transparent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--control-bg)"; }}
      >
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--badge-open-text)",
            flexShrink: 0,
          }}
        />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{projectName}</span>
        <ChevronDown size={11} strokeWidth={2} />
      </button>

      {open && menuStyle &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            onKeyDown={onMenuKeyDown}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "fixed",
              top: menuStyle.top,
              left: menuStyle.left,
              zIndex: 400,
              width: menuStyle.width,
              maxHeight: menuStyle.maxHeight,
              background: "var(--pane-elevated)",
              backdropFilter: "blur(48px) saturate(1.2)",
              border: "1px solid var(--pane-border)",
              borderRadius: 10,
              padding: 3,
              boxShadow: "var(--shadow-md)",
              animation: "dropIn .15s ease",
              ...NO_DRAG,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <PickerOption s={s} selected={value === null} onClick={() => choose(null)}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <FolderOpen size={12} strokeWidth={1.8} />
                {t("projectPicker.drafts")}
              </span>
              {value === null && <Check size={12} strokeWidth={2.2} />}
            </PickerOption>

            {DIVIDER}

            <div style={{ minHeight: 0, overflowY: "auto" }}>
              {visibleRoots.map((cwdRoot) => {
                const isSelected = cwdRoot === value;
                return (
                  <PickerOption key={cwdRoot} s={s} selected={isSelected} onClick={() => choose(cwdRoot)}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <FolderClosed size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {getProjectDisplayName(cwdRoot, projects)}
                        </span>
                      </span>
                      <span
                        style={{
                          fontSize: s(9),
                          color: "var(--text-muted)",
                          paddingLeft: 20,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cwdRoot}
                      </span>
                    </span>
                    {isSelected && <Check size={12} strokeWidth={2.2} style={{ flexShrink: 0 }} />}
                  </PickerOption>
                );
              })}
            </div>

            {DIVIDER}

            <PickerOption
              s={s}
              selected={false}
              onClick={() => {
                onBrowse();
                setMenuStyle(null);
                setOpen(false);
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <FolderOpen size={12} strokeWidth={1.8} />
                {t("projectPicker.browse")}
              </span>
            </PickerOption>
          </div>,
          document.body,
        )}
    </div>
  );
}
