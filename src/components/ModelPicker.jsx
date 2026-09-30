import { useState, useRef, useEffect, useCallback, useMemo, useId } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, Check } from "lucide-react";
import { normalizeModelId } from "../data/models";
import { useModelCatalog } from "../data/useModelCatalog";
import { MODEL_INSTALL_GUIDES, MODEL_PROVIDER_ORDER, visibleModels, isPlannerModel, modelLabel } from "../utils/modelOptions";
import { useFontScale } from "../contexts/FontSizeContext";
import { useTranslator } from "../contexts/LocaleContext";
import useDismissibleLayer from "../hooks/useDismissibleLayer";
import { filterModels } from "../utils/modelSearch";

export default function ModelPicker(props) {
  return props.catalog ? <ModelPickerControl {...props} /> : <ConnectedModelPicker {...props} />;
}
function ConnectedModelPicker(props) {
  const catalog = useModelCatalog(props.extraModels);
  return <ModelPickerControl {...props} catalog={catalog} />;
}

function ModelPickerControl({ value, onChange, catalog, extraError = null, extraLoading = false, compact = false, ariaLabel, menuZIndex = 500, purpose = "chat", inheritModelId, disabled = false }) {
  const s = useFontScale();
  const t = useTranslator();
  const id = useId();
  const ref = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [position, setPosition] = useState(null);
  const { models, installed, getModel, refresh } = catalog;
  const inherited = inheritModelId !== undefined ? getModel(inheritModelId) : null;
  const inheritOption = inherited ? { ...inherited, id: "", provider: "inherit", name: `${t("dispatch.modelDefault")} · ${inherited.name}`, tag: `${t("dispatch.modelDefault")} · ${inherited.tag || inherited.name}` } : null;
  const selected = value === "" && inheritOption ? inheritOption : value ? getModel(value) : null;
  const selectedId = normalizeModelId(value);
  const label = ariaLabel || t("models.choose");
  const available = useMemo(() => visibleModels(models, installed, [value]), [models, installed, value]);
  const visible = filterModels(inheritOption ? [inheritOption, ...available] : available, query);
  const groups = [...new Set([...MODEL_PROVIDER_ORDER, ...visible.map(model => model.provider)])]
    .map(provider => ({ provider, models: visible.filter(model => model.provider === provider) }))
    .filter(group => group.models.length);
  const options = groups.flatMap(group => group.models);
  const isDisabled = model => model.unavailable || (purpose === "planner" && !isPlannerModel(model));
  const eligible = options.filter(model => !isDisabled(model));
  const active = eligible.find(model => model.id === activeId) || eligible[0];
  const close = useCallback(() => setOpen(false), []);
  useDismissibleLayer(open, ref, menuRef, close);

  const updatePosition = useCallback(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(380, Math.max(0, window.innerWidth - 16));
    const below = window.innerHeight - rect.bottom - 14;
    const above = rect.top - 14;
    const up = below < 220 && above > below;
    const maxHeight = Math.min(420, Math.max(80, up ? above : below), window.innerHeight - 16);
    setPosition({
      width, maxHeight,
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      top: Math.max(8, up ? rect.top - maxHeight - 6 : Math.min(rect.bottom + 6, window.innerHeight - maxHeight - 8)),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
    inputRef.current?.focus();
    const onScroll = (event) => {
      if (!menuRef.current?.contains(event.target)) updatePosition();
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, updatePosition, refresh]);

  useEffect(() => {
    if (open && active) document.getElementById(`${id}-${active.id}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  const choose = (model) => {
    if (!model || isDisabled(model)) return;
    onChange?.(model.id);
    close();
    ref.current?.querySelector("button")?.focus();
  };
  const handleKeyDown = (event) => {
    if (event.nativeEvent?.isComposing || event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); close(); ref.current?.querySelector("button")?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); event.stopPropagation();
      const index = eligible.findIndex((model) => model.id === active?.id);
      const next = eligible[(index + (event.key === "ArrowDown" ? 1 : -1) + eligible.length) % eligible.length];
      setActiveId(next?.id ?? null);
    } else if (event.key === "Enter") {
      event.preventDefault(); event.stopPropagation(); choose(active);
    } else if (event.key === "Tab") close();
  };
  const show = (initialQuery = "") => {
    window.dispatchEvent(new Event("rayline:close-menus"));
    setQuery(initialQuery); setActiveId(value); updatePosition(); setOpen(true);
  };
  const actionStyle = { display: "block", width: "100%", padding: "9px 12px", border: 0, borderRadius: 6, background: "transparent", color: "var(--text-secondary)", textAlign: "left", cursor: "pointer", fontSize: s(11) };

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 0, maxWidth: compact ? 250 : "100%" }}>
      <button type="button" data-model-picker="true" disabled={disabled} aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
        title={selected?.unavailable ? `${modelLabel(selected)} · ${t("models.runtimeUnavailable")}` : modelLabel(selected) || label}
        onClick={() => open ? close() : show()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); show(); }
          else if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey && !event.nativeEvent.isComposing) { event.preventDefault(); show(event.key); }
        }}
        style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: "100%", padding: compact ? "3px 6px" : "4px 12px", background: "var(--control-bg)", border: "1px solid var(--control-border)", borderRadius: 7, color: "var(--text-secondary)", fontSize: s(10), fontFamily: "var(--font-mono)", cursor: "pointer" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{modelLabel(selected, { short: true }) || label}{selected?.unavailable ? ` · ${t("models.unavailable")}` : ""}</span><ChevronDown size={11} />
      </button>
      {open && position && createPortal(
        <div ref={menuRef} id={id} role="dialog" aria-label={label} onKeyDown={handleKeyDown}
          onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}
          style={{ ...position, position: "fixed", zIndex: menuZIndex, display: "flex", flexDirection: "column", background: "var(--pane-elevated)", backdropFilter: "blur(48px) saturate(1.2)", WebkitBackdropFilter: "blur(48px) saturate(1.2)", border: "1px solid var(--pane-border)", borderRadius: 10, padding: 4, boxShadow: "var(--shadow-md)", WebkitAppRegion: "no-drag" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", flexShrink: 0, borderBottom: "1px solid var(--pane-border)", color: "var(--text-secondary)" }}>
            <Search size={14} />
            <input ref={inputRef} role="combobox" aria-label={t("models.search")} aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={active ? `${id}-${active.id}` : undefined}
              value={query} placeholder={t("models.search")} onChange={(event) => { setQuery(event.target.value); setActiveId(null); }}
              style={{ minWidth: 0, width: "100%", border: 0, outline: "none", background: "transparent", color: "var(--text-primary)", fontSize: s(12), fontFamily: "var(--font-ui)" }} />
          </div>
          <div id={`${id}-list`} role="listbox" aria-label={label} style={{ overflowY: "auto", minHeight: 0 }}>
            {groups.map(({ provider, models }) => (
              <div key={provider} role="group" aria-label={provider}>
                <div style={{ padding: "9px 10px 4px", fontSize: s(9), color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{provider === "inherit" ? t("dispatch.inheritGroup") : provider.startsWith("remote-") ? `SSH / ${provider.slice(7).toUpperCase()}` : provider.toUpperCase()}</div>
                {models.map((model) => (
                  <button type="button" role="option" data-model-id={model.id} aria-selected={model.id === selectedId} disabled={isDisabled(model)} aria-disabled={isDisabled(model)} tabIndex={-1} id={`${id}-${model.id}`} key={model.id}
                    onMouseEnter={() => setActiveId(model.id)} onClick={() => choose(model)}
                    style={{ ...actionStyle, display: "flex", alignItems: "center", gap: 8, background: model.id === active?.id ? "var(--pane-hover)" : "transparent", color: isDisabled(model) ? "var(--text-muted)" : "var(--text-primary)", cursor: isDisabled(model) ? "not-allowed" : "pointer" }}>
                    <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{model.name}{model.grokContinue ? ` · ${t("models.continue")}` : ""}{isDisabled(model) && <small style={{ display: "block", marginTop: 2, whiteSpace: "normal" }}>{t(model.unavailable ? "models.runtimeUnavailable" : "models.plannerUnavailable")}</small>}</span>
                    {model.effort && <span style={{ color: "var(--text-secondary)", fontSize: s(10) }}>{model.effort}</span>}
                    {model.id === selectedId && <Check size={12} />}
                  </button>
                ))}
              </div>
            ))}
            {!options.length && <div role="status" style={{ padding: 14, fontSize: s(12), color: "var(--text-secondary)" }}>{t("models.noResults")}</div>}
          </div>
          {purpose === "planner" && <div role="note" style={{ padding: "8px 10px", fontSize: s(10), color: "var(--text-muted)", borderTop: "1px solid var(--pane-border)" }}>{t("models.plannerHelp")}</div>}
          {!query && <div style={{ flexShrink: 0, borderTop: "1px solid var(--pane-border)" }}>
            {Object.entries(MODEL_INSTALL_GUIDES).filter(([provider]) => installed[provider] === false).map(([provider, url]) => (
              <button type="button" key={provider} style={actionStyle} onClick={() => { window.open(url, "_blank", "noopener,noreferrer"); close(); }}>{t("models.install", { provider: provider === "codex" ? "Codex CLI" : provider === "claude" ? "Claude Code" : provider === "grok" ? "Grok" : provider === "agy" ? "Antigravity" : "OpenCode" })}</button>
            ))}
            {(extraError || extraLoading) && <div role="status" style={{ padding: "6px 12px", fontSize: s(10), color: "var(--text-muted)" }}>{extraError ? t("models.agentsUnavailable") : t("models.loadingAgents")}</div>}
          </div>}
        </div>, document.body
      )}
    </div>
  );
}
