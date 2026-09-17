import type { DiffHunk, DiffLine } from "./types";

/** Lines of context kept on either side of a change. */
const CONTEXT_LINES = 3;
/** Above this many lines on a side we skip the LCS and show a coarse diff. */
const LCS_LINE_BUDGET = 1500;

export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  // A trailing newline yields a final empty element that is not a real line.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function lcsPairs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  const table = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const at = i * (m + 1) + j;
      table[at] =
        a[i] === b[j]
          ? (table[(i + 1) * (m + 1) + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * (m + 1) + j] ?? 0, table[at + 1] ?? 0);
    }
  }

  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if ((table[(i + 1) * (m + 1) + j] ?? 0) >= (table[i * (m + 1) + j + 1] ?? 0)) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}


export function diffLines(
  oldLines: string[],
  newLines: string[],
  offset = 0,
): { lines: DiffLine[]; truncated: boolean } {
  const lines: DiffLine[] = [];

  // Shared prefix / suffix — cheap and it's most of a typical edit.
  let start = 0;
  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  ) {
    start++;
  }
  let endOld = oldLines.length;
  let endNew = newLines.length;
  while (endOld > start && endNew > start && oldLines[endOld - 1] === newLines[endNew - 1]) {
    endOld--;
    endNew--;
  }

  for (let i = 0; i < start; i++) {
    lines.push({
      kind: "context",
      oldLine: offset + i + 1,
      newLine: offset + i + 1,
      text: oldLines[i] ?? "",
    });
  }

  const midOld = oldLines.slice(start, endOld);
  const midNew = newLines.slice(start, endNew);
  const truncated = midOld.length > LCS_LINE_BUDGET || midNew.length > LCS_LINE_BUDGET;

  if (truncated) {
    // Too big to align — report the changed region as a wholesale replacement.
    midOld.forEach((text, i) =>
      lines.push({ kind: "del", oldLine: offset + start + i + 1, text }),
    );
    midNew.forEach((text, i) =>
      lines.push({ kind: "add", newLine: offset + start + i + 1, text }),
    );
  } else {
    const pairs = lcsPairs(midOld, midNew);
    let oi = 0;
    let ni = 0;
    const emitUpTo = (untilOld: number, untilNew: number) => {
      while (oi < untilOld) {
        lines.push({ kind: "del", oldLine: offset + start + oi + 1, text: midOld[oi] ?? "" });
        oi++;
      }
      while (ni < untilNew) {
        lines.push({ kind: "add", newLine: offset + start + ni + 1, text: midNew[ni] ?? "" });
        ni++;
      }
    };
    for (const [po, pn] of pairs) {
      emitUpTo(po, pn);
      lines.push({
        kind: "context",
        oldLine: offset + start + oi + 1,
        newLine: offset + start + ni + 1,
        text: midOld[oi] ?? "",
      });
      oi++;
      ni++;
    }
    emitUpTo(midOld.length, midNew.length);
  }

  for (let k = 0; endOld + k < oldLines.length; k++) {
    lines.push({
      kind: "context",
      oldLine: offset + endOld + k + 1,
      newLine: offset + endNew + k + 1,
      text: oldLines[endOld + k] ?? "",
    });
  }

  return { lines, truncated };
}

/** Group tagged lines into hunks, dropping runs of untouched context. */
export function toHunks(lines: DiffLine[]): DiffHunk[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  let any = false;
  lines.forEach((line, i) => {
    if (line.kind === "context") return;
    any = true;
    for (
      let j = Math.max(0, i - CONTEXT_LINES);
      j <= Math.min(lines.length - 1, i + CONTEXT_LINES);
      j++
    ) {
      keep[j] = true;
    }
  });
  if (!any) return [];

  const hunks: DiffHunk[] = [];
  let current: DiffLine[] = [];
  // Counted, not just elided: "1143 unmodified lines" tells the reader where
  // in the file they are, which a bare separator does not.
  let dropped = 0;
  lines.forEach((line, i) => {
    if (keep[i]) {
      if (current.length === 0) {
        hunks.push({ lines: current, skippedBefore: dropped || undefined });
        dropped = 0;
      }
      current.push(line);
      return;
    }
    dropped++;
    if (current.length > 0) current = [];
  });
  return hunks.filter((hunk) => hunk.lines.length > 0);
}
