import { memo, useCallback, useMemo, useState } from "react";
import type { ToolPart } from "@shared/chat/types";
import { useFontScale } from "../contexts/FontSizeContext";
import AskUserQuestionItem from "./blocks/AskUserQuestionItem";
import {
  buildAnswerText,
  getQuestionKey,
  hasAnyAnswer,
  omitKey,
  readQuestions,
  selectOption,
  setCustomText,
  type CustomTextMap,
  type SelectionMap,
} from "./blocks/askUserQuestion";

export interface AskUserQuestionBlockProps {
  tool: Pick<ToolPart, "args">;
  onAnswer?: (text: string) => void;
}

const EMPTY_SELECTIONS: SelectionMap = {};
const EMPTY_CUSTOM: CustomTextMap = {};

function AskUserQuestionBlock({ tool, onAnswer }: AskUserQuestionBlockProps) {
  const [selections, setSelections] = useState<SelectionMap>(EMPTY_SELECTIONS);
  const s = useFontScale();
  const [customTextByQuestion, setCustomTextByQuestion] = useState<CustomTextMap>(EMPTY_CUSTOM);
  const [submitted, setSubmitted] = useState(false);
  const questions = useMemo(() => readQuestions(tool.args), [tool.args]);

  const handleSelect = useCallback((questionKey: string, label: string, multiSelect: boolean) => {
    if (submitted) return;
    setCustomTextByQuestion((prev) => omitKey(prev, questionKey));
    setSelections((prev) => selectOption(prev, questionKey, label, multiSelect));
  }, [submitted]);

  const handleCustomTextChange = useCallback((questionKey: string, value: string) => {
    setCustomTextByQuestion((prev) => setCustomText(prev, questionKey, value));
    if (value.trim()) {
      setSelections((prev) => (prev[questionKey]?.length ? omitKey(prev, questionKey) : prev));
    }
  }, []);

  if (questions.length === 0) return null;

  const hasAnswer = hasAnyAnswer(selections, customTextByQuestion);

  const handleSubmit = () => {
    if (!hasAnswer || submitted) return;
    setSubmitted(true);
    onAnswer?.(buildAnswerText(questions, selections, customTextByQuestion));
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
            fontFamily: "var(--font-mono)",
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
            <AskUserQuestionItem
              key={questionKey}
              question={q}
              questionKey={questionKey}
              isLast={qIdx === questions.length - 1}
              selected={selections[questionKey]}
              customText={customTextByQuestion[questionKey]}
              submitted={submitted}
              onSelect={handleSelect}
              onCustomTextChange={handleCustomTextChange}
            />
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
                fontFamily: "var(--font-ui)",
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
            fontFamily: "var(--font-mono)",
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

/** Re-render only when the questions or the answer callback change. */
function areAskUserQuestionPropsEqual(prev: AskUserQuestionBlockProps, next: AskUserQuestionBlockProps): boolean {
  return prev.tool.args === next.tool.args && prev.onAnswer === next.onAnswer;
}

export default memo(AskUserQuestionBlock, areAskUserQuestionPropsEqual);
