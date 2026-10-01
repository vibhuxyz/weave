import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HARVEST_AUTHOR_EMAIL, HARVEST_AUTHOR_NAME, HARVEST_EXCLUDED_PATHS } from "./constants.ts";
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

async function stageWork(path: string): Promise<WorktreeResult<null>> {
  const added = await runGit(path, ["add", "-A", "--", "."]);
  if (!added.ok) return { ok: false, reason: `Cannot stage the work in ${path}: ${added.output.trim()}` };
  const excluded = await runGit(path, ["reset", "--quiet", "--", ...HARVEST_EXCLUDED_PATHS]);
  if (!excluded.ok) return { ok: false, reason: `Cannot unstage ${HARVEST_EXCLUDED_PATHS.join(", ")} in ${path}: ${excluded.output.trim()}` };
  return { ok: true, value: null };
}

export async function commitAll(path: string, message: string): Promise<WorktreeResult<string>> {
  const added = await stageWork(path);
  if (!added.ok) return added;
  const committed = await commitStaged(path, message);
  if (!committed.ok) return committed;
  const head = await runGit(path, ["rev-parse", "HEAD"]);
  return head.ok ? { ok: true, value: head.output.trim() } : { ok: false, reason: `Cannot read HEAD in ${path}: ${head.output.trim()}` };
}

export async function checkpointWorktree(worktree: Worktree, message: string): Promise<WorktreeResult<string | null>> {
  const added = await stageWork(worktree.path);
  if (!added.ok) return added;
  const committed = await commitStaged(worktree.path, message);
  if (!committed.ok) return committed;

  const head = await runGit(worktree.path, ["rev-parse", "HEAD"]);
  if (!head.ok) return { ok: false, reason: `Cannot read HEAD in ${worktree.path}: ${head.output.trim()}` };
  const headCommit = head.output.trim();
  return { ok: true, value: headCommit === worktree.baseCommit ? null : headCommit };
}

export async function harvestWorktree(worktree: Worktree, message: string): Promise<WorktreeResult<Harvest>> {
  const added = await stageWork(worktree.path);
  if (!added.ok) return added;
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

export interface SnapshotInput {
  readonly repoRoot: string;
  readonly baseCommit: string;
  readonly branch: string;
  readonly files: readonly string[];
  readonly message: string;
}

const AUTHOR_ARGS = ["-c", `user.name=${HARVEST_AUTHOR_NAME}`, "-c", `user.email=${HARVEST_AUTHOR_EMAIL}`] as const;

function isHarvestable(path: string): boolean {
  return !path.split("/").includes("node_modules");
}

async function gitStep(repoRoot: string, args: readonly string[], env?: Readonly<Record<string, string>>): Promise<WorktreeResult<string>> {
  const run = await runGit(repoRoot, args, env ? { env } : {});
  return run.ok ? { ok: true, value: run.output.trim() } : { ok: false, reason: `git ${args[0] ?? ""} failed in ${repoRoot}: ${run.output.trim()}` };
}

async function commitFilesOnBase(input: SnapshotInput, files: readonly string[], scratch: string): Promise<WorktreeResult<Harvest>> {
  const env = { GIT_INDEX_FILE: join(scratch, "index") };
  const pathspec = join(scratch, "pathspec");
  await writeFile(pathspec, files.join("\0"));
  const read = await gitStep(input.repoRoot, ["read-tree", input.baseCommit], env);
  if (!read.ok) return read;
  const added = await gitStep(input.repoRoot, ["add", "-A", `--pathspec-from-file=${pathspec}`, "--pathspec-file-nul"], env);
  if (!added.ok) return added;
  const [tree, baseTree] = await Promise.all([gitStep(input.repoRoot, ["write-tree"], env), gitStep(input.repoRoot, ["rev-parse", `${input.baseCommit}^{tree}`])]);
  if (!tree.ok) return tree;
  if (!baseTree.ok) return baseTree;
  if (tree.value === baseTree.value) return { ok: true, value: { commit: null, files: [] } };
  const commit = await gitStep(input.repoRoot, [...AUTHOR_ARGS, "commit-tree", tree.value, "-p", input.baseCommit, "-m", input.message]);
  if (!commit.ok) return commit;
  const ref = await gitStep(input.repoRoot, ["update-ref", `refs/heads/${input.branch}`, commit.value]);
  if (!ref.ok) return ref;
  const changed = await gitStep(input.repoRoot, ["diff", "--name-only", input.baseCommit, commit.value]);
  return { ok: true, value: { commit: commit.value, files: changed.ok ? [...outputLines(changed.value)].sort() : [] } };
}

export async function snapshotFiles(input: SnapshotInput): Promise<WorktreeResult<Harvest>> {
  const files = [...new Set(input.files.filter(isHarvestable))].sort();
  if (files.length === 0) return { ok: true, value: { commit: null, files: [] } };
  const scratch = await mkdtemp(join(tmpdir(), "weave-snapshot-"));
  try {
    return await commitFilesOnBase(input, files, scratch);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
