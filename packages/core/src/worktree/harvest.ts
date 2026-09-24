import { HARVEST_AUTHOR_EMAIL, HARVEST_AUTHOR_NAME, HARVEST_EXCLUDES } from "./constants.ts";
import { outputLines, runGit } from "./run-git.ts";
import type { Harvest, WorktreeResult } from "./types.ts";
import type { Worktree } from "./worktree.ts";

async function commitStaged(path: string, message: string): Promise<WorktreeResult<null>> {
  const staged = await runGit(path, ["diff", "--cached", "--name-only"]);
  if (!staged.ok) return { ok: false, reason: `Cannot list staged files in ${path}: ${staged.output.trim()}` };
  if (outputLines(staged.output).length === 0) return { ok: true, value: null };
  const committed = await runGit(path, [
    "-c", `user.name=${HARVEST_AUTHOR_NAME}`,
    "-c", `user.email=${HARVEST_AUTHOR_EMAIL}`,
    "commit", "--no-verify", "--quiet", "-m", message,
  ]);
  return committed.ok
    ? { ok: true, value: null }
    : { ok: false, reason: `Cannot commit the work in ${path}: ${committed.output.trim()}` };
}

export async function harvestWorktree(worktree: Worktree, message: string): Promise<WorktreeResult<Harvest>> {
  const added = await runGit(worktree.path, ["add", "-A", "--", ".", ...HARVEST_EXCLUDES]);
  if (!added.ok) return { ok: false, reason: `Cannot stage the work in ${worktree.path}: ${added.output.trim()}` };
  const committed = await commitStaged(worktree.path, message);
  if (!committed.ok) return committed;

  const head = await runGit(worktree.path, ["rev-parse", "HEAD"]);
  if (!head.ok) return { ok: false, reason: `Cannot read HEAD in ${worktree.path}: ${head.output.trim()}` };
  const headCommit = head.output.trim();
  if (headCommit === worktree.baseCommit) return { ok: true, value: { commit: null, files: [] } };

  const changed = await runGit(worktree.path, ["diff", "--name-only", worktree.baseCommit, headCommit]);
  if (!changed.ok) return { ok: false, reason: `Cannot list changed files in ${worktree.path}: ${changed.output.trim()}` };
  return { ok: true, value: { commit: headCommit, files: [...outputLines(changed.output)].sort() } };
}
