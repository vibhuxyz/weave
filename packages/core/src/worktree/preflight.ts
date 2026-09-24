import { MAX_LISTED_DIRTY_PATHS } from "./constants.ts";
import { outputLines, runGit } from "./run-git.ts";
import type { WorktreeResult } from "./types.ts";

function describeDirty(lines: readonly string[]): string {
  const listed = lines.slice(0, MAX_LISTED_DIRTY_PATHS).join(", ");
  const more = lines.length > MAX_LISTED_DIRTY_PATHS ? ` (+${lines.length - MAX_LISTED_DIRTY_PATHS} more)` : "";
  return `${listed}${more}`;
}

export async function checkCleanBase(repoRoot: string): Promise<WorktreeResult<string>> {
  const status = await runGit(repoRoot, ["status", "--porcelain", "--untracked-files=no"]);
  if (!status.ok) return { ok: false, reason: `Cannot read git status in ${repoRoot}: ${status.output.trim()}` };
  const dirty = outputLines(status.output);
  if (dirty.length > 0) {
    return {
      ok: false,
      reason: `${repoRoot} has ${dirty.length} uncommitted change(s): ${describeDirty(dirty)}. Workers start from the last commit and would not see them. Commit or stash first.`,
    };
  }
  const head = await runGit(repoRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (!head.ok) return { ok: false, reason: `${repoRoot} has no commit yet. Workers need a base commit to branch from.` };
  return { ok: true, value: head.output.trim() };
}
