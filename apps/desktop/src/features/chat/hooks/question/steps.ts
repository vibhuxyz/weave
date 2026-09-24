import { TOGGLE_OPTIONS } from "./constants";
import type { QuestionField, QuestionRequest, QuestionStep, QuestionStepOption } from "./types";

function optionsOf(field: QuestionField): readonly QuestionStepOption[] {
  if (field.kind === "choice") return field.options;
  return field.kind === "toggle" ? TOGGLE_OPTIONS : [];
}

function otherKeysByChoice(fields: readonly QuestionField[]): ReadonlyMap<string, string> {
  return new Map(
    fields.flatMap((field): [string, string][] =>
      field.kind === "text" && field.customAnswerFor !== null ? [[field.customAnswerFor, field.key]] : [],
    ),
  );
}

function isCustomAnswerField(field: QuestionField): boolean {
  return field.kind === "text" && field.customAnswerFor !== null;
}

function headingOf(field: QuestionField, message: string, isOnlyStep: boolean): string {
  if (isOnlyStep) return message;
  return field.kind === "choice" ? (field.description ?? field.title) : field.title;
}

function helpOf(field: QuestionField, isOnlyStep: boolean): string | null {
  if (field.kind !== "choice") return field.description;
  return isOnlyStep ? field.description : null;
}

export function toQuestionSteps(request: QuestionRequest): readonly QuestionStep[] {
  const otherKeys = otherKeysByChoice(request.fields);
  const primary = request.fields.filter((field) => !isCustomAnswerField(field));
  const isOnlyStep = primary.length === 1;
  return primary.map((field) => {
    const heading = headingOf(field, request.message, isOnlyStep);
    return {
      key: field.key,
      heading,
      label: heading.includes(field.title) ? null : field.title,
      help: helpOf(field, isOnlyStep),
      field,
      options: optionsOf(field),
      otherKey: otherKeys.get(field.key) ?? null,
    };
  });
}
