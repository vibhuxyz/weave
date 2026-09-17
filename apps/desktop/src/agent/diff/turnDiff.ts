import type { ChatTurn } from "@/features/chat/hooks";
import { groupToolDiffs } from "./turnDiff/groupToolDiffs";
import { diffLines, splitLines, toHunks } from "./turnDiff/lineDiff";
import type { DiffHunk, FileDiff, TurnDiff } from "./turnDiff/types";

export type {
  DiffHunk,
  DiffLine,
  DiffLineKind,
  FileDiff,
  FileDiffStatus,
  TurnDiff,
} from "./turnDiff/types";

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
