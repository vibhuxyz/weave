import type { QuestionOption } from "../shared/index.ts";
import { MAX_FIELD_OPTIONS } from "./constants.ts";
import { isRecord, toDescription, toLabel } from "./text.ts";

export interface OptionsOutcome {
  readonly options: readonly QuestionOption[];
  readonly notes: readonly string[];
}

function toOption(entry: unknown): QuestionOption | null {
  if (typeof entry === "string") return { value: entry, label: toLabel(entry), description: null };
  if (!isRecord(entry) || typeof entry.const !== "string") return null;
  const title = typeof entry.title === "string" ? entry.title : entry.const;
  return { value: entry.const, label: toLabel(title), description: toDescription(entry.description) };
}

function describeDropped(malformedCount: number, duplicateCount: number, total: number): string[] {
  return [
    malformedCount > 0 ? `${malformedCount} malformed option(s) ignored` : null,
    duplicateCount > 0 ? `${duplicateCount} duplicate option(s) ignored` : null,
    total > MAX_FIELD_OPTIONS ? `showing ${MAX_FIELD_OPTIONS} of ${total} options` : null,
  ].filter((note): note is string => note !== null);
}

export function collectOptions(entries: unknown): OptionsOutcome {
  if (!Array.isArray(entries)) return { options: [], notes: ["options are not a list"] };
  const byValue = new Map<string, QuestionOption>();
  let malformedCount = 0;
  let duplicateCount = 0;
  for (const entry of entries) {
    const option = toOption(entry);
    if (!option) malformedCount += 1;
    else if (byValue.has(option.value)) duplicateCount += 1;
    else byValue.set(option.value, option);
  }
  const unique = [...byValue.values()];
  return {
    options: unique.slice(0, MAX_FIELD_OPTIONS),
    notes: describeDropped(malformedCount, duplicateCount, unique.length),
  };
}
