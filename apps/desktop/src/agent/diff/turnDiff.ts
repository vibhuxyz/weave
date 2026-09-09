import type { ChatTurn, ToolDiff, ToolEntry } from "../../useAcpChat";

/**
 * Turn-level file diffs: fold every `{ type: "diff" }` an engine reported
 * during one turn into a per-file before/after pair, then line-diff it.
 *
 * A turn usually edits the same file several times; the first snapshot holds
 * the original text and the last holds the final one, so the panel shows the
 * net change of the turn rather than each intermediate write.
 */

export type DiffLineKind = "context" | "add" | "del";

export interface DiffLine {
  kind: DiffLineKind;
  /** 1-based line number in the pre-edit file, when the line exists there. */
  oldLine?: number;
  /** 1-based line number in the post-edit file, when the line exists there. */
  newLine?: number;
  text: string;
}

export interface DiffHunk {
  lines: DiffLine[];
  /** Unmodified lines skipped between the previous hunk and this one. */
  skippedBefore?: number;
}

export type FileDiffStatus = "added" | "modified" | "deleted";

export interface FileDiff {
  path: string;
  status: FileDiffStatus;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  /** True when the file was too large to line-diff and is shown whole-sale. */
  truncated: boolean;
}

export interface TurnDiff {
  files: FileDiff[];
  additions: number;
  deletions: number;
}

/** Lines of context kept on either side of a change. */
const CONTEXT_LINES = 3;
/** Above this many lines on a side we skip the LCS and show a coarse diff. */
const LCS_LINE_BUDGET = 1500;

function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  // A trailing newline yields a final empty element that is not a real line.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Longest common subsequence of two line arrays, returned as index pairs.
 * Only ever called on the middle section left after trimming the shared
 * prefix/suffix, which keeps the O(n·m) table small on real edits.
 */
function lcsPairs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  const table = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const at = i * (m + 1) + j;
      table[at] =
        a[i] === b[j]
          ? table[(i + 1) * (m + 1) + j + 1] + 1
          : Math.max(table[(i + 1) * (m + 1) + j], table[at + 1]);
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
    } else if (table[(i + 1) * (m + 1) + j] >= table[i * (m + 1) + j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

/**
 * Line-by-line diff of two file versions, as a flat list of tagged lines.
 *
 * `offset` is how many lines precede this text in the real file: zero for a
 * whole-file snapshot, `StartLine - 1` for an engine that reports only the
 * region it rewrote. It is added to every line number so the gutter matches
 * the editor rather than counting from 1 inside the fragment.
 */
function diffLines(
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
      text: oldLines[i],
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
        lines.push({ kind: "del", oldLine: offset + start + oi + 1, text: midOld[oi] });
        oi++;
      }
      while (ni < untilNew) {
        lines.push({ kind: "add", newLine: offset + start + ni + 1, text: midNew[ni] });
        ni++;
      }
    };
    for (const [po, pn] of pairs) {
      emitUpTo(po, pn);
      lines.push({
        kind: "context",
        oldLine: offset + start + oi + 1,
        newLine: offset + start + ni + 1,
        text: midOld[oi],
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
      text: oldLines[endOld + k],
    });
  }

  return { lines, truncated };
}

/** Group tagged lines into hunks, dropping runs of untouched context. */
function toHunks(lines: DiffLine[]): DiffHunk[] {
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

/**
 * One edited region of a file: the first and last snapshot an engine reported
 * for it during the turn.
 *
 * Whole-file snapshots all share a segment (offset 0) and fold first→last, so
 * a file rewritten five times still reads as one net change. Region edits —
 * Antigravity reports the replaced span, not the file — get one segment per
 * `startLine`, because folding two unrelated spans of the same file would diff
 * one region's "before" against another's "after".
 */
interface DiffSegment {
  offset: number;
  first: ToolDiff;
  last: ToolDiff;
}

function groupToolDiffs(tools: ToolEntry[]): Map<string, DiffSegment[]> {
  const byPath = new Map<string, Map<number, DiffSegment>>();
  for (const tool of tools) {
    for (const diff of tool.diffs ?? []) {
      const offset = diff.startLine && diff.startLine > 0 ? diff.startLine - 1 : 0;
      let segments = byPath.get(diff.path);
      if (!segments) {
        segments = new Map();
        byPath.set(diff.path, segments);
      }
      const seen = segments.get(offset);
      if (seen) seen.last = diff;
      else segments.set(offset, { offset, first: diff, last: diff });
    }
  }

  return new Map(
    [...byPath].map(([path, segments]) => [
      path,
      [...segments.values()].sort((a, b) => a.offset - b.offset),
    ]),
  );
}

/** Build the diff model for one assistant turn. Empty when it changed nothing. */
export function turnDiff(turn: ChatTurn): TurnDiff {
  const files: FileDiff[] = [];
  let additions = 0;
  let deletions = 0;

  for (const [path, segments] of groupToolDiffs(turn.tools)) {
    const hunks: DiffHunk[] = [];
    let fileAdds = 0;
    let fileDels = 0;
    let truncated = false;
    let created = true;
    let emptied = true;

    for (const segment of segments) {
      const oldLines = splitLines(segment.first.oldText ?? "");
      const newLines = splitLines(segment.last.newText);
      const diffed = diffLines(oldLines, newLines, segment.offset);
      truncated ||= diffed.truncated;
      if (segment.first.oldText !== null && oldLines.length > 0) created = false;
      if (newLines.length > 0) emptied = false;
      fileAdds += diffed.lines.filter((l) => l.kind === "add").length;
      fileDels += diffed.lines.filter((l) => l.kind === "del").length;
      hunks.push(...toHunks(diffed.lines));
    }

    if (hunks.length === 0) continue;
    additions += fileAdds;
    deletions += fileDels;
    files.push({
      path,
      status: created ? "added" : emptied ? "deleted" : "modified",
      additions: fileAdds,
      deletions: fileDels,
      hunks,
      truncated,
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, additions, deletions };
}

/** Engines report absolute paths; the UI reads better project-relative. */
export function relativePath(path: string, projectDir?: string | null): string {
  if (!projectDir) return path;
  const root = projectDir.endsWith("/") ? projectDir : `${projectDir}/`;
  return path.startsWith(root) ? path.slice(root.length) : path;
}

/** Turns that touched at least one file, oldest first, with their diffs. */
export interface TurnDiffEntry {
  turnId: string;
  /** 1-based index among assistant turns that changed files. */
  index: number;
  diff: TurnDiff;
}

export function collectTurnDiffs(turns: ChatTurn[]): TurnDiffEntry[] {
  const entries: TurnDiffEntry[] = [];
  for (const turn of turns) {
    if (turn.role !== "assistant") continue;
    const diff = turnDiff(turn);
    if (diff.files.length === 0) continue;
    entries.push({ turnId: turn.id, index: entries.length + 1, diff });
  }
  return entries;
}
