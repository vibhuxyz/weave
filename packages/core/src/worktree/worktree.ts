import { join } from "node:path";
import { runGit } from "./run-git.ts";

export interface Worktree {
  taskId: string;
  path: string;
  branch: string;
  baseCommit: string;
}

export interface CreateWorktreeInput {
  repoRoot: string;
  weaveDir: string;
  taskId: string;
  runId?: string;
  baseRef?: string;
}

export interface RemoveWorktreeOptions {
  deleteBranch?: boolean;
}

const WEAVE_BRANCH_PREFIX = "weave/";
const WEAVE_BRANCH_REF_PREFIX = "refs/heads/weave/";
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function worktreesRoot(weaveDir: string): string {
  return join(weaveDir, "worktrees");
}

function assertSafeName(kind: string, name: string): void {
  if (!SAFE_NAME.test(name) || name.includes("..")) {
    throw new Error(`worktree: ${kind} "${name}" must be letters, digits, ".", "_" or "-"`);
  }
}

function namesFor(input: CreateWorktreeInput): { branch: string; path: string } {
  assertSafeName("task id", input.taskId);
  if (input.runId === undefined) {
    return {
      branch: `${WEAVE_BRANCH_PREFIX}${input.taskId}`,
      path: join(worktreesRoot(input.weaveDir), input.taskId),
    };
  }
  assertSafeName("run id", input.runId);
  return {
    branch: `${WEAVE_BRANCH_PREFIX}${input.runId}/${input.taskId}`,
    path: join(worktreesRoot(input.weaveDir), input.runId, input.taskId),
  };
}

export async function createWorktree(input: CreateWorktreeInput): Promise<Worktree> {
  const { branch, path } = namesFor(input);
  const baseRef = input.baseRef ?? "HEAD";

  const resolvedBase = await runGit(input.repoRoot, ["rev-parse", "--verify", `${baseRef}^{commit}`]);
  if (!resolvedBase.ok) {
    throw new Error(`worktree: cannot resolve base ref "${baseRef}": ${resolvedBase.output.trim()}`);
  }
  const baseCommit = resolvedBase.output.trim();

  const added = await runGit(input.repoRoot, ["worktree", "add", "-b", branch, path, baseCommit]);
  if (!added.ok) {
    throw new Error(`worktree: git worktree add failed for ${input.taskId}: ${added.output.trim()}`);
  }

  return { taskId: input.taskId, path, branch, baseCommit };
}

export async function removeWorktree(
  repoRoot: string,
  worktree: Worktree,
  options: RemoveWorktreeOptions = {},
): Promise<void> {
  const removed = await runGit(repoRoot, ["worktree", "remove", "--force", "--force", worktree.path]);
  if (!removed.ok) {
    throw new Error(`worktree: git worktree remove failed for ${worktree.path}: ${removed.output.trim()}`);
  }
  await pruneWorktrees(repoRoot);
  if (options.deleteBranch) {
    await runGit(repoRoot, ["branch", "-D", worktree.branch]);
  }
}

export async function pruneWorktrees(repoRoot: string): Promise<void> {
  const pruned = await runGit(repoRoot, ["worktree", "prune"]);
  if (!pruned.ok) throw new Error(`worktree: git worktree prune failed: ${pruned.output.trim()}`);
}

function parsePorcelainWorktrees(output: string): Worktree[] {
  return output
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const fields = new Map(
        block.split(/\r?\n/).map((line) => {
          const space = line.indexOf(" ");
          return space === -1 ? [line, ""] : [line.slice(0, space), line.slice(space + 1).trim()];
        }),
      );
      const path = fields.get("worktree");
      const branch = fields.get("branch");
      if (!path || !branch?.startsWith(WEAVE_BRANCH_REF_PREFIX)) return null;
      const weaveName = branch.slice(WEAVE_BRANCH_REF_PREFIX.length);
      return {
        taskId: weaveName.slice(weaveName.lastIndexOf("/") + 1),
        path,
        branch: branch.slice("refs/heads/".length),
        baseCommit: fields.get("HEAD") ?? "",
      };
    })
    .filter((worktree): worktree is Worktree => worktree !== null);
}

export async function listWeaveWorktrees(repoRoot: string): Promise<Worktree[]> {
  const listed = await runGit(repoRoot, ["worktree", "list", "--porcelain"]);
  if (!listed.ok) return [];
  return parsePorcelainWorktrees(listed.output);
}
