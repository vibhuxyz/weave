import { MAX_DESCRIPTION_CHARS, MAX_LABEL_CHARS, TRUNCATION_MARK } from "./constants.ts";

export function capText(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}${TRUNCATION_MARK}` : text;
}

export function toLabel(text: string): string {
  return capText(text.replace(/\s+/g, " ").trim(), MAX_LABEL_CHARS);
}

export function toDescription(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  return trimmed ? capText(trimmed, MAX_DESCRIPTION_CHARS) : null;
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
