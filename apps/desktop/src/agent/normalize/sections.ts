export interface Section {
  /** Heading text without the leading `#`s, or undefined for the lead section. */
  heading?: string;
  /** Section body with the heading line removed, trimmed. */
  body: string;
  /** Character offset of the section start in the original text. */
  start: number;
}

const HEADING = /^(#{1,4})\s+(.+?)\s*#*$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;
// A line that is entirely SCREAMING-CASE (plus spaces / a few separators) and
// has no trailing sentence punctuation — the agent's section labels
// ("IN ONE LINE", "WHAT CONCERNS ME", "RUN LOG").
const CAPS_LABEL = /^[A-Z][A-Z0-9]*(?:[ /&'-][A-Z0-9]+)*$/;

/**
 * Split a response into ordered sections that cover the whole string. Splits on
 * top-level markdown headings, horizontal rules, and SCREAMING-CASE label lines;
 * never splits inside a fenced code block. The text before the first split is
 * the lead section (no heading).
 *
 * This is the safety net for the block pipeline: every prose chunk ends up in
 * *some* section, so nothing can render as nothing.
 */
export function splitSections(text: string): Section[] {
  const lines = text.split("\n");
  const sections: Section[] = [];
  let cur: { heading?: string; lines: string[]; start: number } = {
    lines: [],
    start: 0,
  };
  let offset = 0;
  let inFence = false;

  const push = () => {
    const body = cur.lines.join("\n").trim();
    if (body || cur.heading) {
      sections.push({ heading: cur.heading, body, start: cur.start });
    }
  };

  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1;
    const t = line.trim();

    if (t.startsWith("```")) {
      inFence = !inFence;
      cur.lines.push(line);
      continue;
    }
    if (inFence) {
      cur.lines.push(line);
      continue;
    }

    const h = HEADING.exec(line);
    if (h) {
      push();
      cur = { heading: h[2].trim(), lines: [], start: lineStart };
      continue;
    }
    if (RULE.test(t)) {
      push();
      cur = { lines: [], start: offset };
      continue;
    }
    if (t.length >= 4 && t.length <= 48 && CAPS_LABEL.test(t)) {
      push();
      cur = { heading: t, lines: [], start: lineStart };
      continue;
    }

    cur.lines.push(line);
  }
  push();

  if (sections.length === 0 && text.trim()) {
    sections.push({ body: text.trim(), start: 0 });
  }
  return sections;
}
