import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { modelLabel, normalizeModelId, type EffortLevel, type ModelDefinition } from "@shared/models";
import { useFontScale } from "../contexts/FontSizeContext";
import { useTranslator } from "../contexts/LocaleContext";
import { CLOSE_MENUS_EVENT, useDismissibleLayer } from "../hooks/useDismissibleLayer";
import { useStableCallback } from "../hooks/useStableCallback";
import {
  buildPickerOptions,
  computeMenuPosition,
  filterInheritOption,
  moveActiveId,
  optionDomId,
  type MenuPosition,
  type PickerOption,
  type PickerPurpose,
} from "./model-picker/catalogView";
import { EffortSelect } from "./model-picker/EffortSelect";
import { ModelMenu } from "./model-picker/ModelMenu";
import { useModelCatalog, type ModelCatalog } from "./model-picker/useModelCatalog";

export type { ModelCatalog } from "./model-picker/useModelCatalog";

export interface ModelPickerProps {
  /** Selected model id; "" selects the inherit option when `inheritModelId` is set. */
  value: string;
  onChange?: (modelId: string) => void;
  /** OpenCode / Multica / remote models to list alongside the catalog. */
  extraModels?: readonly ModelDefinition[];
  /** Multica agents failed to load. */
  extraError?: unknown;
  extraLoading?: boolean;
  /** Per-conversation reasoning effort; null = the model's default. */
  effort?: EffortLevel | null;
  /** Shows the effort selector (for models that have efforts) when provided. */
  onEffortChange?: (effort: EffortLevel | null) => void;
  /** Shared catalog (see `useModelCatalog`); a picker without one builds its own. */
  catalog?: ModelCatalog;
  compact?: boolean;
  ariaLabel?: string;
  /** Menu z-index; raise it inside modals (Dispatch is at 1000). */
  menuZIndex?: number;
  /** "planner" disables models the dispatch planner can't drive. */
  purpose?: PickerPurpose;
  /** Dispatch: offer an "inherit default" option (value "") resolving to this model. */
  inheritModelId?: string;
  disabled?: boolean;
}

const NO_MODELS: readonly ModelDefinition[] = [];
const DEFAULT_MENU_Z_INDEX = 500;

function isComposing(event: KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

/**
 * Model picker shared by the composer, new-chat card and dispatch: provider
 * groups, fuzzy search, arrow/Enter navigation, layered Escape, badges for
 * legacy / retiring / CLI-gated models, plus an optional effort selector.
 */
export default function ModelPicker(props: ModelPickerProps) {
  return props.catalog ? <ModelPickerControl {...props} catalog={props.catalog} /> : <ConnectedModelPicker {...props} />;
}

function ConnectedModelPicker(props: ModelPickerProps) {
  const catalog = useModelCatalog(props.extraModels ?? NO_MODELS);
  return <ModelPickerControl {...props} catalog={catalog} />;
}

function ModelPickerControl({
  value,
  onChange,
  catalog,
  extraError = null,
  extraLoading = false,
  effort = null,
  onEffortChange,
  compact = false,
  ariaLabel,
  menuZIndex = DEFAULT_MENU_Z_INDEX,
  purpose = "chat",
  inheritModelId,
  disabled = false,
}: ModelPickerProps & { catalog: ModelCatalog }) {
  const s = useFontScale();
  const t = useTranslator();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  /** Captured when the menu opens (retirement checks must not read the clock during render). */
  const [nowMs, setNowMs] = useState(0);
  const { models, installed, versions, getModel, refresh } = catalog;

  const label = ariaLabel || t("models.choose");
  const inherited = useMemo(() => (inheritModelId !== undefined ? getModel(inheritModelId) : null), [getModel, inheritModelId]);
  const inheritLabel = inherited ? `${t("dispatch.modelDefault")} · ${inherited.name}` : "";
  const selected = useMemo(() => (value === "" && inherited ? inherited : value ? getModel(value) : null), [getModel, inherited, value]);
  const selectedId = value === "" && inherited ? "" : (normalizeModelId(value) ?? null);

  const options = useMemo<PickerOption[]>(() => {
    if (!open) return [];
    const list = buildPickerOptions(models, { installed, versions, retainedIds: [value], nowMs, query, purpose });
    const inherit = inherited ? filterInheritOption(inherited, inheritLabel, query, purpose) : null;
    return inherit ? [inherit, ...list] : list;
  }, [open, models, installed, versions, value, nowMs, query, purpose, inherited, inheritLabel]);
  const eligibleIds = useMemo(() => options.filter((option) => option.disabled === null).map((option) => option.id), [options]);
  const active = activeId !== null && eligibleIds.includes(activeId) ? activeId : (eligibleIds[0] ?? null);

  const close = useCallback(() => setOpen(false), []);
  useDismissibleLayer(open, rootRef, menuRef, close);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPosition(computeMenuPosition(rect, window.innerWidth, window.innerHeight));
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    void refresh();
    inputRef.current?.focus();
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)) updatePosition();
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, refresh, updatePosition]);

  useEffect(() => {
    if (open && active !== null) document.getElementById(optionDomId(menuId, active))?.scrollIntoView({ block: "nearest" });
  }, [open, active, menuId]);

  const show = (initialQuery = "") => {
    window.dispatchEvent(new Event(CLOSE_MENUS_EVENT));
    setNowMs(Date.now());
    setQuery(initialQuery);
    setActiveId(selectedId);
    updatePosition();
    setOpen(true);
  };

  const choose = useStableCallback((option: PickerOption | undefined) => {
    if (!option || option.disabled !== null) return;
    onChange?.(option.id);
    close();
    triggerRef.current?.focus();
  });

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isComposing(event)) return;
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close();
        triggerRef.current?.focus();
        break;
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        event.stopPropagation();
        setActiveId(moveActiveId(eligibleIds, active, event.key === "ArrowDown" ? 1 : -1));
        break;
      case "Enter":
        event.preventDefault();
        event.stopPropagation();
        choose(options.find((option) => option.id === active));
        break;
      case "Tab":
        close();
        break;
      default:
        break;
    }
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (open || isComposing(event)) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      show();
    } else if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Type-to-search straight from the closed trigger.
      event.preventDefault();
      show(event.key);
    }
  };

  const handleQueryChange = useCallback((next: string) => {
    setQuery(next);
    setActiveId(null);
  }, []);
  const openGuide = useStableCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    close();
  });

  const unavailable = Boolean(selected?.unavailable);
  const triggerText = value === "" && inherited
    ? `${t("dispatch.modelDefault")} · ${inherited.tag || inherited.name}`
    : modelLabel(selected, { short: true, effort: null }) || label;
  const showEffort = Boolean(onEffortChange && selected && (selected.efforts?.length ?? 0) > 0 && value !== "");

  return (
    <div ref={rootRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, minWidth: 0, maxWidth: compact ? 250 : "100%" }}>
      <button
        ref={triggerRef}
        type="button"
        data-model-picker="true"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={unavailable ? `${modelLabel(selected, { effort: null })} · ${t("models.runtimeUnavailable")}` : modelLabel(selected, { effort: null }) || label}
        onClick={() => (open ? close() : show())}
        onKeyDown={handleTriggerKeyDown}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 0,
          maxWidth: "100%",
          padding: compact ? "3px 6px" : "4px 12px",
          background: "var(--control-bg)",
          border: "1px solid var(--control-border)",
          borderRadius: 7,
          color: "var(--text-secondary)",
          fontSize: s(10),
          fontFamily: "var(--font-mono)",
          letterSpacing: ".06em",
          cursor: disabled ? "default" : "pointer",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {triggerText}
          {unavailable ? ` · ${t("models.unavailable")}` : ""}
        </span>
        <ChevronDown size={11} strokeWidth={2} style={{ flexShrink: 0 }} />
      </button>
      {showEffort && selected && onEffortChange && (
        <EffortSelect s={s} t={t} model={selected} effort={effort} onEffortChange={onEffortChange} compact={compact} disabled={disabled} menuZIndex={menuZIndex} />
      )}
      {open && position && (
        <ModelMenu
          s={s}
          t={t}
          menuId={menuId}
          menuRef={menuRef}
          inputRef={inputRef}
          label={label}
          position={position}
          zIndex={menuZIndex}
          query={query}
          options={options}
          selectedId={selectedId}
          activeId={active}
          purpose={purpose}
          installed={installed}
          extraError={Boolean(extraError)}
          extraLoading={extraLoading}
          onQueryChange={handleQueryChange}
          onKeyDown={handleMenuKeyDown}
          onHover={setActiveId}
          onChoose={choose}
          onOpenGuide={openGuide}
        />
      )}
    </div>
  );
}
