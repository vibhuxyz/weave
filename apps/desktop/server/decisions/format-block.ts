import type { DecisionRecord } from "../storage/index.ts";
import {
  DECISIONS_HEADER,
  DECISIONS_TAG,
  ISO_DATE_LENGTH,
  MAX_DECISIONS_BLOCK_BYTES,
  MAX_DECISIONS_SHOWN,
  MAX_DECISION_LINE_CHARS,
} from "./constants.ts";

const CLOSING_TAG = `</${DECISIONS_TAG}>`;
const ESCAPED_CLOSING_TAG = `<\\/${DECISIONS_TAG}>`;

function capChars(text: string, maxChars: number): string {
  const chars = [...text];
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join("")}…` : text;
}

function toLine(record: DecisionRecord): string {
  const date = new Date(record.createdAt).toISOString().slice(0, ISO_DATE_LENGTH);
  const flat = `${date} · ${record.question} → ${record.answer}`.replace(/\s+/g, " ").trim();
  return `- ${capChars(flat, MAX_DECISION_LINE_CHARS).replaceAll(CLOSING_TAG, ESCAPED_CLOSING_TAG)}`;
}

function latestPerQuestion(newestFirst: readonly DecisionRecord[]): readonly DecisionRecord[] {
  const seen = new Set<string>();
  return newestFirst.filter((record) => {
    const key = record.question.replace(/\s+/g, " ").trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function linesWithinBudget(records: readonly DecisionRecord[]): readonly string[] {
  const lines: string[] = [];
  let bytes = 0;
  for (const record of records.slice(0, MAX_DECISIONS_SHOWN)) {
    const line = toLine(record);
    const lineBytes = Buffer.byteLength(`${line}\n`, "utf8");
    if (bytes + lineBytes > MAX_DECISIONS_BLOCK_BYTES) break;
    lines.push(line);
    bytes += lineBytes;
  }
  return lines;
}

export function formatDecisionsBlock(
  newestFirst: readonly DecisionRecord[],
  totalCount: number,
): string | null {
  const lines = linesWithinBudget(latestPerQuestion(newestFirst));
  if (lines.length === 0) return null;
  const hiddenCount = totalCount - lines.length;
  const hiddenNote =
    hiddenCount > 0
      ? [`(${hiddenCount} other saved answer(s) not shown: older, or replaced by a newer answer to the same question)`]
      : [];
  return [DECISIONS_HEADER, `<${DECISIONS_TAG}>`, ...lines, ...hiddenNote, CLOSING_TAG].join("\n");
}
