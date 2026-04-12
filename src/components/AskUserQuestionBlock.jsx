import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";

export default function AskUserQuestionBlock({ tool, onAnswer }) {
  const [selections, setSelections] = useState({});
  const [customText, setCustomText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const questions = tool.args?.questions || [];

  if (questions.length === 0) return null;

  const handleSelect = (qIdx, optionLabel) => {
    if (submitted) return;
    setCustomText("");
    const q = questions[qIdx];
    if (q?.multiSelect) {
      setSelections((prev) => {
        const current = prev[qIdx] || [];
        const next = current.includes(optionLabel)
          ? current.filter((l) => l !== optionLabel)
          : [...current, optionLabel];
        return { ...prev, [qIdx]: next };
      });
    } else {
      setSelections((prev) => ({ ...prev, [qIdx]: [optionLabel] }));
    }
  };

  const isSelected = (qIdx, label) => (selections[qIdx] || []).includes(label);

  const hasAnswer = customText.trim().length > 0 ||
    Object.values(selections).some((s) => s.length > 0);

  const handleSubmit = () => {
    if (!hasAnswer || submitted) return;
    setSubmitted(true);
    if (customText.trim()) {
      if (onAnswer) onAnswer(customText.trim());
      return;
    }
    const lines = questions.map((q, qIdx) => {
      const selected = selections[qIdx] || [];
      if (selected.length === 0) return null;
      return selected.join(", ");
    }).filter(Boolean);
    if (onAnswer) onAnswer(lines.join("\n"));
  };

  const handleCustomTextChange = (e) => {
    setCustomText(e.target.value);
    if (e.target.value.trim()) setSelections({});
  };

  return (
    <div
      style={{
        margin: "12px 0",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.025)",
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
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontFamily: "'JetBrains Mono',monospace",
            color: "rgba(255,255,255,0.3)",
            letterSpacing: ".1em",
          }}
        >
          QUESTION
        </span>
      </div>

      {/* Questions */}
      <div style={{ padding: "12px 14px" }}>
        {questions.map((q, qIdx) => {
          return (
            <div key={qIdx} style={{ marginBottom: qIdx < questions.length - 1 ? 16 : 0 }}>
              {/* Header chip */}
              {q.header && (
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 9,
                    fontFamily: "'JetBrains Mono',monospace",
                    color: "rgba(255,255,255,0.35)",
                    background: "rgba(255,255,255,0.05)",
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
                  fontSize: 14,
                  color: "rgba(255,255,255,0.82)",
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
                          ? "rgba(255,255,255,0.07)"
                          : "rgba(255,255,255,0.015)",
                        border: selected
                          ? "1px solid rgba(255,255,255,0.18)"
                          : "1px solid rgba(255,255,255,0.05)",
                        borderRadius: 8,
                        cursor: submitted ? "default" : "pointer",
                        textAlign: "left",
                        transition: "all .15s ease",
                        opacity: submitted && !selected ? 0.4 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!selected && !submitted) {
                          e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                          e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!selected && !submitted) {
                          e.currentTarget.style.background = "rgba(255,255,255,0.015)";
                          e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
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
                            ? "1.5px solid rgba(255,255,255,0.5)"
                            : "1.5px solid rgba(255,255,255,0.15)",
                          background: selected
                            ? "rgba(255,255,255,0.12)"
                            : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: 1,
                          transition: "all .15s ease",
                        }}
                      >
                        {selected && <Check size={10} strokeWidth={2.5} style={{ color: "rgba(255,255,255,0.8)" }} />}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontFamily: "system-ui,-apple-system,sans-serif",
                            color: selected ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.6)",
                            fontWeight: 500,
                            lineHeight: 1.4,
                          }}
                        >
                          {opt.label}
                        </div>
                        {opt.description && (
                          <div
                            style={{
                              fontSize: 11,
                              color: "rgba(255,255,255,0.3)",
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
                          color: selected ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)",
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
                    value={customText}
                    onChange={handleCustomTextChange}
                    placeholder="Or type something..."
                    style={{
                      width: "100%",
                      marginTop: 4,
                      background: "rgba(255,255,255,0.015)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 8,
                      color: "rgba(255,255,255,0.6)",
                      fontSize: 13,
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
                fontSize: 12,
                fontFamily: "system-ui,-apple-system,sans-serif",
                fontWeight: 500,
                cursor: hasAnswer ? "pointer" : "default",
                background: hasAnswer ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.06)",
                color: hasAnswer ? "#000" : "rgba(255,255,255,0.2)",
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
            fontSize: 10,
            fontFamily: "'JetBrains Mono',monospace",
            color: "rgba(255,255,255,0.25)",
            letterSpacing: ".06em",
          }}>
            ANSWERED
          </div>
        )}
      </div>
    </div>
  );
}
