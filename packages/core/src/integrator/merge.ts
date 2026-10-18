import { mapBounded } from "../shared/index.ts";
import { runGit } from "../worktree/index.ts";
import { hasConflictMarkers } from "./conflict-markers.ts";

const MERGE_AUTHOR = ["-c", "user.name=Weave", "-c", "user.email=weave@localhost"] as const;
const MAX_LISTED_CONFLICTS = 10;
const MARKER_CHECK_CONCURRENCY = 8;

export type MergeAttempt =
  | { readonly status: "merged"; readonly commit: string }
  | { readonly status: "conflict"; readonly files: readonly string[] }
  | { readonly status: "merge-error"; readonly detail: string };

function nulSeparated(output: string): readonly string[] {
  return output.split("\0").filter((path) => path.length > 0);
}

async function headAfter(cwd: string, what: string): Promise<MergeAttempt> {
  const head = await runGit(cwd, ["rev-parse", "HEAD"]);
  return head.ok
    ? { status: "merged", commit: head.output.trim() }
    : { status: "merge-error", detail: `${what} but cannot read HEAD: ${head.output.trim()}` };
}

async function unmergedFiles(cwd: string): Promise<readonly string[]> {
  const listed = await runGit(cwd, ["diff", "--name-only", "-z", "--diff-filter=U"]);
  return [...nulSeparated(listed.output)].sort();
}

export async function readHead(cwd: string): Promise<string | null> {
  const head = await runGit(cwd, ["rev-parse", "HEAD"]);
  return head.ok ? head.output.trim() : null;
}

export async function mergeBranch(cwd: string, branch: string, message: string): Promise<MergeAttempt> {
  const merged = await runGit(cwd, [...MERGE_AUTHOR, "merge", "--no-ff", "--no-edit", "-m", message, branch]);
  if (merged.ok) return headAfter(cwd, `merged ${branch}`);
  const files = await unmergedFiles(cwd);
  if (files.length > 0) return { status: "conflict", files };
  const aborted = await runGit(cwd, ["merge", "--abort"]);
  const abortNote = aborted.ok ? "" : ` (merge --abort also failed: ${aborted.output.trim()})`;
  return { status: "merge-error", detail: `git merge ${branch} failed: ${merged.output.trim()}${abortNote}` };
}

export async function rollBackMerge(cwd: string, head: string): Promise<string | null> {
  const reset = await runGit(cwd, ["reset", "--hard", head]);
  if (!reset.ok) return `git reset --hard ${head} failed: ${reset.output.trim()}`;
  const cleaned = await runGit(cwd, ["clean", "-fd"]);
  return cleaned.ok ? null : `git clean -fd failed: ${cleaned.output.trim()}`;
}

async function filesWithMarkers(cwd: string, files: readonly string[]): Promise<readonly string[]> {
  const checked = await mapBounded(files, MARKER_CHECK_CONCURRENCY, async (file) => {
    const staged = await runGit(cwd, ["show", `:${file}`]);
    return staged.ok && hasConflictMarkers(staged.output) ? [file] : [];
  });
  return checked.flat().sort();
}

export async function concludeMerge(cwd: string, files: readonly string[]): Promise<MergeAttempt> {
  const staged = await runGit(cwd, ["add", "-A"]);
  if (!staged.ok) return { status: "merge-error", detail: `git add -A failed after resolving conflicts: ${staged.output.trim()}` };
  const unmerged = await unmergedFiles(cwd);
  if (unmerged.length > 0) return { status: "conflict", files: unmerged };
  const marked = await filesWithMarkers(cwd, files);
  if (marked.length > 0) return { status: "conflict", files: marked };
  const committed = await runGit(cwd, [...MERGE_AUTHOR, "commit", "--no-edit"]);
  if (!committed.ok) return { status: "merge-error", detail: `git commit failed after resolving conflicts: ${committed.output.trim()}` };
  return headAfter(cwd, "committed the resolved merge");
}

export function listFiles(files: readonly string[]): string {
  const listed = files.slice(0, MAX_LISTED_CONFLICTS).join(", ");
  const more = files.length > MAX_LISTED_CONFLICTS ? ` (+${files.length - MAX_LISTED_CONFLICTS} more)` : "";
  return `${listed}${more}`;
}

export function describeConflict(files: readonly string[]): string {
  return `conflicts with earlier merges in ${listFiles(files)}`;
}
