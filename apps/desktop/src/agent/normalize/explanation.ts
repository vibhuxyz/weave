import { blockBase, type SourceEventRef } from "./eventToBlock";
import type { ExplanationBlock } from "./types";

const CONSTANT_PATTERN =
  /\b([A-Z][A-Z0-9_]{2,})\b\s*(?:=|:|is|as)\s*`?([0-9]+n?)`?/g;

export function explanationFromKnownText(
  text: string,
  source?: SourceEventRef,
): ExplanationBlock | null {
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return null;

  const constants = extractConstants(text);
  const code = extractFirstCodeFence(text);
  const isExplanation =
    constants.length > 0 ||
    /what (?:are|is)|explain|because|means|stored as/i.test(text);

  if (!isExplanation) return null;

  return {
    ...blockBase("explanation-main", source),
    type: "explanation",
    oneLine: firstLine.replace(/^#+\s*/, ""),
    sections: [
      ...(constants.length > 0
        ? [
            {
              type: "constants" as const,
              title: "The constants",
              items: constants,
            },
          ]
        : []),
      {
        type: "text",
        title: "Explanation",
        content: text
          .replace(/```[\s\S]*?```/g, "")
          .trim()
          .slice(0, 1200),
      },
      ...(code
        ? [
            {
              type: "code" as const,
              title: "Where it lands in code",
              file: code.file ?? "code",
              code: code.code,
              language: code.language,
            },
          ]
        : []),
    ],
  };
}

function extractConstants(text: string) {
  const seen = new Set<string>();
  const items = [];
  let match = CONSTANT_PATTERN.exec(text);
  while (match !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      items.push({
        name,
        value: match[2],
        description: "Fraction component used by the calculation.",
      });
    }
    match = CONSTANT_PATTERN.exec(text);
  }
  return items;
}

function extractFirstCodeFence(text: string):
  | { language?: string; file?: string; code: string }
  | null {
  const match = /```(\w+)?\n([\s\S]*?)```/.exec(text);
  if (!match) return null;
  return {
    language: match[1],
    code: match[2].trim(),
  };
}
