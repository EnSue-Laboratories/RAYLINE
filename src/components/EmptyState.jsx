import { useState, useEffect } from "react";
import { useFontScale } from "../contexts/FontSizeContext";

const ACCENT = "#FF4422";
const PRIMARY = "rgb(200, 200, 200)";

export default function EmptyState() {
  const s = useFontScale();
  const [info, setInfo] = useState(null);

  useEffect(() => {
    window.api?.getSystemInfo?.().then(setInfo).catch(() => {});
  }, []);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
        userSelect: "none",
      }}
    >
      <style>{`
        @keyframes rl-rise {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes rl-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.45; transform: scale(0.82); }
        }
        @keyframes rl-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .rl-lockup .rl-letter { animation: rl-rise 520ms cubic-bezier(.2,.8,.2,1) both; }
        .rl-lockup .rl-letter:nth-child(1) { animation-delay:  40ms; }
        .rl-lockup .rl-letter:nth-child(2) { animation-delay: 110ms; }
        .rl-lockup .rl-letter:nth-child(3) { animation-delay: 180ms; }
        .rl-lockup .rl-letter:nth-child(4) { animation-delay: 250ms; }
        .rl-lockup .rl-letter:nth-child(5) { animation-delay: 320ms; }
        .rl-lockup .rl-letter:nth-child(6) { animation-delay: 390ms; }
        .rl-lockup .rl-letter:nth-child(7) { animation-delay: 460ms; }
        .rl-lockup .rl-slash {
          animation: rl-rise 520ms cubic-bezier(.2,.8,.2,1) both;
          animation-delay: 90ms;
          transform-origin: center;
        }
        .rl-lockup .rl-dot {
          animation: rl-rise 520ms cubic-bezier(.2,.8,.2,1) both, rl-dot 2.4s ease-in-out 800ms infinite;
          animation-delay: 520ms, 800ms;
          transform-origin: center;
          transform-box: fill-box;
        }
        .rl-tagline  { animation: rl-fade 720ms ease 720ms both; }
        .rl-sys-1    { animation: rl-fade 600ms ease 900ms both; }
        .rl-sys-2    { animation: rl-fade 600ms ease 1020ms both; }
        .rl-sys-3    { animation: rl-fade 600ms ease 1140ms both; }
        .rl-sys-4    { animation: rl-fade 600ms ease 1260ms both; }
      `}</style>

      {/* R/YLINE. lockup */}
      <svg
        className="rl-lockup"
        viewBox="0 0 497 150"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: 420, height: 126, overflow: "visible" }}
        aria-label="RayLine"
      >
        <g fill={PRIMARY} fontFamily="'Inter Tight', 'Inter', system-ui, sans-serif" fontWeight="600" fontSize="100">
          <text className="rl-letter" x="0"       y="120">R</text>
          <line className="rl-slash" x1="111.04" x2="85.12" y1="53.76" y2="114.24"
                stroke={ACCENT} strokeWidth="11.52" strokeLinecap="square" />
          <text className="rl-letter" x="134.8"   y="120">Y</text>
          <text className="rl-letter" x="219.55"  y="120">L</text>
          <text className="rl-letter" x="290.41"  y="120">I</text>
          <text className="rl-letter" x="332.13"  y="120">N</text>
          <g className="rl-letter">
            <rect x="420.52" y="48"     width="44.64"  height="11.52" />
            <rect x="420.52" y="78.24"  width="38.39"  height="11.52" />
            <rect x="420.52" y="108.48" width="44.64"  height="11.52" />
          </g>
          <circle className="rl-dot" cx="489.64" cy="113.52" r="6.48" fill={ACCENT} />
        </g>
      </svg>

      {info && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          marginTop: 32,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        }}>
          <div className="rl-sys-1" style={{
            fontSize: s(13),
            color: "rgba(255,255,255,0.55)",
            letterSpacing: ".06em",
            fontWeight: 500,
          }}>
            {info.user}@{info.hostname}
          </div>
          <div className="rl-sys-2" style={{ fontSize: s(11), color: "rgba(255,255,255,0.32)", letterSpacing: ".04em" }}>
            {info.platform} {info.arch} · {info.cpus} cores · {info.memory}
          </div>
          <div className="rl-sys-3" style={{ fontSize: s(11), color: "rgba(255,255,255,0.22)", letterSpacing: ".04em" }}>
            node {info.nodeVersion} · electron {info.electronVersion}
          </div>
          <div className="rl-sys-4" style={{ fontSize: s(11), color: "rgba(255,255,255,0.16)", letterSpacing: ".04em" }}>
            {info.shell}
          </div>
        </div>
      )}
    </div>
  );
}
