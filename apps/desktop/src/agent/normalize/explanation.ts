import { blockBase, type SourceEventRef } from "./eventToBlock";
import type { ExplanationBlock } from "./types";

const CONSTANT_PATTERN =
  /\b([A-Z][A-Z0-9_]{2,})\b\s*(?:=|:|is|as)\s*`?([0-9]+(?:\.[0-9]+)?n?)`?(?:\s*[—:-]\s*([^\n]+))?/g;

// Only a genuinely conceptual heading gets the heavy Explanation framing. A
// status update ("The server is running", "Here's how to test it") should stay
// plain markdown.
const EXPLAIN_HEADING =
  /^(how (?:it|this|the|does)|why (?:it|this|does|is)|what (?:is|are|does)|understanding|explanation|the (?:reason|idea|mechanism)|background)\b/i;

/**
 * Turn one prose section into an explanation block. Called by the section
 * splitter as the default for narrative content that isn't a finding or a
 * project overview — so the gate is loose on purpose.
 */
export function explanationFromKnownText(
  text: string,
  source?: SourceEventRef,
  heading?: string,
): ExplanationBlock | null {
  const body = text.trim();
  if (!body) return null;

  const firstLine =
    body.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const sentences = body.split(/(?<=[.!?])\s/).filter((s) => s.trim().length > 12);
  const constants = extractConstants(body);
  const code = extractFirstCodeFence(body);

  // Require a real signal: named constants, or a conceptual heading/opener.
  // A plain multi-sentence paragraph is just prose → markdown.
  const isExplanation =
    constants.length > 0 ||
    (heading ? EXPLAIN_HEADING.test(heading) : EXPLAIN_HEADING.test(firstLine));

  if (!isExplanation || sentences.length < 1) return null;

  const oneLine = (heading ? firstSentence(body) : firstLine.replace(/^#+\s*/, ""))
    .replace(/\*\*|__|`/g, "")
    .trim();

  // Don't repeat the one-liner as the first sentence of the body.
  let content = body.replace(/```[\s\S]*?```/g, "").trim();
  const firstSent = firstSentence(content).replace(/\*\*|__|`/g, "").trim();
  if (oneLine && firstSent && oneLine === firstSent) {
    content = dropFirstSentence(content);
  }

  return {
    ...blockBase("explanation-main", source),
    type: "explanation",
    oneLine: oneLine || firstLine.replace(/\*\*|__|`/g, ""),
    sections: [
      ...(constants.length > 0
        ? [{ type: "constants" as const, title: "Constants", items: constants }]
        : []),
      ...(content.trim()
        ? [
            {
              type: "text" as const,
              title: heading ?? "Explanation",
              content: content.slice(0, 8000),
            },
          ]
        : []),
      ...(code
        ? [
            {
              type: "code" as const,
              title: "In code",
              file: code.file ?? "snippet",
              code: code.code,
              language: code.language,
            },
          ]
        : []),
    ],
  };
}

function dropFirstSentence(s: string): string {
  const parts = s.split(/(?<=[.!?])\s+/);
  return parts.slice(1).join(" ").trim();
}

function firstSentence(s: string): string {
  return (s.split(/(?<=[.!?])\s/)[0] ?? "").replace(/^#+\s*/, "").trim().slice(0, 200);
}

function extractConstants(text: string) {
  const seen = new Set<string>();
  const items: Array<{ name: string; value: string; description?: string }> = [];
  let match = CONSTANT_PATTERN.exec(text);
  while (match !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      items.push({
        name,
        value: match[2],
        description: match[3]?.trim() || undefined,
      });
    }
    match = CONSTANT_PATTERN.exec(text);
  }
  return items;
}

function extractFirstCodeFence(
  text: string,
): { language?: string; file?: string; code: string } | null {
  const match = /```(\w+)?\n([\s\S]*?)```/.exec(text);
  if (!match) return null;
  return { language: match[1], code: match[2].trim() };
}
