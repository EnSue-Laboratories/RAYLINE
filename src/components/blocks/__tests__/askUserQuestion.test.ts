import { describe, expect, it } from "vitest";
import {
  buildAnswerText,
  getQuestionKey,
  hasAnyAnswer,
  omitKey,
  readQuestions,
  selectOption,
  setCustomText,
} from "../askUserQuestion";

const questions = [
  { question: "Color?", options: [{ label: "Red" }, { label: "Blue" }] },
  { question: "Sizes?", multiSelect: true, options: [{ label: "S" }, { label: "M" }] },
  { question: "Notes?" },
];

describe("askUserQuestion", () => {
  it("reads only well-formed questions", () => {
    expect(readQuestions({ questions: [...questions, { nope: true }] })).toHaveLength(3);
    expect(readQuestions({ questions: "bad" })).toEqual([]);
    expect(readQuestions(undefined)).toEqual([]);
  });

  it("keys questions by id or index", () => {
    expect(getQuestionKey(questions[0], 0)).toBe("question-0");
    expect(getQuestionKey({ question: "q", id: "custom" } as never, 3)).toBe("custom");
  });

  it("single-select replaces, multi-select toggles", () => {
    let sel = selectOption({}, "question-0", "Red", false);
    sel = selectOption(sel, "question-0", "Blue", false);
    expect(sel["question-0"]).toEqual(["Blue"]);
    sel = selectOption(sel, "question-1", "S", true);
    sel = selectOption(sel, "question-1", "M", true);
    sel = selectOption(sel, "question-1", "S", true);
    expect(sel["question-1"]).toEqual(["M"]);
  });

  it("custom text wins over selections and is skipped when empty", () => {
    const sel = { "question-0": ["Red"], "question-1": ["S", "M"] };
    const custom = setCustomText({}, "question-0", " teal ");
    expect(buildAnswerText(questions, sel, custom)).toBe("teal\nS, M");
    expect(setCustomText(custom, "question-0", "")).toEqual({});
  });

  it("detects answers", () => {
    expect(hasAnyAnswer({}, {})).toBe(false);
    expect(hasAnyAnswer({ a: [] }, { b: "  " })).toBe(false);
    expect(hasAnyAnswer({ a: ["x"] }, {})).toBe(true);
  });

  it("omitKey keeps identity when the key is absent", () => {
    const record = { a: 1 };
    expect(omitKey(record, "b")).toBe(record);
    expect(omitKey(record, "a")).toEqual({});
  });
});
