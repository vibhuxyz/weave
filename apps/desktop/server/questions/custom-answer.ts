import type { QuestionField } from "../shared/index.ts";
import { CUSTOM_ANSWER_META_KEY } from "./constants.ts";
import { isRecord } from "./text.ts";

export function customAnswerTarget(property: unknown): string | null {
  if (!isRecord(property) || !isRecord(property._meta)) return null;
  const marker = property._meta[CUSTOM_ANSWER_META_KEY];
  if (!isRecord(marker) || marker.isCustomAnswer !== true) return null;
  return typeof marker.questionId === "string" ? marker.questionId : null;
}

export function linkCustomAnswers(fields: readonly QuestionField[]): QuestionField[] {
  const choiceKeys = new Set(fields.filter((field) => field.kind === "choice").map((field) => field.key));
  const claimed = new Set<string>();
  return fields.map((field) => {
    if (field.kind !== "text" || field.customAnswerFor === null) return field;
    const target = field.customAnswerFor;
    const isLinkable = choiceKeys.has(target) && !claimed.has(target);
    claimed.add(target);
    return isLinkable ? field : { ...field, customAnswerFor: null };
  });
}
