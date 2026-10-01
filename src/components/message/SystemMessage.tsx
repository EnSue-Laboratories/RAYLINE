import { Terminal } from "lucide-react";
import type { SystemMessage as SystemMessageValue } from "@shared/chat/types";
import { useFontScale } from "../../contexts/FontSizeContext";
import MarkdownText from "../markdown/MarkdownText";
import { CopyBtn } from "./blocks";
import { MESSAGE_ROOT_STYLE } from "./styles";
import type { MessageCallbacks } from "./types";

/** Local shell-mode output. */
export default function SystemMessage({ message, ...callbacks }: { message: SystemMessageValue } & MessageCallbacks) {
  const s = useFontScale();
  const text = message.text || "";
  return (
    <div style={{ ...MESSAGE_ROOT_STYLE, marginBottom: 28, animation: "msgIn .4s cubic-bezier(.16,1,.3,1)", textAlign: "left" }}>
      <div
        style={{
          maxWidth: "88%",
          padding: "14px 16px 12px",
          borderRadius: 14,
          border: "1px solid var(--control-border)",
          background: "linear-gradient(180deg, var(--control-bg), var(--control-bg-subtle))",
          boxShadow: "0 20px 40px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            fontSize: s(9),
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
            letterSpacing: ".14em",
          }}
        >
          <Terminal size={12} strokeWidth={1.7} />
          OUTPUT
        </div>
        <div style={{ color: "var(--text-primary)", fontSize: s(14), lineHeight: 1.75, fontFamily: "var(--font-content)", letterSpacing: "0.006em" }}>
          <MarkdownText text={text} {...callbacks} />
        </div>
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
        <CopyBtn text={text} />
      </div>
    </div>
  );
}
