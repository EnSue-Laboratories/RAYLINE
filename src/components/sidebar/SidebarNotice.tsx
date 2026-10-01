import type { FontScale } from "./types";

export interface SidebarNoticeProps {
  s: FontScale;
  title: string;
  hint: string;
  /** Fill the list (no chats at all) vs. a fixed block (no search hits). */
  fill?: boolean;
}

/** Centered two-line notice in the conversation list. */
export default function SidebarNotice({ s, title, hint, fill = false }: SidebarNoticeProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        ...(fill ? { height: "100%" } : { minHeight: 180 }),
        gap: 8,
        padding: "40px 20px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: s(11), fontFamily: "var(--font-mono)", color: "var(--sb-text-ghost)", letterSpacing: ".08em" }}>
        {title}
      </div>
      <div style={{ fontSize: s(10), color: "var(--sb-text-ghosted)", fontFamily: "var(--font-ui)" }}>{hint}</div>
    </div>
  );
}
