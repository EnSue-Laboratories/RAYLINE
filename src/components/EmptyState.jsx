export default function EmptyState() {
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
      {/* Claude Code logo */}
      <svg width="120" height="120" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.15 }}>
        <path d="M96 64 C72 64 64 80 64 104 C64 116 56 128 40 128 C56 128 64 140 64 152 C64 176 72 192 96 192" stroke="rgba(255,255,255,0.8)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M160 64 C184 64 192 80 192 104 C192 116 200 128 216 128 C200 128 192 140 192 152 C192 176 184 192 160 192" stroke="rgba(255,255,255,0.8)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M144 92 A 36 36 0 1 0 144 164" stroke="rgba(255,255,255,0.9)" strokeWidth="16" strokeLinecap="round" />
      </svg>

      <div style={{
        fontSize: 13,
        fontFamily: "'JetBrains Mono',monospace",
        color: "rgba(255,255,255,0.2)",
        letterSpacing: ".2em",
        marginTop: 24,
        textTransform: "uppercase",
      }}>
        Claude Code
      </div>

      <div style={{
        width: 32,
        height: 1,
        background: "rgba(255,255,255,0.1)",
        margin: "18px 0",
      }} />

      <div style={{
        fontSize: 13,
        color: "rgba(255,255,255,0.12)",
        fontFamily: "system-ui,sans-serif",
        letterSpacing: ".1em",
      }}>
        What are you building?
      </div>
    </div>
  );
}
