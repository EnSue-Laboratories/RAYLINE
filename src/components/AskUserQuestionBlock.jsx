import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";

export default function AskUserQuestionBlock({ tool, onAnswer }) {
  const [selections, setSelections] = useState({});
  const s = useFontScale();
  const [customTextByQuestion, setCustomTextByQuestion] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const questions = tool.args?.questions || [];

  if (questions.length === 0) return null;

  const getQuestionKey = (question, qIdx) => question?.id || `question-${qIdx}`;

  const handleSelect = (qIdx, optionLabel) => {
    if (submitted) return;
    const q = questions[qIdx];
    const questionKey = getQuestionKey(q, qIdx);
    setCustomTextByQuestion((prev) => {
      if (!prev[questionKey]) return prev;
      const next = { ...prev };
      delete next[questionKey];
      return next;
    });
    if (q?.multiSelect) {
      setSelections((prev) => {
        const current = prev[questionKey] || [];
        const next = current.includes(optionLabel)
          ? current.filter((l) => l !== optionLabel)
          : [...current, optionLabel];
        return { ...prev, [questionKey]: next };
      });
    } else {
      setSelections((prev) => ({ ...prev, [questionKey]: [optionLabel] }));
    }
  };

  const isSelected = (qIdx, label) => {
    const questionKey = getQuestionKey(questions[qIdx], qIdx);
    return (selections[questionKey] || []).includes(label);
  };

  const hasAnswer = Object.values(customTextByQuestion).some((text) => text.trim().length > 0) ||
    Object.values(selections).some((s) => s.length > 0);

  const handleSubmit = () => {
    if (!hasAnswer || submitted) return;
    setSubmitted(true);
    const lines = questions.map((q, qIdx) => {
      const questionKey = getQuestionKey(q, qIdx);
      const customText = customTextByQuestion[questionKey]?.trim();
      if (customText) return customText;
      const selected = selections[questionKey] || [];
      if (selected.length === 0) return null;
      return selected.join(", ");
    }).filter(Boolean);
    if (onAnswer) onAnswer(lines.join("\n"));
  };

  const handleCustomTextChange = (qIdx, e) => {
    const questionKey = getQuestionKey(questions[qIdx], qIdx);
    const nextValue = e.target.value;
    setCustomTextByQuestion((prev) => {
      const next = { ...prev };
      if (nextValue) next[questionKey] = nextValue;
      else delete next[questionKey];
      return next;
    });
    if (nextValue.trim()) {
      setSelections((prev) => {
        if (!prev[questionKey]?.length) return prev;
        const next = { ...prev };
        delete next[questionKey];
        return next;
      });
    }
  };

  return (
    <div
      style={{
        margin: "12px 0",
        borderRadius: 10,
        border: "1px solid var(--control-border)",
        background: "var(--control-bg)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 14px",
          borderBottom: "1px solid var(--control-bg-strong)",
        }}
      >
        <span
          style={{
            fontSize: s(10),
            fontFamily: "'JetBrains Mono',monospace",
            color: "var(--text-muted)",
            letterSpacing: ".1em",
          }}
        >
          QUESTION
        </span>
      </div>

      {/* Questions */}
      <div style={{ padding: "12px 14px" }}>
        {questions.map((q, qIdx) => {
          const questionKey = getQuestionKey(q, qIdx);
          return (
            <div key={questionKey} style={{ marginBottom: qIdx < questions.length - 1 ? 16 : 0 }}>
              {/* Header chip */}
              {q.header && (
                <span
                  style={{
                    display: "inline-block",
                    fontSize: s(9),
                    fontFamily: "'JetBrains Mono',monospace",
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
                  fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
                  lineHeight: 1.6,
                  marginBottom: 10,
                }}
              >
                {q.question}
              </div>

              {/* Options */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {(q.options || []).map((opt, optIdx) => {
                  const selected = isSelected(qIdx, opt.label);
                  return (
                    <button
                      key={optIdx}
                      onClick={() => handleSelect(qIdx, opt.label)}
                      disabled={submitted}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        width: "100%",
                        padding: "9px 11px",
                        background: selected
                          ? "var(--control-bg-strong)"
                          : "var(--control-bg-subtle)",
                        border: selected
                          ? "1px solid var(--control-border-active)"
                          : "1px solid var(--control-bg-strong)",
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
                          borderRadius: q.multiSelect ? 3 : 8,
                          border: selected
                            ? "1.5px solid var(--text-secondary)"
                            : "1.5px solid var(--control-border-strong)",
                          background: selected
                            ? "var(--control-bg-active)"
                            : "transparent",
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
                            fontFamily: "system-ui,-apple-system,sans-serif",
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
                              fontFamily: "system-ui,-apple-system,sans-serif",
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
                    value={customTextByQuestion[questionKey] || ""}
                    onChange={(e) => handleCustomTextChange(qIdx, e)}
                    placeholder="Or type something..."
                    style={{
                      width: "100%",
                      marginTop: 4,
                      background: "var(--control-bg-subtle)",
                      border: "1px solid var(--control-bg-strong)",
                      borderRadius: 8,
                      color: "var(--text-secondary)",
                      fontSize: s(13),
                      fontFamily: "system-ui,-apple-system,sans-serif",
                      fontWeight: 400,
                      lineHeight: 1.4,
                      padding: "9px 11px",
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* Submit button */}
        {!submitted && (
          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handleSubmit}
              disabled={!hasAnswer}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                border: "none",
                fontSize: s(12),
                fontFamily: "system-ui,-apple-system,sans-serif",
                fontWeight: 500,
                cursor: hasAnswer ? "pointer" : "default",
                background: hasAnswer ? "var(--text-primary)" : "var(--control-bg-strong)",
                color: hasAnswer ? "var(--text-inverse)" : "var(--text-disabled)",
                transition: "all .2s ease",
              }}
            >
              Submit
            </button>
          </div>
        )}

        {submitted && (
          <div style={{
            marginTop: 10,
            fontSize: s(10),
            fontFamily: "'JetBrains Mono',monospace",
            color: "var(--text-faint)",
            letterSpacing: ".06em",
          }}>
            ANSWERED
          </div>
        )}
      </div>
    </div>
  );
}
