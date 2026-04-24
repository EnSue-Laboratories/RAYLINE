import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { MODELS, getMOrMulticaFallback } from "../data/models";
import { useFontScale } from "../contexts/FontSizeContext";

const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;
const MIN_MENU_WIDTH = 220;
const PREFERRED_MAX_HEIGHT = 420;
const CLI_RECHECK_INTERVAL_MS = 5000;
const DEFAULT_CLI_INSTALL_STATUS = { claude: true, codex: true };

const PROVIDER_INSTALL_GUIDES = {
  claude: { url: "https://docs.claude.com/en/docs/claude-code/setup", label: "Install Claude Code\u2026" },
  codex:  { url: "https://developers.openai.com/codex/cli",           label: "Install Codex CLI\u2026"   },
};

function extractMulticaErrorStatus(err) {
  if (!err) return null;
  if (typeof err.status === "number") return err.status;
  const msg = err.message || String(err);
  const m = msg.match(/multica \S+ \S+ (\d+):/);
  return m ? Number(m[1]) : null;
}

export default function ModelPicker({ value, onChange, extraModels = [], extraError = null, extraLoading = false }) {
  const s = useFontScale();
  const [open, set] = useState(false);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);
  const [cliInstalled, setCliInstalled] = useState(null);
  const cliCheckedAtRef = useRef(0);
  const cliProbePromiseRef = useRef(null);
  const m = getMOrMulticaFallback(value, extraModels);

  const probeCliInstalled = useCallback(async ({ force = false } = {}) => {
    if (cliProbePromiseRef.current) return cliProbePromiseRef.current;

    if (!window.api?.checkCliInstalled) {
      setCliInstalled(DEFAULT_CLI_INSTALL_STATUS);
      cliCheckedAtRef.current = Date.now();
      return DEFAULT_CLI_INSTALL_STATUS;
    }

    if (force) {
      setCliInstalled(null);
    }

    const probePromise = (async () => {
      try {
        const result = await window.api.checkCliInstalled({ force });
        if (result) {
          setCliInstalled(result);
          cliCheckedAtRef.current = Date.now();
          return result;
        }
      } catch {
        setCliInstalled(DEFAULT_CLI_INSTALL_STATUS);
        cliCheckedAtRef.current = Date.now();
        return DEFAULT_CLI_INSTALL_STATUS;
      }

      return null;
    })();

    cliProbePromiseRef.current = probePromise;
    try {
      return await probePromise;
    } finally {
      if (cliProbePromiseRef.current === probePromise) {
        cliProbePromiseRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void probeCliInstalled();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [probeCliInstalled]);

  useEffect(() => {
    if (!open) return;
    if (!cliInstalled) {
      const timerId = window.setTimeout(() => {
        void probeCliInstalled();
      }, 0);
      return () => window.clearTimeout(timerId);
    }
    if ((Date.now() - cliCheckedAtRef.current) > CLI_RECHECK_INTERVAL_MS) {
      const timerId = window.setTimeout(() => {
        void probeCliInstalled({ force: true });
      }, 0);
      return () => window.clearTimeout(timerId);
    }
  }, [cliInstalled, open, probeCliInstalled]);

  useEffect(() => {
    if (!cliInstalled || !onChange) return;

    const currentProvider = m.provider;
    if (!PROVIDER_INSTALL_GUIDES[currentProvider] || cliInstalled[currentProvider] !== false) return;

    const fallback = [...MODELS, ...extraModels].find((candidate) => {
      if (candidate.id === value) return false;
      const guide = PROVIDER_INSTALL_GUIDES[candidate.provider];
      return !guide || cliInstalled[candidate.provider] !== false;
    });

    if (fallback && fallback.id !== value) {
      onChange(fallback.id);
    }
  }, [cliInstalled, extraModels, m.provider, onChange, value]);

  const updateMenuPosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const menuWidth = Math.max(MIN_MENU_WIDTH, rect.width);
    const left = Math.max(
      VIEWPORT_PADDING,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - VIEWPORT_PADDING)
    );
    const spaceBelow = viewportHeight - rect.bottom - MENU_GAP - VIEWPORT_PADDING;
    const spaceAbove = rect.top - MENU_GAP - VIEWPORT_PADDING;
    const placeAbove = spaceBelow < Math.min(PREFERRED_MAX_HEIGHT, 220) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(PREFERRED_MAX_HEIGHT, placeAbove ? spaceAbove : spaceBelow));
    setMenuStyle({
      top: placeAbove ? rect.top - MENU_GAP - maxHeight : rect.bottom + MENU_GAP,
      left,
      width: menuWidth,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    const h = (e) => {
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setMenuStyle(null);
      set(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (!open || !ref.current) return;
    const handleResize = () => updateMenuPosition();
    window.addEventListener("resize", handleResize);
    const ro = new ResizeObserver(handleResize);
    ro.observe(ref.current);
    return () => {
      window.removeEventListener("resize", handleResize);
      ro.disconnect();
    };
  }, [open, updateMenuPosition]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => {
          if (open) {
            set(false);
            setMenuStyle(null);
            return;
          }
          updateMenuPosition();
          set(true);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          padding: "4px 12px",
          background: "color-mix(in srgb, var(--control-bg) 50%, transparent)",
          border: "1px solid var(--control-bg)",
          borderRadius: 7,
          color: "color-mix(in srgb, var(--text-primary) 43%, transparent)",
          fontSize: s(10),
          fontFamily: "'JetBrains Mono',monospace",
          cursor: "pointer",
          transition: "all .2s",
          letterSpacing: ".06em",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--text-primary) 11%, transparent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--control-bg)"; }}
      >
        {m.tag} <ChevronDown size={11} strokeWidth={2} />
      </button>

      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: menuStyle.top,
            left: menuStyle.left,
            zIndex: 400,
            width: menuStyle.width,
            maxHeight: menuStyle.maxHeight,
            overflowY: "auto",
            background: "var(--pane-elevated)",
            backdropFilter: "blur(48px) saturate(1.2)",
            border: "1px solid var(--pane-border)",
            borderRadius: 10,
            padding: 3,
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            animation: "dropIn .15s ease",
            WebkitAppRegion: "no-drag",
          }}
        >
          {(() => {
            const all = [...MODELS, ...extraModels];
            return ["claude", "codex", "multica"].map((provider, gi) => {
              const entries = all.filter((mm) => mm.provider === provider);
              const isMulticaEmpty = provider === "multica" && entries.length === 0;
              const guide = PROVIDER_INSTALL_GUIDES[provider];
              const cliKnown = !guide || Object.prototype.hasOwnProperty.call(cliInstalled || {}, provider);
              const cliUnknown = Boolean(guide) && !cliKnown;
              const cliMissing = Boolean(guide) && cliKnown && cliInstalled[provider] === false;
              return (
                <div key={provider}>
                  {gi > 0 && <div style={{ height: 1, background: "var(--control-bg)", margin: "4px 8px" }} />}
                  <div style={{ padding: gi === 0 ? "6px 10px 2px" : "4px 10px 2px", fontSize: s(8), color: "color-mix(in srgb, var(--text-primary) 22%, transparent)", letterSpacing: ".12em", fontFamily: "'JetBrains Mono',monospace" }}>
                    {provider.toUpperCase()}
                  </div>
                  {cliUnknown && (
                    <button
                      key={`${provider}-checking`}
                      disabled
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        width: "100%",
                        padding: "9px 13px",
                        background: "transparent",
                        border: "none",
                        borderRadius: 7,
                        color: "color-mix(in srgb, var(--text-primary) 43%, transparent)",
                        fontSize: s(11),
                        fontFamily: "'JetBrains Mono',monospace",
                        cursor: "default",
                        textAlign: "left",
                        opacity: 0.5,
                      }}
                    >
                      {`Checking ${provider.toUpperCase()} CLI\u2026`}
                    </button>
                  )}
                  {cliMissing && (
                    <button
                      key={`${provider}-install`}
                      onClick={() => {
                        window.open(guide.url, "_blank", "noopener,noreferrer");
                        setMenuStyle(null);
                        set(false);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        width: "100%",
                        padding: "9px 13px",
                        background: "transparent",
                        border: "none",
                        borderRadius: 7,
                        color: "color-mix(in srgb, var(--text-primary) 43%, transparent)",
                        fontSize: s(11),
                        fontFamily: "'JetBrains Mono',monospace",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all .12s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "color-mix(in srgb, var(--control-bg) 63%, transparent)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      {guide.label}
                    </button>
                  )}
                  {isMulticaEmpty && (() => {
                    const status = extractMulticaErrorStatus(extraError);
                    if (extraLoading && !extraError) {
                      return (
                        <button
                          key="multica-loading"
                          disabled
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-start",
                            width: "100%",
                            padding: "9px 13px",
                            background: "transparent",
                            border: "none",
                            borderRadius: 7,
                            color: "color-mix(in srgb, var(--text-primary) 43%, transparent)",
                            fontSize: s(11),
                            fontFamily: "'JetBrains Mono',monospace",
                            cursor: "default",
                            textAlign: "left",
                            opacity: 0.5,
                          }}
                        >
                          {"Loading agents\u2026"}
                        </button>
                      );
                    }
                    if (extraError && status === 401) {
                      return (
                        <button
                          key="multica-reconnect"
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent("open-multica-setup"));
                            setMenuStyle(null);
                            set(false);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                            padding: "9px 13px",
                            background: "transparent",
                            border: "none",
                            borderRadius: 7,
                            color: "color-mix(in srgb, var(--text-primary) 43%, transparent)",
                            fontSize: s(11),
                            fontFamily: "'JetBrains Mono',monospace",
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "all .12s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "color-mix(in srgb, var(--control-bg) 63%, transparent)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          {"Session expired \u2014 reconnect"}
                        </button>
                      );
                    }
                    if (extraError && (status === 403 || status === 404)) {
                      const raw = (extraError.message || String(extraError)).split("\n")[0];
                      const text = raw.length > 80 ? raw.slice(0, 79) + "\u2026" : raw;
                      return (
                        <button
                          key="multica-error-verbatim"
                          disabled
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-start",
                            width: "100%",
                            padding: "9px 13px",
                            background: "transparent",
                            border: "none",
                            borderRadius: 7,
                            color: "color-mix(in srgb, var(--text-primary) 43%, transparent)",
                            fontSize: s(11),
                            fontFamily: "'JetBrains Mono',monospace",
                            cursor: "not-allowed",
                            textAlign: "left",
                            opacity: 0.4,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={extraError.message || String(extraError)}
                        >
                          {text}
                        </button>
                      );
                    }
                    if (extraError) {
                      const raw = (extraError.message || String(extraError)).split("\n")[0];
                      const text = raw.length > 80 ? raw.slice(0, 79) + "\u2026" : raw;
                      return (
                        <button
                          key="multica-error"
                          disabled
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-start",
                            width: "100%",
                            padding: "9px 13px",
                            background: "transparent",
                            border: "none",
                            borderRadius: 7,
                            color: "color-mix(in srgb, var(--text-primary) 43%, transparent)",
                            fontSize: s(11),
                            fontFamily: "'JetBrains Mono',monospace",
                            cursor: "not-allowed",
                            textAlign: "left",
                            opacity: 0.4,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={extraError.message || String(extraError)}
                        >
                          {text}
                        </button>
                      );
                    }
                    return (
                      <button
                        key="multica-connect"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent("open-multica-setup"));
                          setMenuStyle(null);
                          set(false);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          width: "100%",
                          padding: "9px 13px",
                          background: "transparent",
                          border: "none",
                          borderRadius: 7,
                          color: "color-mix(in srgb, var(--text-primary) 43%, transparent)",
                          fontSize: s(11),
                          fontFamily: "'JetBrains Mono',monospace",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "all .12s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "color-mix(in srgb, var(--control-bg) 63%, transparent)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        {"Connect Multica\u2026"}
                      </button>
                    );
                  })()}
                  {!cliUnknown && !cliMissing && entries.map((mm) => (
                    <button
                      key={mm.id}
                      onClick={() => { onChange(mm.id); setMenuStyle(null); set(false); }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "9px 13px",
                        background: mm.id === value ? "var(--control-bg)" : "transparent",
                        border: "none",
                        borderRadius: 7,
                        color: mm.id === value ? "var(--text-primary)" : "color-mix(in srgb, var(--text-primary) 43%, transparent)",
                        fontSize: s(11),
                        fontFamily: "'JetBrains Mono',monospace",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all .12s",
                      }}
                      onMouseEnter={(e) => { if (mm.id !== value) e.currentTarget.style.background = "color-mix(in srgb, var(--control-bg) 63%, transparent)"; }}
                      onMouseLeave={(e) => { if (mm.id !== value) e.currentTarget.style.background = "transparent"; }}
                    >
                      {mm.name}
                      <span style={{ fontSize: s(9), opacity: 0.4, letterSpacing: ".1em" }}>{mm.tag}</span>
                    </button>
                  ))}
                </div>
              );
            });
          })()}
        </div>,
        document.body
      )}
    </div>
  );
}
