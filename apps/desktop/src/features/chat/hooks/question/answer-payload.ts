import type {
  QuestionAnswers,
  QuestionAnswerValue,
  QuestionField,
  QuestionFormValue,
  QuestionFormValues,
} from "./types";

function isBlank(value: QuestionFormValue | undefined): boolean {
  if (value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return typeof value !== "boolean" && value.length === 0;
}

export function hasMissingRequired(
  fields: readonly QuestionField[],
  values: QuestionFormValues,
): boolean {
  return fields.some((field) => field.isRequired && isBlank(values[field.key]));
}

function toNumber(value: QuestionFormValue): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toAnswerPayload(
  fields: readonly QuestionField[],
  values: QuestionFormValues,
): QuestionAnswers {
  const entries = fields.flatMap((field): [string, QuestionAnswerValue][] => {
    const value = values[field.key];
    if (value === undefined || isBlank(value)) return [];
    if (field.kind !== "number") return [[field.key, value]];
    const parsed = toNumber(value);
    return parsed === null ? [] : [[field.key, parsed]];
  });
  return Object.fromEntries(entries);
}
