import { isBlank } from "./answer-payload";
import type { QuestionFormValue, QuestionFormValues, QuestionStep } from "./types";

export function selectedValues(value: QuestionFormValue | undefined): readonly string[] {
  if (value === undefined) return [];
  if (typeof value === "boolean") return [String(value)];
  if (typeof value === "string") return value ? [value] : [];
  return value;
}

function toggled(selected: readonly string[], optionValue: string): readonly string[] {
  return selected.includes(optionValue)
    ? selected.filter((value) => value !== optionValue)
    : [...selected, optionValue];
}

function pickedValue(step: QuestionStep, current: QuestionFormValue | undefined, optionValue: string): QuestionFormValue {
  const { field } = step;
  if (field.kind === "toggle") return optionValue === "true";
  if (field.kind === "choice" && field.allowsMultiple) return toggled(selectedValues(current), optionValue);
  return optionValue;
}

function without(values: QuestionFormValues, keys: readonly (string | null)[]): QuestionFormValues {
  return Object.fromEntries(Object.entries(values).filter(([key]) => !keys.includes(key)));
}

export function withPickedOption(values: QuestionFormValues, step: QuestionStep, optionValue: string): QuestionFormValues {
  const next = pickedValue(step, values[step.key], optionValue);
  return { ...without(values, [step.otherKey]), [step.key]: next };
}

export function withText(values: QuestionFormValues, step: QuestionStep, text: string): QuestionFormValues {
  if (step.otherKey === null) return { ...values, [step.key]: text };
  const cleared = text.trim() === "" ? values : without(values, [step.key]);
  return { ...cleared, [step.otherKey]: text };
}

export function withoutStep(values: QuestionFormValues, step: QuestionStep): QuestionFormValues {
  return without(values, [step.key, step.otherKey]);
}

export function isStepAnswered(step: QuestionStep, values: QuestionFormValues): boolean {
  const hasOther = step.otherKey !== null && !isBlank(values[step.otherKey]);
  return hasOther || !isBlank(values[step.key]);
}

export function textOf(value: QuestionFormValue | undefined): string {
  return typeof value === "string" ? value : "";
}
