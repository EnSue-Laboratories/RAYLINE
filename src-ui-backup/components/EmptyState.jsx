import { getM } from "../data/models";

export default function EmptyState({ model }) {
  const m = getM(model);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        position: "relative",
      }}
    >
      <div
        style={{
          fontSize: "clamp(64px, 12vw, 140px)",
          fontWeight: 300,
          fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
          color: "rgba(255,255,255,0.06)",
          lineHeight: 0.9,
          textAlign: "center",
          letterSpacing: "-0.04em",
          fontStyle: "italic",
          userSelect: "none",
        }}
      >
        Begin.
      </div>

      <div
        style={{
          fontSize: 10,
          fontFamily: "'JetBrains Mono',monospace",
          color: "rgba(255,255,255,0.15)",
          letterSpacing: ".12em",
        }}
      >
        {m.tag}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 32,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 9,
          fontFamily: "'JetBrains Mono',monospace",
          color: "rgba(255,255,255,0.08)",
          letterSpacing: ".14em",
        }}
      >
        SYS.CORE // ON-LINE
        <span
          style={{
            display: "inline-block",
            width: 3,
            height: 11,
            background: "rgba(255,255,255,0.15)",
            marginLeft: 3,
            verticalAlign: "middle",
            animation: "blink 1.2s steps(1) infinite",
          }}
        />
      </div>
    </div>
  );
}
