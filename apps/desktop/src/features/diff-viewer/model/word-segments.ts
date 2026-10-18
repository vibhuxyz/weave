import type { DiffHunk, DiffLine, FileDiff } from "@/agent/diff";
import { WORD_DIFF_MAX_PAIRS_PER_FILE } from "../constants";
import { wordDiff } from "./word-diff";

interface Run {
  readonly start: number;
  readonly end: number;
}

function runOf(lines: readonly DiffLine[], from: number, kind: DiffLine["kind"]): Run {
  let end = from;
  while (end < lines.length && lines[end]?.kind === kind) end += 1;
  return { start: from, end };
}

function pairIndexes(lines: readonly DiffLine[]): ReadonlyArray<readonly [number, number]> {
  const pairs: Array<readonly [number, number]> = [];
  let index = 0;
  while (index < lines.length) {
    if (lines[index]?.kind !== "del") {
      index += 1;
      continue;
    }
    const dels = runOf(lines, index, "del");
    const adds = runOf(lines, dels.end, "add");
    const count = Math.min(dels.end - dels.start, adds.end - adds.start);
    for (let offset = 0; offset < count; offset += 1) pairs.push([dels.start + offset, adds.start + offset]);
    index = adds.end > dels.end ? adds.end : dels.end;
  }
  return pairs;
}

function withSegments(hunk: DiffHunk, budget: { left: number }): DiffHunk {
  const lines = [...hunk.lines];
  for (const [delAt, addAt] of pairIndexes(hunk.lines)) {
    if (budget.left <= 0) break;
    const removed = lines[delAt];
    const added = lines[addAt];
    if (!removed || !added) continue;
    budget.left -= 1;
    const diffed = wordDiff(removed.text, added.text);
    if (!diffed) continue;
    lines[delAt] = { ...removed, segments: diffed.removed };
    lines[addAt] = { ...added, segments: diffed.added };
  }
  return { ...hunk, lines };
}

export function withWordSegments(file: FileDiff): FileDiff {
  const budget = { left: WORD_DIFF_MAX_PAIRS_PER_FILE };
  return { ...file, hunks: file.hunks.map((hunk) => withSegments(hunk, budget)) };
}
