import { useCallback, useEffect, useRef, useState } from "react";
import { GitCommitHorizontal } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import GitConfirmDialog from "./git/GitConfirmDialog";
import { getPillBadge, getPillTooltip } from "./git/gitStatusModel";
import GitStatusPopover from "./git/GitStatusPopover";
import { useGitPillController } from "./git/useGitPillController";
import useGitStatus from "../hooks/useGitStatus";
import { anchorDropdown, getViewport, type SizedMenuPosition } from "./sidebar/dropdownPosition";
import { useLocaleTranslator } from "./sidebar/useLocaleTranslator";

const MENU_WIDTH = 360;

export interface GitStatusPillProps {
  cwd: string | null | undefined;
  /** PR base branch (default "main"). */
  defaultPrBranch?: string | null;
  coauthorEnabled?: boolean;
  coauthorTrailer?: string;
  locale?: string;
}

/** Header pill showing dirty / ahead / behind, with a commit / push / PR popover. */
export default function GitStatusPill({
  cwd,
  defaultPrBranch,
  coauthorEnabled = false,
  coauthorTrailer = "",
  locale,
}: GitStatusPillProps) {
  const s = useFontScale();
  const t = useLocaleTranslator(locale);
  const { status, refresh, refetch } = useGitStatus(cwd);
  const controller = useGitPillController({
    cwd,
    status,
    refresh,
    refetch,
    defaultPrBranch,
    coauthorEnabled,
    coauthorTrailer,
    t,
  });
  const { refreshAll, resetTransient } = controller;
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<SizedMenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setMenuStyle(null);
    resetTransient();
  }, [resetTransient]);

  // Refresh everything when the popover opens (and when cwd changes while open).
  useEffect(() => {
    if (open) refreshAll();
  }, [open, refreshAll]);

  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target instanceof Node ? e.target : null;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return;
    setMenuStyle(anchorDropdown(triggerRef.current.getBoundingClientRect(), MENU_WIDTH, getViewport()));
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  const state = controller.state;
  if (!state) return null;

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    controller.clearError();
    updateMenuPosition();
    setOpen(true);
  };

  const badge = getPillBadge(state);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={toggle}
        title={getPillTooltip(state, t)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 7,
          background: open ? "var(--pane-border)" : "color-mix(in srgb, var(--control-bg) 50%, transparent)",
          border: "1px solid " + (open ? "color-mix(in srgb, var(--text-primary) 11%, transparent)" : "var(--control-bg)"),
          color: "var(--text-secondary)",
          fontSize: s(10),
          fontFamily: "var(--font-mono)",
          letterSpacing: ".04em",
          cursor: "pointer",
          transition: "background .2s, border-color .2s, color .2s",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = "color-mix(in srgb, var(--text-primary) 11%, transparent)"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = "var(--control-bg)"; }}
      >
        {badge.kind === "changes" ? (
          <>
            {badge.up !== null && <span>↑{badge.up}</span>}
            {badge.down !== null && <span>↓{badge.down}</span>}
          </>
        ) : (
          <>
            <GitCommitHorizontal size={13} strokeWidth={1.6} />
            {badge.kind === "detached" && <span style={{ color: "var(--state-warning-text)" }}>{t("git.status.detached")}</span>}
            {badge.kind === "local" && <span>{t("git.status.local")}</span>}
          </>
        )}
      </button>
      {open && menuStyle && (
        <GitStatusPopover position={menuStyle} menuRef={menuRef} state={state} controller={controller} s={s} t={t} />
      )}
      {controller.confirm && (
        <GitConfirmDialog
          s={s}
          t={t}
          title={controller.confirm.title}
          body={controller.confirm.body}
          confirmLabel={controller.confirm.confirmLabel}
          destructive={controller.confirm.destructive}
          onCancel={controller.cancelConfirm}
          onConfirm={() => void controller.runConfirm()}
        />
      )}
    </>
  );
}
