import { CARD_FENCE_LANGUAGE, MAX_CARD_CHARS, MAX_TITLE_CHARS, MIN_CARDS_IN_RUN } from "./constants";

const ANY_HEADING = /^#{1,6}\s+\S/;
const CARD_HEADING = /^#{2,4}\s+\d+\.\s+(.+?)\s*$/;
const FENCE = /^\s*```/;
const LINK_ONLY = /^\[[^\]\n]+\]\([^()\s]+\)$/;

interface Section {
  readonly start: number;
  readonly end: number;
  readonly isCard: boolean;
}

function headingIndexes(lines: readonly string[]): readonly number[] {
  const found: number[] = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (FENCE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (!inFence && ANY_HEADING.test(line)) found.push(index);
  });
  return found;
}

function isCardSection(lines: readonly string[], start: number, end: number): boolean {
  const heading = CARD_HEADING.exec(lines[start] ?? "");
  if (!heading?.[1] || heading[1].length > MAX_TITLE_CHARS) return false;
  const body = lines.slice(start, end);
  if (body.some((line) => FENCE.test(line))) return false;
  return body.join("\n").length <= MAX_CARD_CHARS;
}

function sectionsOf(lines: readonly string[]): readonly Section[] {
  const heads = headingIndexes(lines);
  return heads.map((start, at) => {
    const end = heads[at + 1] ?? lines.length;
    return { start, end, isCard: isCardSection(lines, start, end) };
  });
}

function runStarts(sections: readonly Section[]): ReadonlySet<number> {
  const wrapped = new Set<number>();
  let runLength = 0;
  sections.forEach((section, at) => {
    if (section.isCard) {
      runLength += 1;
      return;
    }
    if (runLength >= MIN_CARDS_IN_RUN) {
      for (let back = at - runLength; back < at; back += 1) wrapped.add(back);
    }
    runLength = 0;
  });
  if (runLength >= MIN_CARDS_IN_RUN) {
    for (let back = sections.length - runLength; back < sections.length; back += 1) wrapped.add(back);
  }
  return wrapped;
}

function cardEnd(body: readonly string[]): number {
  for (let at = body.length - 1; at >= 0; at -= 1) {
    if (LINK_ONLY.test((body[at] ?? "").trim())) return at + 1;
  }
  return body.length;
}

export function detectCards(markdown: string): string {
  const lines = markdown.split("\n");
  const sections = sectionsOf(lines);
  const wrapped = runStarts(sections);
  if (wrapped.size === 0) return markdown;

  const out: string[] = [...lines.slice(0, sections[0]?.start ?? lines.length)];
  sections.forEach((section, at) => {
    const body = lines.slice(section.start, section.end);
    if (!wrapped.has(at)) {
      out.push(...body);
      return;
    }
    const split = cardEnd(body);
    const card = body.slice(0, split);
    const after = body.slice(split);
    while (card.length > 0 && (card.at(-1) ?? "").trim() === "") card.pop();
    out.push("", `\`\`\`${CARD_FENCE_LANGUAGE}`, ...card, "```", "");
    out.push(...after);
  });
  return out.join("\n");
}
