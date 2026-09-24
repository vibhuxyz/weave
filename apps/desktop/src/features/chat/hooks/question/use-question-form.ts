import { useMemo, useState } from "react";
import { toAnswerPayload } from "./answer-payload";
import { toAnsweredQuestions } from "./answered";
import { isStepAnswered, withoutStep, withPickedOption, withText } from "./step-values";
import { toQuestionSteps } from "./steps";
import type { AnsweredQuestion, QuestionAnswers, QuestionFormValues, QuestionState } from "./types";

export type AnswerQuestion = (
  requestId: string,
  answers: QuestionAnswers | null,
  answered: readonly AnsweredQuestion[],
) => void;

export function useQuestionForm(state: QuestionState, onAnswer: AnswerQuestion) {
  const { request } = state;
  const steps = useMemo(() => toQuestionSteps(request), [request]);
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<QuestionFormValues>({});
  const step = steps[stepIndex] ?? null;
  const isLastStep = stepIndex >= steps.length - 1;
  const isSending = state.status === "sending";
  const canContinue = !isSending && (step === null || !step.field.isRequired || isStepAnswered(step, values));

  const submit = (finalValues: QuestionFormValues) =>
    onAnswer(request.requestId, toAnswerPayload(request.fields, finalValues), toAnsweredQuestions(steps, finalValues));

  const advance = (nextValues: QuestionFormValues) => {
    if (isLastStep) submit(nextValues);
    else setStepIndex(stepIndex + 1);
  };

  const decline = () => onAnswer(request.requestId, null, []);

  const next = () => {
    if (canContinue) advance(values);
  };

  const skip = () => {
    if (isSending) return;
    if (step?.field.isRequired) {
      decline();
      return;
    }
    const nextValues = step ? withoutStep(values, step) : values;
    setValues(nextValues);
    advance(nextValues);
  };

  const pick = (optionValue: string) => {
    if (step && !isSending) setValues(withPickedOption(values, step, optionValue));
  };

  const setText = (text: string) => {
    if (step && !isSending) setValues(withText(values, step, text));
  };

  const back = () => setStepIndex(Math.max(0, stepIndex - 1));

  return { steps, step, stepIndex, values, isLastStep, isSending, canContinue, next, skip, back, pick, setText, decline };
}
