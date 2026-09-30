import { useState, useRef, useEffect, useCallback, useMemo, useId } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, Check } from "lucide-react";
import { getAvailableModels, getMOrMulticaFallback } from "../data/models";
import { useProviderUpstreams } from "../data/providerUpstreams.jsx";
import { useRuntimeModels, refreshRuntimeModels } from "../data/runtimeModels";
import { useFontScale } from "../contexts/FontSizeContext";
import { useTranslator } from "../contexts/LocaleContext";
import useDismissibleLayer from "../hooks/useDismissibleLayer";
import { filterModels } from "../utils/modelSearch";

const GUIDES = {
  claude: "https://code.claude.com/docs/en/setup",
  codex: "https://developers.openai.com/codex/cli",
  grok: "https://docs.x.ai/docs/grok-code",
  agy: "https://antigravity.google/docs/cli",
  opencode: "https://opencode.ai/docs/cli/",
};
const ORDER = ["claude", "codex", "grok", "agy", "remote-claude", "remote-codex", "opencode", "multica"];
const EMPTY_MODELS = [];

export default function ModelPicker({ value, onChange, extraModels = EMPTY_MODELS, extraError = null, extraLoading = false }) {
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
  const [installed, setInstalled] = useState({});
  const { overrideModels } = useProviderUpstreams();
  const runtimeModels = useRuntimeModels();
  const merged = useMemo(() => [...runtimeModels, ...overrideModels, ...extraModels], [runtimeModels, overrideModels, extraModels]);
  const allModels = useMemo(() => getAvailableModels(merged), [merged]);
  const selected = getMOrMulticaFallback(value, merged);
  const visible = useMemo(() => filterModels(allModels.filter((model) => (
    (!model.legacy || model.id === value) && (!GUIDES[model.provider] || installed[model.provider] !== false || model.remoteRuntime)
  )), query), [allModels, installed, query, value]);
  const groups = useMemo(() => [...new Set([...ORDER, ...visible.map((model) => model.provider)])]
    .map((provider) => ({ provider, models: visible.filter((model) => model.provider === provider) }))
    .filter((group) => group.models.length), [visible]);
  const options = groups.flatMap((group) => group.models);
  const active = options.find((model) => model.id === activeId) || options[0];
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
    let cancelled = false;
    void refreshRuntimeModels();
    window.api?.checkCliInstalled?.({ force: true }).then((result) => {
      if (!cancelled && result) setInstalled(result);
    }).catch(() => {});
    inputRef.current?.focus();
    const onScroll = (event) => {
      if (!menuRef.current?.contains(event.target)) updatePosition();
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (open && active) document.getElementById(`${id}-${active.id}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  const choose = (model) => {
    if (!model) return;
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
      const index = options.findIndex((model) => model.id === active?.id);
      const next = options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length];
      setActiveId(next?.id || null);
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
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" aria-label={t("models.choose")} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
        title={`${selected.name}${selected.effort ? ` · ${selected.effort}` : ""}`}
        onClick={() => open ? close() : show()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); show(); }
          else if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey && !event.nativeEvent.isComposing) { event.preventDefault(); show(event.key); }
        }}
        style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: "100%", padding: "4px 12px", background: "var(--control-bg)", border: "1px solid var(--control-border)", borderRadius: 7, color: "var(--text-secondary)", fontSize: s(10), fontFamily: "var(--font-mono)", cursor: "pointer" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.tag}{selected.effort ? ` · ${selected.effort}` : ""}</span><ChevronDown size={11} />
      </button>
      {open && position && createPortal(
        <div ref={menuRef} id={id} role="dialog" aria-label={t("models.choose")} onKeyDown={handleKeyDown}
          onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}
          style={{ ...position, position: "fixed", zIndex: 500, display: "flex", flexDirection: "column", background: "var(--pane-elevated)", backdropFilter: "blur(48px) saturate(1.2)", WebkitBackdropFilter: "blur(48px) saturate(1.2)", border: "1px solid var(--pane-border)", borderRadius: 10, padding: 4, boxShadow: "var(--shadow-md)", WebkitAppRegion: "no-drag" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", flexShrink: 0, borderBottom: "1px solid var(--pane-border)", color: "var(--text-secondary)" }}>
            <Search size={14} />
            <input ref={inputRef} role="combobox" aria-label={t("models.search")} aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={active ? `${id}-${active.id}` : undefined}
              value={query} placeholder={t("models.search")} onChange={(event) => { setQuery(event.target.value); setActiveId(null); }}
              style={{ minWidth: 0, width: "100%", border: 0, outline: "none", background: "transparent", color: "var(--text-primary)", fontSize: s(12), fontFamily: "var(--font-ui)" }} />
          </div>
          <div id={`${id}-list`} role="listbox" aria-label={t("models.choose")} style={{ overflowY: "auto", minHeight: 0 }}>
            {groups.map(({ provider, models }) => (
              <div key={provider} role="group" aria-label={provider}>
                <div style={{ padding: "9px 10px 4px", fontSize: s(9), color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{provider.startsWith("remote-") ? `SSH / ${provider.slice(7).toUpperCase()}` : provider.toUpperCase()}</div>
                {models.map((model) => (
                  <button type="button" role="option" aria-selected={model.id === value} tabIndex={-1} id={`${id}-${model.id}`} key={model.id}
                    onMouseEnter={() => setActiveId(model.id)} onClick={() => choose(model)}
                    style={{ ...actionStyle, display: "flex", alignItems: "center", gap: 8, background: model.id === active?.id ? "var(--pane-hover)" : "transparent", color: "var(--text-primary)" }}>
                    <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{model.name}{model.grokContinue ? ` · ${t("models.continue")}` : ""}</span>
                    {model.effort && <span style={{ color: "var(--text-secondary)", fontSize: s(10) }}>{model.effort}</span>}
                    {model.id === value && <Check size={12} />}
                  </button>
                ))}
              </div>
            ))}
            {!options.length && <div role="status" style={{ padding: 14, fontSize: s(12), color: "var(--text-secondary)" }}>{t("models.noResults")}</div>}
          </div>
          {!query && <div style={{ flexShrink: 0, borderTop: "1px solid var(--pane-border)" }}>
            {Object.entries(GUIDES).filter(([provider]) => installed[provider] === false).map(([provider, url]) => (
              <button type="button" key={provider} style={actionStyle} onClick={() => { window.open(url, "_blank", "noopener,noreferrer"); close(); }}>{t("models.install", { provider: provider === "codex" ? "Codex CLI" : provider === "claude" ? "Claude Code" : provider === "grok" ? "Grok" : provider === "agy" ? "Antigravity" : "OpenCode" })}</button>
            ))}
            {(extraError || extraLoading) && <div role="status" style={{ padding: "6px 12px", fontSize: s(10), color: "var(--text-muted)" }}>{extraError ? t("models.agentsUnavailable") : t("models.loadingAgents")}</div>}
          </div>}
        </div>, document.body
      )}
    </div>
  );
}
