import { MAX_ANSWER_DISPLAY_CHARS, TRUNCATION_MARK } from "./constants";
import { selectedValues, textOf } from "./step-values";
import type { AnsweredQuestion, QuestionFormValues, QuestionStep } from "./types";

function capped(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_ANSWER_DISPLAY_CHARS ? `${flat.slice(0, MAX_ANSWER_DISPLAY_CHARS)}${TRUNCATION_MARK}` : flat;
}

function displayAnswer(step: QuestionStep, values: QuestionFormValues): string {
  const other = step.otherKey === null ? "" : textOf(values[step.otherKey]).trim();
  if (other) return other;
  const value = values[step.key];
  if (step.options.length === 0) return textOf(value).trim();
  const labels = new Map(step.options.map((option) => [option.value, option.label]));
  return selectedValues(value).map((entry) => labels.get(entry) ?? entry).join(", ");
}

export function toAnsweredQuestions(
  steps: readonly QuestionStep[],
  values: QuestionFormValues,
): readonly AnsweredQuestion[] {
  return steps.flatMap((step) => {
    const answer = displayAnswer(step, values);
    return answer ? [{ question: capped(step.heading), answer: capped(answer) }] : [];
  });
}
