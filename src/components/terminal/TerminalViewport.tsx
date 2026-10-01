import { useEffect } from "react";
import type { TerminalSessionInfo } from "@shared/terminal/types";
import { emitTerminalDebug } from "./debug";
import SessionTerminal, { type SessionTerminalProps } from "./SessionTerminal";

interface TerminalViewportProps extends Omit<SessionTerminalProps, "sessionName" | "isActive"> {
  sessions: readonly TerminalSessionInfo[];
  activeSession: string | null;
}

export default function TerminalViewport({ sessions, activeSession, ...sessionProps }: TerminalViewportProps) {
  const visibleSession = activeSession || sessions[0]?.name || null;

  useEffect(() => {
    emitTerminalDebug("viewport:visible-session", {
      visibleSession,
      sessionNames: sessions.map((session) => session.name),
    });
  }, [sessions, visibleSession]);

  return (
    <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
      {sessions.map((session) => (
        <SessionTerminal
          key={session.name}
          sessionName={session.name}
          isActive={session.name === visibleSession}
          {...sessionProps}
        />
      ))}
    </div>
  );
}
