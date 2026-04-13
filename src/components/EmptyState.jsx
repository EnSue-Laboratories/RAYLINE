import { useState, useEffect } from "react";

export default function EmptyState() {
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
      {/* RE:LAY logo */}
      <svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg" style={{ width: 420, height: 140 }}>
        <defs>
          <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000000" floodOpacity="0.75"/>
          </filter>
        </defs>
        <g filter="url(#logoGlow)">
          {/* R */}
          <g transform="translate(42, 50)" fill="rgba(255,255,255,0.25)">
            <rect x="0" y="0" width="14" height="100" />
            <path d="M 14 0 L 60 0 L 80 20 L 80 30 L 60 50 L 14 50 Z M 14 14 L 55 14 L 66 25 L 55 36 L 14 36 Z" fillRule="evenodd" />
            <polygon points="35,60 49,60 85,100 71,100" />
          </g>
          {/* E */}
          <g transform="translate(142, 50)" fill="rgba(255,255,255,0.25)">
            <rect x="0" y="0" width="14" height="100" />
            <rect x="14" y="0" width="56" height="14" />
            <rect x="22" y="43" width="48" height="14" />
            <rect x="14" y="86" width="56" height="14" />
          </g>
          {/* : */}
          <g transform="translate(227, 50)" fill="rgba(227,27,35,0.5)">
            <rect x="0" y="25" width="14" height="14" />
            <rect x="0" y="61" width="14" height="14" />
          </g>
          {/* L */}
          <g transform="translate(256, 50)" fill="rgba(255,255,255,0.25)">
            <rect x="0" y="0" width="14" height="100" />
            <rect x="22" y="86" width="53" height="14" />
          </g>
          {/* A */}
          <g transform="translate(346, 50)" fill="rgba(255,255,255,0.25)">
            <polygon points="35,0 49,0 84,100 70,100 42,20 14,100 0,100" />
          </g>
          {/* Y */}
          <g transform="translate(445, 50)" fill="rgba(255,255,255,0.25)">
            <polygon points="0,0 14,0 42,48 70,0 84,0 49,60 35,60" />
            <rect x="35" y="70" width="14" height="30" />
          </g>
          {/* . */}
          <g transform="translate(544, 50)" fill="rgba(227,27,35,0.5)">
            <rect x="0" y="86" width="14" height="14" />
          </g>
        </g>
      </svg>

      {info && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          marginTop: 28,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        }}>
          <div style={{
            fontSize: 15,
            color: "rgba(255,255,255,0.18)",
            letterSpacing: ".06em",
            fontWeight: 500,
          }}>
            {info.user}@{info.hostname}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", letterSpacing: ".04em" }}>
            {info.platform} {info.arch} · {info.cpus} cores · {info.memory}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", letterSpacing: ".04em" }}>
            node {info.nodeVersion} · electron {info.electronVersion}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", letterSpacing: ".04em" }}>
            {info.shell}
          </div>
        </div>
      )}
    </div>
  );
}
