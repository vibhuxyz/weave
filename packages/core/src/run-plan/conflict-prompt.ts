import type { MergeConflict } from "../integrator/index.ts";
import { flatten } from "../shared/index.ts";

const MAX_LISTED_FILES = 40;

function fileLines(files: readonly string[]): readonly string[] {
  const shown = files.slice(0, MAX_LISTED_FILES).map((file) => `- ${flatten(file)}`);
  const hidden = files.length - shown.length;
  return hidden > 0 ? [...shown, `(+${hidden} more)`] : shown;
}

export function buildConflictPrompt(conflict: MergeConflict): string {
  return [
    `Weave is merging the work of task ${conflict.taskId} (branch ${conflict.branch}) into the integration branch, and git stopped with merge conflicts in:`,
    ...fileLines(conflict.files),
    "",
    "Resolve every conflict so the result keeps what both sides meant to do. Read both sides of each hunk, then edit the file so no conflict markers (<<<<<<<, =======, >>>>>>>) remain.",
    "Edit only the conflicted files. Do not run git merge, git commit, git checkout, git reset or git stash: Weave stages and commits the merge after you finish.",
    "When the files are resolved, run the project's typecheck or tests if it has them, and fix only what the merge broke inside these files.",
    "If a conflict needs a decision from the user, leave its markers in place and say which file and why in your final message.",
  ].join("\n");
}
