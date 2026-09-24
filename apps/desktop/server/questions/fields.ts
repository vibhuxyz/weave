import type { ElicitationPropertySchema, ElicitationSchema } from "@weave/protocol";
import type { QuestionField, QuestionNotice } from "../shared/index.ts";
import { MAX_QUESTION_FIELDS } from "./constants.ts";
import { customAnswerTarget, linkCustomAnswers } from "./custom-answer.ts";
import { collectOptions } from "./options.ts";
import { isRecord, toDescription, toLabel } from "./text.ts";

interface FieldOutcome {
  readonly field: QuestionField | null;
  readonly notes: readonly string[];
}

export interface QuestionFields {
  readonly fields: readonly QuestionField[];
  readonly notices: readonly QuestionNotice[];
}

interface FieldBase {
  readonly key: string;
  readonly title: string;
  readonly description: string | null;
  readonly isRequired: boolean;
}

function toChoiceField(base: FieldBase, entries: unknown, allowsMultiple: boolean): FieldOutcome {
  const { options, notes } = collectOptions(entries);
  if (options.length === 0) return { field: null, notes: [...notes, "field has no valid options"] };
  return { field: { ...base, kind: "choice", options, allowsMultiple }, notes };
}

function toStringField(base: FieldBase, property: ElicitationPropertySchema & { type: "string" }): FieldOutcome {
  if (property.oneOf) return toChoiceField(base, property.oneOf, false);
  if (property.enum) return toChoiceField(base, property.enum, false);
  return { field: { ...base, kind: "text", customAnswerFor: customAnswerTarget(property) }, notes: [] };
}

function multiSelectEntries(items: unknown): unknown {
  if (!isRecord(items)) return null;
  return "anyOf" in items ? items.anyOf : items.enum;
}

function unsupportedField(_property: never): FieldOutcome {
  return { field: null, notes: ["unsupported field type"] };
}

function toField(base: FieldBase, property: ElicitationPropertySchema): FieldOutcome {
  switch (property.type) {
    case "string":
      return toStringField(base, property);
    case "array":
      return toChoiceField(base, multiSelectEntries(property.items), true);
    case "boolean":
      return { field: { ...base, kind: "toggle" }, notes: [] };
    case "number":
      return { field: { ...base, kind: "number", isInteger: false }, notes: [] };
    case "integer":
      return { field: { ...base, kind: "number", isInteger: true }, notes: [] };
    default:
      return unsupportedField(property);
  }
}

function toBase(key: string, property: ElicitationPropertySchema, isRequired: boolean): FieldBase {
  const title = typeof property.title === "string" && property.title.trim() ? property.title : key;
  return { key, title: toLabel(title), description: toDescription(property.description), isRequired };
}

export function toQuestionFields(schema: ElicitationSchema): QuestionFields {
  const required = new Set(schema.required ?? []);
  const entries = Object.entries(schema.properties ?? {});
  const fields: QuestionField[] = [];
  const notices: QuestionNotice[] = [];
  for (const [key, property] of entries.slice(0, MAX_QUESTION_FIELDS)) {
    const isRequired = required.has(key);
    const outcome = toField(toBase(key, property, isRequired), property);
    for (const message of outcome.notes) notices.push({ key, message });
    if (outcome.field) fields.push(outcome.field);
    else if (isRequired) notices.push({ key, message: "a required field could not be shown" });
  }
  if (entries.length > MAX_QUESTION_FIELDS) {
    notices.push({ key: "", message: `showing ${MAX_QUESTION_FIELDS} of ${entries.length} fields` });
  }
  return { fields: linkCustomAnswers(fields), notices };
}
