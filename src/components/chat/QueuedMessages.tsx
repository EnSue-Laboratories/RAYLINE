import { type CSSProperties, type KeyboardEvent, memo, useCallback, useEffect, useRef, useState } from "react";
import type { QueuedMessage } from "@shared/chat/types";
import { useFontScale } from "../../contexts/FontSizeContext";
import type { Translator } from "../../i18n";

interface QueuedMessagesProps {
  items: readonly QueuedMessage[];
  onUpdate?: (queueId: string, text: string) => void;
  onRemove?: (queueId: string) => void;
  t: Translator;
}

/** Messages queued while the agent is busy, editable in place. */
function QueuedMessages({ items, onUpdate, onRemove, t }: QueuedMessagesProps) {
  const s = useFontScale();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const editRef = useRef<HTMLTextAreaElement>(null);

  const startEdit = useCallback((item: QueuedMessage) => {
    if (!item.id) return;
    setEditingId(item.id);
    setDraft(item.text || "");
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft("");
  }, []);

  const saveEdit = useCallback(
    (queueId: string) => {
      const trimmed = draft.trim();
      if (!trimmed) onRemove?.(queueId);
      else onUpdate?.(queueId, trimmed);
      setEditingId(null);
      setDraft("");
    },
    [draft, onRemove, onUpdate],
  );

  const removeItem = useCallback(
    (queueId: string) => {
      if (editingId === queueId) {
        setEditingId(null);
        setDraft("");
      }
      onRemove?.(queueId);
    },
    [editingId, onRemove],
  );

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, queueId: string): void => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      saveEdit(queueId);
    }
  };

  useEffect(() => {
    if (editingId !== null) editRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    const el = editRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 24), 52)}px`;
  }, [editingId, draft]);

  const buttonStyle: CSSProperties = {
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
  const labelStyle: CSSProperties = { fontSize: s(9), fontFamily: "var(--font-mono)", color: "var(--text-faint)", letterSpacing: ".06em", flexShrink: 0 };

  return (
    <div style={{ marginBottom: 8 }}>
      {items.map((item, index) => {
        const isEditing = editingId === item.id;
        const attachmentCount = item.attachments?.length ?? 0;
        return (
          <div
            key={item.id || index}
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
                <span style={labelStyle}>{index === 0 ? t("chatArea.queuedNext") : t("chatArea.queued")}</span>
                {attachmentCount > 0 && (
                  <span style={labelStyle}>{t("chatArea.attachmentsCount", { value: attachmentCount, suffix: attachmentCount === 1 ? "" : "S" })}</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <textarea
                    ref={editRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => handleDraftKeyDown(event, item.id)}
                    rows={1}
                    style={{
                      width: "100%",
                      background: "var(--control-bg-subtle)",
                      border: "1px solid var(--control-border-soft)",
                      borderRadius: 7,
                      padding: "2px 8px",
                      color: "var(--text-primary)",
                      fontSize: s(12),
                      lineHeight: "18px",
                      fontFamily: "inherit",
                      resize: "none",
                      minHeight: 24,
                      maxHeight: 52,
                      overflowY: "auto",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      minHeight: 24,
                      display: "flex",
                      alignItems: "center",
                      padding: "2px 8px",
                      transform: "translateY(-1.5px)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      lineHeight: "18px",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {item.text}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              {isEditing ? (
                <>
                  <button type="button" onClick={() => saveEdit(item.id)} style={{ ...buttonStyle, background: "var(--control-bg)", color: "var(--text-secondary)" }}>
                    {t("common.save")}
                  </button>
                  <button type="button" onClick={cancelEdit} style={buttonStyle}>
                    {t("common.cancel")}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => startEdit(item)} style={buttonStyle}>
                    {t("common.edit")}
                  </button>
                  <button type="button" onClick={() => removeItem(item.id)} style={buttonStyle}>
                    {t("common.delete")}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(QueuedMessages);
