import type { ElicitationContentValue } from "@weave/protocol";
import type { QuestionField } from "../shared/index.ts";
import { MAX_TEXT_ANSWER_CHARS } from "./constants.ts";

export type AnswersResult =
  | { readonly ok: true; readonly content: Record<string, ElicitationContentValue> }
  | { readonly ok: false; readonly message: string };

type ChoiceField = Extract<QuestionField, { kind: "choice" }>;

function isEmptyAnswer(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  if (typeof raw === "string") return raw.trim() === "";
  return Array.isArray(raw) && raw.length === 0;
}

function parseChoice(field: ChoiceField, raw: unknown): ElicitationContentValue | null {
  const allowed = new Set(field.options.map((option) => option.value));
  if (!field.allowsMultiple) return typeof raw === "string" && allowed.has(raw) ? raw : null;
  if (!Array.isArray(raw)) return null;
  const picked = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string" || !allowed.has(value)) return null;
    picked.add(value);
  }
  return [...picked];
}

function parseText(raw: unknown): ElicitationContentValue | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length <= MAX_TEXT_ANSWER_CHARS ? trimmed : null;
}

function parseNumber(raw: unknown, isInteger: boolean): ElicitationContentValue | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return isInteger && !Number.isInteger(raw) ? null : raw;
}

function parseAnswer(field: QuestionField, raw: unknown): ElicitationContentValue | null {
  switch (field.kind) {
    case "choice":
      return parseChoice(field, raw);
    case "text":
      return parseText(raw);
    case "toggle":
      return typeof raw === "boolean" ? raw : null;
    case "number":
      return parseNumber(raw, field.isInteger);
    default: {
      const unreachable: never = field;
      return unreachable;
    }
  }
}

function displayValue(field: QuestionField, value: ElicitationContentValue): string {
  if (field.kind !== "choice") return String(value);
  const labels = new Map(field.options.map((option) => [option.value, option.label]));
  const values = Array.isArray(value) ? value : [String(value)];
  return values.map((entry) => labels.get(entry) ?? entry).join(", ");
}

function fieldName(field: QuestionField): string {
  return field.kind === "choice" ? (field.description ?? field.title) : field.title;
}

export function summarizeAnswers(
  fields: readonly QuestionField[],
  content: Readonly<Record<string, ElicitationContentValue>>,
): string {
  return fields
    .flatMap((field) => {
      const value = content[field.key];
      return value === undefined ? [] : [`${fieldName(field)}: ${displayValue(field, value)}`];
    })
    .join("; ");
}

export function toElicitationContent(
  fields: readonly QuestionField[],
  answers: Readonly<Record<string, unknown>>,
): AnswersResult {
  const content: Record<string, ElicitationContentValue> = {};
  for (const field of fields) {
    const raw = answers[field.key];
    if (isEmptyAnswer(raw)) {
      if (field.isRequired) return { ok: false, message: `"${field.title}" needs an answer` };
      continue;
    }
    const value = parseAnswer(field, raw);
    if (value === null) return { ok: false, message: `Invalid answer for "${field.title}"` };
    content[field.key] = value;
  }
  return { ok: true, content };
}
