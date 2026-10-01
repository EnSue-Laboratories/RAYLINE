import { memo } from "react";
import { Check, ChevronRight } from "lucide-react";
import type { AskUserQuestionItem as QuestionItem, AskUserQuestionOption } from "@shared/chat/types";
import { useFontScale } from "../../contexts/FontSizeContext";

const EMPTY_OPTIONS: readonly AskUserQuestionOption[] = [];
const EMPTY_SELECTION: readonly string[] = [];

export interface AskUserQuestionItemProps {
  question: QuestionItem;
  questionKey: string;
  isLast: boolean;
  selected: readonly string[] | undefined;
  customText: string | undefined;
  submitted: boolean;
  onSelect: (questionKey: string, label: string, multiSelect: boolean) => void;
  onCustomTextChange: (questionKey: string, value: string) => void;
}

function AskUserQuestionItem({
  question: q,
  questionKey,
  isLast,
  selected: selectedLabels = EMPTY_SELECTION,
  customText,
  submitted,
  onSelect,
  onCustomTextChange,
}: AskUserQuestionItemProps) {
  const s = useFontScale();
  const multiSelect = Boolean(q.multiSelect);

  return (
    <div style={{ marginBottom: isLast ? 0 : 16 }}>
      {/* Header chip */}
      {q.header && (
        <span
          style={{
            display: "inline-block",
            fontSize: s(9),
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
            background: "var(--control-bg-strong)",
            padding: "2px 7px",
            borderRadius: 4,
            letterSpacing: ".08em",
            marginBottom: 8,
          }}
        >
          {q.header}
        </span>
      )}

      {/* Question text */}
      <div
        style={{
          fontSize: s(14),
          color: "var(--text-primary)",
          fontFamily: "var(--font-content)",
          lineHeight: 1.6,
          marginBottom: 10,
        }}
      >
        {q.question}
      </div>

      {/* Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {(q.options ?? EMPTY_OPTIONS).map((opt, optIdx) => {
          const selected = selectedLabels.includes(opt.label);
          return (
            <button
              key={optIdx}
              onClick={() => onSelect(questionKey, opt.label, multiSelect)}
              disabled={submitted}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                width: "100%",
                padding: "9px 11px",
                background: selected ? "var(--control-bg-strong)" : "var(--control-bg-subtle)",
                border: selected ? "1px solid var(--control-border-active)" : "1px solid var(--control-bg-strong)",
                borderRadius: 8,
                cursor: submitted ? "default" : "pointer",
                textAlign: "left",
                transition: "all .15s ease",
                opacity: submitted && !selected ? 0.4 : 1,
              }}
              onMouseEnter={(e) => {
                if (!selected && !submitted) {
                  e.currentTarget.style.background = "var(--control-bg)";
                  e.currentTarget.style.borderColor = "var(--control-bg-active)";
                }
              }}
              onMouseLeave={(e) => {
                if (!selected && !submitted) {
                  e.currentTarget.style.background = "var(--control-bg-subtle)";
                  e.currentTarget.style.borderColor = "var(--control-bg-strong)";
                }
              }}
            >
              {/* Radio / checkbox */}
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: multiSelect ? 3 : 8,
                  border: selected ? "1.5px solid var(--text-secondary)" : "1.5px solid var(--control-border-strong)",
                  background: selected ? "var(--control-bg-active)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 1,
                  transition: "all .15s ease",
                }}
              >
                {selected && <Check size={10} strokeWidth={2.5} style={{ color: "var(--text-primary)" }} />}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: s(13),
                    fontFamily: "var(--font-ui)",
                    color: selected ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: 500,
                    lineHeight: 1.4,
                  }}
                >
                  {opt.label}
                </div>
                {opt.description && (
                  <div
                    style={{
                      fontSize: s(11),
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-ui)",
                      lineHeight: 1.5,
                      marginTop: 2,
                    }}
                  >
                    {opt.description}
                  </div>
                )}
              </div>

              <ChevronRight
                size={13}
                strokeWidth={1.5}
                style={{
                  color: selected ? "var(--text-muted)" : "var(--control-border)",
                  flexShrink: 0,
                  marginTop: 2,
                  transition: "color .15s ease",
                }}
              />
            </button>
          );
        })}

        {/* Custom text input */}
        {!submitted && (
          <input
            type="text"
            value={customText ?? ""}
            onChange={(e) => onCustomTextChange(questionKey, e.target.value)}
            placeholder="Or type something..."
            style={{
              width: "100%",
              marginTop: 4,
              background: "var(--control-bg-subtle)",
              border: "1px solid var(--control-bg-strong)",
              borderRadius: 8,
              color: "var(--text-secondary)",
              fontSize: s(13),
              fontFamily: "var(--font-ui)",
              fontWeight: 400,
              lineHeight: 1.4,
              padding: "9px 11px",
            }}
          />
        )}
      </div>
    </div>
  );
}

export default memo(AskUserQuestionItem);
