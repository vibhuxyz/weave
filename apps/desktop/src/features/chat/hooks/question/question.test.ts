import test from "node:test";
import assert from "node:assert/strict";
import { toAnsweredQuestions } from "./answered";
import { isStepAnswered, withPickedOption, withText } from "./step-values";
import { toQuestionSteps } from "./steps";
import type { QuestionField, QuestionRequest } from "./types";

function choice(key: string, question: string): QuestionField {
  return {
    key,
    kind: "choice",
    title: "Header",
    description: question,
    isRequired: false,
    allowsMultiple: false,
    options: [
      { value: "a", label: "Alpha", description: null },
      { value: "b", label: "Beta", description: null },
    ],
  };
}

function other(key: string, customAnswerFor: string): QuestionField {
  return { key, kind: "text", title: "Other", description: null, isRequired: false, customAnswerFor };
}

const REQUEST: QuestionRequest = {
  requestId: "r1",
  message: "Please answer the following questions.",
  fields: [choice("q0", "First?"), other("q0_custom", "q0"), choice("q1", "Second?"), other("q1_custom", "q1")],
  notices: [],
};

test("each question and its Other box become one step", () => {
  const steps = toQuestionSteps(REQUEST);
  assert.deepEqual(
    steps.map((step) => [step.key, step.heading, step.otherKey]),
    [
      ["q0", "First?", "q0_custom"],
      ["q1", "Second?", "q1_custom"],
    ],
  );
});

test("typing an Other answer replaces the picked option and wins in the summary", () => {
  const [first, second] = toQuestionSteps(REQUEST);
  assert.ok(first && second);
  const picked = withPickedOption({}, first, "a");
  const typed = withText(picked, first, "Something else");
  assert.equal(typed.q0, undefined);
  assert.ok(isStepAnswered(first, typed));
  assert.equal(isStepAnswered(second, typed), false);
  const answered = toAnsweredQuestions([first, second], withPickedOption(typed, second, "b"));
  assert.deepEqual(answered, [
    { question: "First?", answer: "Something else" },
    { question: "Second?", answer: "Beta" },
  ]);
});

test("a single question uses the request message as its heading", () => {
  const [step] = toQuestionSteps({ ...REQUEST, message: "Pick one", fields: [choice("q0", "ignored"), other("q0_custom", "q0")] });
  assert.equal(step?.heading, "Pick one");
});
