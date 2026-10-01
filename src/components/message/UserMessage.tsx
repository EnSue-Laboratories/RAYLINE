import { type KeyboardEvent, useState } from "react";
import { FileText, Pencil } from "lucide-react";
import type { UserMessage as UserMessageValue } from "@shared/chat/types";
import { useFontScale } from "../../contexts/FontSizeContext";
import MarkdownText from "../markdown/MarkdownText";
import { TEXT_WRAP_STYLE } from "../markdown/context";
import { CopyBtn } from "./blocks";
import { splitAttachedPrefix } from "./attachedPrefix";
import MessageImage from "./MessageImage";
import { MsgBtn } from "./PartBlocks";
import { MESSAGE_ROOT_STYLE } from "./styles";
import type { EditHandler, MessageCallbacks } from "./types";

interface UserMessageProps extends MessageCallbacks {
  message: UserMessageValue;
  messageIndex: number;
  canEdit: boolean;
  onEdit?: EditHandler;
}

export default function UserMessage({ message, messageIndex, canEdit, onEdit, ...callbacks }: UserMessageProps) {
  const s = useFontScale();
  const isShellCommand = message.mode === "shell-command";
  const { displayText, files } = splitAttachedPrefix(message.text || "", message.files);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(displayText);
  const editChanged = Boolean(editText.trim()) && editText.trim() !== displayText.trim();

  const submitEdit = (): void => {
    if (canEdit && editChanged) onEdit?.(messageIndex, editText.trim());
    setEditing(false);
  };

  const handleEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submitEdit();
    }
    if (event.key === "Escape") {
      setEditing(false);
      setEditText(displayText);
    }
  };

  return (
    <div
      style={{
        ...MESSAGE_ROOT_STYLE,
        marginBottom: 32,
        animation: "msgIn .4s cubic-bezier(.16,1,.3,1)",
        paddingTop: 28,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
      }}
    >
      <div style={{ fontSize: s(9), fontFamily: "var(--font-mono)", color: "var(--text-muted)", letterSpacing: ".14em", marginBottom: 10 }}>
        {isShellCommand ? "SHELL" : "USER"}
      </div>

      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, width: "100%" }}>
          <textarea
            value={editText}
            onChange={(event) => setEditText(event.target.value)}
            onKeyDown={handleEditKeyDown}
            autoFocus
            style={{
              width: "100%",
              background: "var(--control-bg)",
              border: "1px solid var(--control-border)",
              borderRadius: 8,
              color: "var(--text-primary)",
              fontSize: s(15),
              lineHeight: 1.7,
              fontFamily: "var(--font-content)",
              padding: "10px 12px",
              resize: "vertical",
              minHeight: 60,
            }}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setEditText(message.text);
              }}
              style={{ background: "none", border: "1px solid var(--control-border)", borderRadius: 6, color: "var(--text-muted)", padding: "4px 12px", fontSize: s(11), height: 26, cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitEdit}
              disabled={!editChanged}
              style={{
                background: editChanged ? "var(--text-primary)" : "var(--control-bg)",
                border: "1px solid transparent",
                borderRadius: 6,
                color: editChanged ? "var(--text-inverse)" : "var(--text-disabled)",
                padding: "3px 12px",
                fontSize: s(11),
                height: 24,
                cursor: editChanged ? "pointer" : "default",
              }}
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        <>
          {message.images && message.images.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", marginBottom: 8 }}>
              {message.images.map((image, index) => (
                <MessageImage key={index} image={image} />
              ))}
            </div>
          )}

          {files && files.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", marginBottom: 8 }}>
              {files.map((file, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 10px",
                    background: "var(--control-bg)",
                    border: "1px solid var(--control-border)",
                    borderRadius: 6,
                    fontSize: s(11),
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-muted)",
                  }}
                >
                  <FileText size={12} strokeWidth={1.5} />
                  {file.name || file.path?.split("/").pop() || "file"}
                </div>
              ))}
            </div>
          )}

          {isShellCommand ? (
            <div style={{ width: "100%", display: "flex", justifyContent: "flex-end" }}>
              <div
                style={{
                  width: "100%",
                  maxWidth: "85%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--control-border)",
                  background: "linear-gradient(135deg, var(--control-bg), var(--control-bg-subtle))",
                  color: "var(--text-primary)",
                  fontSize: s(12),
                  lineHeight: 1.6,
                  fontFamily: "var(--font-mono)",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>$ </span>
                {displayText}
              </div>
            </div>
          ) : (
            <div
              style={{
                color: "var(--text-primary)",
                fontSize: s(15),
                lineHeight: 1.7,
                fontFamily: "var(--font-content)",
                fontWeight: 400,
                textAlign: "left",
                maxWidth: "85%",
                ...TEXT_WRAP_STYLE,
              }}
            >
              <MarkdownText text={displayText} variant="user" {...callbacks} />
            </div>
          )}
        </>
      )}

      {!editing && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
          <CopyBtn text={displayText} />
          {canEdit && onEdit && <MsgBtn icon={<Pencil size={10} strokeWidth={1.5} />} onClick={() => setEditing(true)} />}
        </div>
      )}
    </div>
  );
}
