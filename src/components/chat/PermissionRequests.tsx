import { type CSSProperties, memo } from "react";
import type { AgentPermissionRequest } from "@shared/chat/types";
import { useFontScale } from "../../contexts/FontSizeContext";
import type { PermissionResponseInput } from "./types";

interface PermissionRequestsProps {
  requests: readonly AgentPermissionRequest[];
  onRespond?: (response: PermissionResponseInput) => void;
}

/** Pending tool-permission prompts above the composer (allow once / session / deny). */
function PermissionRequests({ requests, onRespond }: PermissionRequestsProps) {
  const s = useFontScale();
  const actionButtonStyle: CSSProperties = {
    height: 24,
    padding: "0 9px",
    borderRadius: 7,
    border: "1px solid var(--control-border)",
    background: "transparent",
    color: "var(--text-disabled)",
    cursor: "pointer",
    fontSize: s(9),
    fontFamily: "var(--font-mono)",
    letterSpacing: ".05em",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
  return (
    <div style={{ marginBottom: 8 }}>
      {requests.map((request) => {
        const summary = request.summary || "";
        return (
          <div
            key={request.requestId}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              marginBottom: 4,
              background: "var(--control-bg-subtle)",
              border: "1px solid var(--control-border-soft)",
              borderRadius: 12,
              fontSize: s(12),
              color: "var(--text-subtle)",
              fontFamily: "var(--font-ui)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: s(9), fontFamily: "var(--font-mono)", color: "var(--text-faint)", letterSpacing: ".06em", flexShrink: 0 }}>
                  {request.isSensitiveFile ? "SENSITIVE" : "PERMISSION"}
                </span>
                <span style={{ fontSize: s(9), fontFamily: "var(--font-mono)", color: "var(--text-disabled)", letterSpacing: ".06em" }}>
                  {(request.toolName || "Tool").toUpperCase()}
                </span>
              </div>
              <div
                title={summary}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "2px 8px",
                  transform: "translateY(-1.5px)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  lineHeight: "18px",
                  color: "var(--text-secondary)",
                }}
              >
                {summary}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => onRespond?.({ requestId: request.requestId, behavior: "allow", scope: "once" })}
                style={{ ...actionButtonStyle, background: "var(--control-bg)", color: "var(--text-secondary)" }}
                title="Allow this request once"
              >
                ALLOW ONCE
              </button>
              <button
                type="button"
                onClick={() => onRespond?.({ requestId: request.requestId, behavior: "allow", scope: "session" })}
                style={actionButtonStyle}
                title="Allow this tool + target for the rest of the session"
              >
                ALLOW SESSION
              </button>
              <button type="button" onClick={() => onRespond?.({ requestId: request.requestId, behavior: "deny" })} style={actionButtonStyle} title="Deny this request">
                DENY
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(PermissionRequests);
