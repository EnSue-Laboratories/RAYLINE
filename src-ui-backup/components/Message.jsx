import CopyBtn from "./CopyBtn";

export default function Message({ msg }) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div
        style={{
          marginBottom: 6,
          animation: "msgIn .4s cubic-bezier(.16,1,.3,1)",
          textAlign: "right",
          paddingTop: 28,
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontFamily: "'JetBrains Mono',monospace",
            color: "rgba(255,255,255,0.2)",
            letterSpacing: ".14em",
            marginBottom: 10,
          }}
        >
          YOU
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.92)",
            fontSize: 15,
            lineHeight: 1.7,
            fontFamily: "system-ui,-apple-system,sans-serif",
            fontWeight: 400,
          }}
        >
          {msg.text}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        marginBottom: 44,
        animation: "msgIn .4s cubic-bezier(.16,1,.3,1)",
        textAlign: "left",
        paddingTop: 8,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontFamily: "'JetBrains Mono',monospace",
          color: "rgba(255,255,255,0.2)",
          letterSpacing: ".14em",
          marginBottom: 12,
        }}
      >
        RESPONSE
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.75)",
          fontSize: 15,
          lineHeight: 1.85,
          fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
          letterSpacing: "0.008em",
          whiteSpace: "pre-wrap",
        }}
      >
        {msg.text}
      </div>
      <div style={{ marginTop: 8 }}>
        <CopyBtn text={msg.text} />
      </div>
    </div>
  );
}
