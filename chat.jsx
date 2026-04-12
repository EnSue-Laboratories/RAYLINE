import { useState, useRef, useEffect, useCallback } from "react";

/* ═══════ ICONS ═══════ */
const I = {
  Plus:()=>(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>),
  Arrow:()=>(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>),
  Chev:()=>(<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>),
  Search:()=>(<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>),
  Trash:()=>(<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>),
  Panel:()=>(<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>),
  Copy:()=>(<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>),
  Check:()=>(<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>),
};

/* ═══════ DATA ═══════ */
const MODELS = [
  { id: "claude-opus", name: "Claude Opus", tag: "OPUS" },
  { id: "claude-sonnet", name: "Claude Sonnet", tag: "SONNET" },
  { id: "gpt-4o", name: "GPT-4o", tag: "4O" },
  { id: "gemini-pro", name: "Gemini Pro", tag: "GEMINI" },
];
const getM = (id) => MODELS.find((m) => m.id === id) || MODELS[0];

const CONVOS_INIT = [
  { id: "1", title: "Refactoring the orchestration layer", model: "claude-opus", ts: "2m", msgs: [
    { id: "a", role: "user", text: "How should I structure the adapter pattern for multi-model routing in my orchestration layer?" },
    { id: "b", role: "assistant", text: "Define a unified interface — something like ModelAdapter with complete(), stream(), and capabilities() methods. Each provider adapter implements this interface, normalizing request/response shapes.\n\nThe key insight: your orchestrator shouldn't know or care which model it's talking to. It expresses intent through the adapter interface, and the adapter handles provider-specific serialization, auth, error handling, and response normalization.\n\nKeep the adapters stateless. Session tracking and conversation history belong in the orchestration layer, not in the adapters themselves." },
    { id: "c", role: "user", text: "What about handling streaming differences across providers?" },
    { id: "d", role: "assistant", text: "Each provider streams differently — SSE, WebSocket, chunked JSON — but your adapter can normalize all of them into a single async iterator interface.\n\nDefine a StreamChunk type with fields like delta, metadata, and done. Each adapter's stream() method returns AsyncIterable<StreamChunk> regardless of the underlying transport. The orchestrator consumes a uniform stream.\n\nFor the edge cases: handle backpressure at the adapter level, implement reconnection logic per-provider, and emit structured error chunks rather than throwing mid-stream." },
  ]},
  { id: "2", title: "WhisperKit chunked pipeline", model: "claude-sonnet", ts: "1h", msgs: [
    { id: "e", role: "user", text: "What's the optimal chunk size for local WhisperKit transcription on Apple Silicon?" },
    { id: "f", role: "assistant", text: "Chunking at VAD boundaries gives you the best quality-to-latency tradeoff on Apple Silicon. Aim for 25-30 second segments with voice activity detection marking the split points — this avoids cutting mid-word while keeping memory pressure manageable on the Neural Engine.\n\nThe base model handles these chunks in near-realtime on M1+. For the medium model, expect ~0.8x realtime on M2 Pro, which is still acceptable for lecture capture where you're buffering ahead of playback." },
  ]},
  { id: "3", title: "SYNCat protocol design", model: "gpt-4o", ts: "3h", msgs: [
    { id: "g", role: "user", text: "Should SYNCat use CRDTs or an append-only log for multi-agent state sync?" },
    { id: "h", role: "assistant", text: "The append-only log is the right primitive here. CRDTs solve a different problem — they're for concurrent human editors who need convergence without coordination. Your agents operate sequentially within a session, and the orchestrator already serializes their turns.\n\nAn append-only log with structured entries gives you full auditability, easy replay, and natural conflict resolution through the challenge/revision mechanic." },
  ]},
  { id: "4", title: "Translation framework on Tahoe", model: "claude-sonnet", ts: "Yesterday", msgs: [
    { id: "i", role: "user", text: "What's the best way to invoke Apple's Translation framework for a floating popover utility?" },
    { id: "j", role: "assistant", text: "Create a TranslationSession per language pair, keep it alive for the app's lifecycle to avoid cold-start latency. For a PopClip-style floating button, hook into the accessibility selection notification, grab the selected text, and route it through a pre-warmed session.\n\nThe framework handles model downloading automatically, but you should pre-download common language pairs on first launch." },
  ]},
  { id: "5", title: "CC-Bridge WebSocket architecture", model: "claude-opus", ts: "2d", msgs: [
    { id: "k", role: "user", text: "Walk me through the WebSocket relay design for CC-Bridge." },
    { id: "l", role: "assistant", text: "The relay sits between Claude Code and Codex as a neutral WebSocket server. Each agent connects as a client, authenticates with a session token, and gets assigned a role in the shared workspace.\n\nMessages are typed envelopes — think { type: 'proposal' | 'challenge' | 'revision', payload, sender, seq }. The relay enforces ordering via sequence numbers and broadcasts to all connected agents. No intelligence lives in the relay; it's pure plumbing." },
  ]},
];

/* ═══════ ORGANIC AURORA CANVAS ═══════ */
function AuroraCanvas() {
  const ref = useRef(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    let w, h, raf;

    var gap = 28;
    var dotBase = 0.08;
    var dotR = 0.8;

    var orbList = [
      { phase: 0, speedX: 0.3, speedY: 0.2, radius: 220, cx: 0.6, cy: 0.35 },
      { phase: 1.8, speedX: 0.22, speedY: 0.28, radius: 180, cx: 0.3, cy: 0.6 },
      { phase: 3.5, speedX: 0.18, speedY: 0.35, radius: 160, cx: 0.8, cy: 0.2 },
    ];

    var cols, rows, dots;

    const resize = () => {
      w = c.width = window.innerWidth;
      h = c.height = window.innerHeight;
      cols = Math.ceil(w / gap) + 1;
      rows = Math.ceil(h / gap) + 1;
      dots = cols * rows;
    };
    resize();

    let t = 0;
    const draw = () => {
      t += 0.003;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);

      // Compute orb positions
      var orbPositions = [];
      for (var oi = 0; oi < orbList.length; oi++) {
        var ob = orbList[oi];
        orbPositions.push({
          x: w * ob.cx + Math.sin(t * ob.speedX + ob.phase) * w * 0.15,
          y: h * ob.cy + Math.cos(t * ob.speedY + ob.phase) * h * 0.12,
          r: ob.radius + Math.sin(t * 0.4 + ob.phase) * 40,
        });
      }

      // Draw dots
      for (var row = 0; row < rows; row++) {
        var dy = row * gap;
        for (var col = 0; col < cols; col++) {
          var dx = col * gap;

          // Find max influence from orbs
          var maxInfluence = 0;
          for (var k = 0; k < orbPositions.length; k++) {
            var op = orbPositions[k];
            var distX = dx - op.x;
            var distY = dy - op.y;
            var dist = Math.sqrt(distX * distX + distY * distY);
            var influence = 1 - dist / op.r;
            if (influence < 0) influence = 0;
            // Smooth falloff
            influence = influence * influence * (3 - 2 * influence);
            if (influence > maxInfluence) maxInfluence = influence;
          }

          var alpha = dotBase + maxInfluence * 0.7;
          var radius = dotR + maxInfluence * 1.2;

          ctx.beginPath();
          ctx.arc(dx, dy, radius, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255," + alpha + ")";
          ctx.fill();
        }
      }

      // Soft glow halo behind each orb
      for (var gi = 0; gi < orbPositions.length; gi++) {
        var gp = orbPositions[gi];
        var grad = ctx.createRadialGradient(gp.x, gp.y, 0, gp.x, gp.y, gp.r * 0.7);
        grad.addColorStop(0, "rgba(255,255,255,0.018)");
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gp.x, gp.y, gp.r * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    draw();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={ref} style={{ position: "fixed", inset: 0, zIndex: 0, background: "#000" }} />;
}

/* ═══════ FILM GRAIN ═══════ */
function Grain() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    var frames = [];
    var tm;

    const gen = () => {
      c.width = Math.ceil(window.innerWidth / 3);
      c.height = Math.ceil(window.innerHeight / 3);
      frames = [];
      for (var f = 0; f < 5; f++) {
        var d = ctx.createImageData(c.width, c.height);
        var b = new Uint32Array(d.data.buffer);
        for (var i = 0; i < b.length; i++) {
          if (Math.random() < 0.07) b[i] = 0x06000000;
        }
        frames.push(d);
      }
    };
    gen();
    var fi = 0;
    const loop = () => {
      if (frames.length > 0) {
        ctx.putImageData(frames[fi % frames.length], 0, 0);
        fi++;
      }
      tm = setTimeout(() => requestAnimationFrame(loop), 100);
    };
    loop();
    window.addEventListener("resize", gen);
    return () => { clearTimeout(tm); window.removeEventListener("resize", gen); };
  }, []);

  return <canvas ref={ref} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1, opacity: 0.4, mixBlendMode: "overlay" }} />;
}

/* ═══════ COPY BTN ═══════ */
function CopyBtn({ text }) {
  const [ok, set] = useState(false);
  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    set(true);
    setTimeout(() => set(false), 1400);
  };
  return (
    <button onClick={handleCopy}
      style={{ background: "none", border: "none", color: ok ? "rgba(160,200,140,0.5)" : "rgba(255,255,255,0.07)", cursor: "pointer", padding: "2px 4px", borderRadius: 3, transition: "color .2s", display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }}
      onMouseEnter={(e) => { if (!ok) e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
      onMouseLeave={(e) => { if (!ok) e.currentTarget.style.color = "rgba(255,255,255,0.07)"; }}
    >{ok ? <I.Check /> : <I.Copy />}{ok ? "copied" : ""}</button>
  );
}

/* ═══════ MODEL PICKER ═══════ */
function ModelPicker({ value, onChange }) {
  const [open, set] = useState(false);
  const ref = useRef(null);
  const m = getM(value);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) set(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => set(!open)} style={{
        display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 7,
        color: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
        cursor: "pointer", transition: "all .2s", letterSpacing: ".06em",
      }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"; }}
      >{m.tag} <I.Chev /></button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 200, minWidth: 180,
          background: "rgba(8,8,12,0.92)", backdropFilter: "blur(32px)",
          border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 3,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)", animation: "dropIn .15s ease",
        }}>
          {MODELS.map((mm) => (
            <button key={mm.id} onClick={() => { onChange(mm.id); set(false); }} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "9px 13px",
              background: mm.id === value ? "rgba(255,255,255,0.04)" : "transparent",
              border: "none", borderRadius: 7, color: mm.id === value ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
              fontSize: 11, fontFamily: "'JetBrains Mono',monospace", cursor: "pointer", textAlign: "left", transition: "all .12s",
            }}
              onMouseEnter={(e) => { if (mm.id !== value) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
              onMouseLeave={(e) => { if (mm.id !== value) e.currentTarget.style.background = "transparent"; }}
            >
              {mm.name}
              <span style={{ fontSize: 9, opacity: 0.3, letterSpacing: ".1em" }}>{mm.tag}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════ MESSAGE ═══════ */
function Msg({ msg }) {
  const isU = msg.role === "user";
  if (isU) {
    return (
      <div style={{ marginBottom: 6, animation: "msgIn .4s cubic-bezier(.16,1,.3,1)", textAlign: "right", paddingTop: 28 }}>
        <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.1)", letterSpacing: ".14em", marginBottom: 10 }}>YOU</div>
        <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 15, lineHeight: 1.7, fontFamily: "system-ui,-apple-system,sans-serif", fontWeight: 400 }}>{msg.text}</div>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 44, animation: "msgIn .4s cubic-bezier(.16,1,.3,1)", textAlign: "left", paddingTop: 8 }}>
      <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.1)", letterSpacing: ".14em", marginBottom: 12 }}>RESPONSE</div>
      <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 15, lineHeight: 1.85, fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif", letterSpacing: "0.008em", whiteSpace: "pre-wrap" }}>{msg.text}</div>
      <div style={{ marginTop: 8 }}><CopyBtn text={msg.text} /></div>
    </div>
  );
}

/* ═══════ EMPTY STATE ═══════ */
function EmptyState({ model }) {
  const m = getM(model);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, position: "relative" }}>
      <div style={{
        fontSize: "clamp(64px, 12vw, 140px)", fontWeight: 300,
        fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
        color: "rgba(255,255,255,0.035)", lineHeight: 0.9, textAlign: "center",
        letterSpacing: "-0.04em", fontStyle: "italic", userSelect: "none",
      }}>Begin.</div>
      <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.08)", letterSpacing: ".12em" }}>{m.tag}</div>
      <div style={{
        position: "absolute", bottom: 32, left: 0, right: 0, textAlign: "center",
        fontSize: 9, fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.04)", letterSpacing: ".14em",
      }}>
        SYS.CORE // ON-LINE
        <span style={{ display: "inline-block", width: 3, height: 11, background: "rgba(255,255,255,0.1)", marginLeft: 3, verticalAlign: "middle", animation: "blink 1.2s steps(1) infinite" }} />
      </div>
    </div>
  );
}

/* ═══════ APP ═══════ */
export default function App() {
  const [convos, setConvos] = useState(CONVOS_INIT);
  const [active, setActive] = useState("1");
  const [sb, setSb] = useState(true);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [sf, setSf] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const endRef = useRef(null);
  const inRef = useRef(null);

  const convo = convos.find((c) => c.id === active);
  const filtered = convos.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [convo?.msgs?.length]);

  const send = useCallback(() => {
    if (!input.trim() || !convo) return;
    var u = { id: "u" + Date.now(), role: "user", text: input.trim() };
    var a = { id: "a" + Date.now(), role: "assistant", text: "This is a frontend prototype. The adapter layer would stream the response here, token by token, through the unified ModelAdapter interface." };
    setConvos((p) => p.map((c) => c.id === active ? { ...c, msgs: [...c.msgs, u, a], ts: "now" } : c));
    setInput("");
  }, [input, convo, active]);

  const newChat = () => {
    var n = { id: "n" + Date.now(), title: "Untitled thread", model: "claude-opus", ts: "now", msgs: [] };
    setConvos((p) => [n, ...p]);
    setActive(n.id);
  };

  const del = (id, e) => {
    e.stopPropagation();
    var r = convos.filter((c) => c.id !== id);
    setConvos(r);
    if (active === id) setActive(r[0]?.id || null);
  };

  const setModel = (mid) => setConvos((p) => p.map((c) => c.id === active ? { ...c, model: mid } : c));

  const handleInput = (e) => {
    setInput(e.target.value);
    var el = e.target;
    el.style.height = "20px";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
      if (inRef.current) inRef.current.style.height = "20px";
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,300;0,400;0,600;1,300;1,400&family=JetBrains+Mono:wght@300;400;500&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
        ::-webkit-scrollbar{width:2px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.03);border-radius:2px;}
        @keyframes dropIn{from{opacity:0;transform:translateY(-5px);}to{opacity:1;transform:translateY(0);}}
        @keyframes msgIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
        @keyframes fadeSlide{from{opacity:0;transform:translateX(-6px);}to{opacity:1;transform:translateX(0);}}
        @keyframes blink{0%,100%{opacity:1;}50%{opacity:0;}}
        textarea::placeholder,input::placeholder{color:rgba(255,255,255,0.12);}
        textarea:focus,input:focus{outline:none;}
      `}</style>

      <AuroraCanvas />
      <Grain />

      {/* Sidebar */}
      <div style={{
        width: sb ? 264 : 0, minWidth: sb ? 264 : 0,
        borderRight: sb ? "1px solid rgba(255,255,255,0.025)" : "none",
        display: "flex", flexDirection: "column", position: "relative", zIndex: 10,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(56px) saturate(1.1)",
        transition: "all .35s cubic-bezier(.16,1,.3,1)", overflow: "hidden",
      }}>
        <div style={{ padding: "22px 20px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 15, fontWeight: 400, color: "rgba(255,255,255,0.55)", fontStyle: "italic" }}>Nexus</span>
          <button onClick={newChat} style={{
            display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 7,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.35)", cursor: "pointer", transition: "all .2s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
          ><I.Plus /></button>
        </div>

        <div style={{ padding: "0 12px 10px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 7, padding: "6px 10px",
            background: sf ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.008)",
            border: "1px solid " + (sf ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)"),
            borderRadius: 8, transition: "all .2s",
          }}>
            <span style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }}><I.Search /></span>
            <input type="text" placeholder="Search..." value={search}
              onChange={(e) => setSearch(e.target.value)} onFocus={() => setSf(true)} onBlur={() => setSf(false)}
              style={{ flex: 1, background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "2px 6px" }}>
          {filtered.map((c, i) => {
            var act = c.id === active;
            var cm = getM(c.model);
            return (
              <div key={c.id} onClick={() => setActive(c.id)} style={{
                padding: "12px 12px", borderRadius: 8, cursor: "pointer", marginBottom: 1,
                background: act ? "rgba(255,255,255,0.035)" : "transparent",
                transition: "all .12s", animation: "fadeSlide .2s ease " + (i * 0.03) + "s both",
              }}
                onMouseEnter={(e) => { if (!act) e.currentTarget.style.background = "rgba(255,255,255,0.018)"; }}
                onMouseLeave={(e) => { if (!act) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: act ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.32)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "system-ui,sans-serif", marginBottom: 4 }}>{c.title}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Newsreader',Georgia,serif", fontStyle: "italic" }}>{c.msgs.length > 0 ? c.msgs[c.msgs.length - 1].text.slice(0, 45) : "Empty"}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono',monospace" }}>{c.ts}</span>
                    {act && (
                      <button onClick={(e) => del(c.id, e)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.15)", cursor: "pointer", padding: 1, transition: "color .15s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(200,80,80,0.5)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.15)"; }}
                      ><I.Trash /></button>
                    )}
                  </div>
                </div>
                <div style={{ marginTop: 6, fontSize: 9, fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.25)", letterSpacing: ".08em" }}>{cm.tag}</div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.02)", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 8, fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.18)", letterSpacing: ".1em" }}>{convos.length} THREADS</span>
          <span style={{ fontSize: 8, fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.12)", letterSpacing: ".06em" }}>V0.3</span>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 10 }}>
        <div style={{
          padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.02)",
          background: "rgba(0,0,0,0.2)", backdropFilter: "blur(24px)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button onClick={() => setSb(!sb)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 7, background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", transition: "color .2s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.25)"; }}
            ><I.Panel /></button>
            {convo && (
              <div style={{ animation: "dropIn .2s ease" }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", fontFamily: "system-ui,sans-serif" }}>{convo.title}</div>
                <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.07)", marginTop: 1, letterSpacing: ".08em" }}>{convo.msgs.length} MESSAGES</div>
              </div>
            )}
          </div>
          {convo && <ModelPicker value={convo.model} onChange={setModel} />}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "32px 28px", display: "flex", flexDirection: "column" }}>
          {(!convo || convo.msgs.length === 0)
            ? <EmptyState model={convo?.model || "claude-opus"} />
            : (
              <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", flex: 1 }}>
                {convo.msgs.map((m) => <Msg key={m.id} msg={m} />)}
                <div ref={endRef} />
              </div>
            )
          }
        </div>

        {/* Input bar */}
        <div style={{ padding: "12px 28px 24px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 480 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "rgba(255,255,255,0.018)",
              border: "1px solid " + (inputFocused ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)"),
              borderRadius: 12, padding: "14px 14px",
              backdropFilter: "blur(20px)", transition: "border-color .25s",
            }}>
              <textarea
                ref={inRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder="Write something..."
                rows={1}
                style={{
                  flex: 1, background: "transparent", border: "none", resize: "none",
                  color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: "20px",
                  fontFamily: "system-ui,sans-serif", maxHeight: 120, height: 20,
                  display: "block", overflow: "hidden",
                }}
              />
              <button
                onClick={() => { send(); if (inRef.current) inRef.current.style.height = "20px"; }}
                disabled={!input.trim()}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  background: input.trim() ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.02)",
                  border: "none",
                  color: input.trim() ? "#000000" : "rgba(255,255,255,0.06)",
                  cursor: input.trim() ? "pointer" : "default",
                  transition: "all .3s cubic-bezier(.16,1,.3,1)",
                  transform: input.trim() ? "scale(1)" : "scale(0.88)",
                }}
              ><I.Arrow /></button>
            </div>
            <div style={{ textAlign: "center", marginTop: 8, fontSize: 8, fontFamily: "'JetBrains Mono',monospace", color: "rgba(255,255,255,0.04)", letterSpacing: ".1em" }}>
              ENTER TO SEND  //  SHIFT+ENTER NEWLINE
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}