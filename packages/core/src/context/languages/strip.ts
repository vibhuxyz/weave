const QUOTES = new Set(["'", '"', "`"]);

function blankRun(length: number): string {
  return " ".repeat(length);
}

function stripStrings(line: string): string {
  let out = "";
  let quote: string | null = null;
  let index = 0;
  while (index < line.length) {
    const char = line[index] ?? "";
    if (quote === null && QUOTES.has(char)) {
      quote = char;
      out += char;
    } else if (quote !== null && char === "\\") {
      out += "  ";
      index += 1;
    } else if (quote !== null && char === quote) {
      quote = null;
      out += char;
    } else {
      out += quote === null ? char : " ";
    }
    index += 1;
  }
  return out;
}

function commentCutOf(blanked: string, markers: readonly string[]): number | undefined {
  return markers
    .map((marker) => blanked.indexOf(marker))
    .filter((at) => at >= 0)
    .sort((a, b) => a - b)[0];
}

function cutAt(line: string, cut: number | undefined): string {
  return cut === undefined ? line : line.slice(0, cut) + blankRun(line.length - cut);
}

function stripBlockComments(
  text: string,
  blocks: readonly (readonly [string, string])[],
): string {
  return blocks.reduce((current, [open, close]) => {
    const pattern = new RegExp(`${escapeRegExp(open)}[\\s\\S]*?${escapeRegExp(close)}`, "g");
    return current.replace(pattern, (match) => match.replace(/[^\n]/g, " "));
  }, text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface CodeLine {
  readonly text: string;
  readonly code: string;
}

export function codeLinesOf(
  text: string,
  lineComments: readonly string[],
  blockComments: readonly (readonly [string, string])[],
): CodeLine[] {
  return stripBlockComments(text, blockComments)
    .split(/\r?\n/)
    .map((line) => {
      const blanked = stripStrings(line);
      const cut = commentCutOf(blanked, lineComments);
      return { text: cutAt(line, cut), code: cutAt(blanked, cut) };
    });
}
