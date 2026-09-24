import { runGit } from "../worktree/index.ts";

const MERGE_AUTHOR = ["-c", "user.name=Weave", "-c", "user.email=weave@localhost"] as const;
const MAX_LISTED_CONFLICTS = 10;

export type MergeAttempt =
  | { readonly status: "merged"; readonly commit: string }
  | { readonly status: "conflict"; readonly files: readonly string[] }
  | { readonly status: "merge-error"; readonly detail: string };

function lines(output: string): readonly string[] {
  return output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
}

export async function mergeBranch(cwd: string, branch: string, message: string): Promise<MergeAttempt> {
  const merged = await runGit(cwd, [...MERGE_AUTHOR, "merge", "--no-ff", "--no-edit", "-m", message, branch]);
  if (merged.ok) {
    const head = await runGit(cwd, ["rev-parse", "HEAD"]);
    return head.ok
      ? { status: "merged", commit: head.output.trim() }
      : { status: "merge-error", detail: `merged ${branch} but cannot read HEAD: ${head.output.trim()}` };
  }
  const conflicted = await runGit(cwd, ["diff", "--name-only", "--diff-filter=U"]);
  const aborted = await runGit(cwd, ["merge", "--abort"]);
  const files = [...lines(conflicted.output)].sort();
  if (files.length > 0) return { status: "conflict", files };
  const abortNote = aborted.ok ? "" : ` (merge --abort also failed: ${aborted.output.trim()})`;
  return { status: "merge-error", detail: `git merge ${branch} failed: ${merged.output.trim()}${abortNote}` };
}

export function describeConflict(files: readonly string[]): string {
  const listed = files.slice(0, MAX_LISTED_CONFLICTS).join(", ");
  const more = files.length > MAX_LISTED_CONFLICTS ? ` (+${files.length - MAX_LISTED_CONFLICTS} more)` : "";
  return `conflicts with earlier merges in ${listed}${more}`;
}
