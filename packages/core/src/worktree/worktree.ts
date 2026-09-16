import { spawn } from "node:child_process";
import { join } from "node:path";

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
  baseRef?: string;
}

export interface RemoveWorktreeOptions {
  deleteBranch?: boolean;
}

const WEAVE_BRANCH_PREFIX = "weave/";
const WEAVE_BRANCH_REF_PREFIX = "refs/heads/weave/";

function runGit(cwd: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  return new Promise((done) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const collect = (chunk: Buffer) => (output += chunk.toString());
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", () => done({ ok: false, output }));
    child.on("close", (code) => done({ ok: code === 0, output }));
  });
}

function worktreesRoot(weaveDir: string): string {
  return join(weaveDir, "worktrees");
}

export async function createWorktree(input: CreateWorktreeInput): Promise<Worktree> {
  const branch = `${WEAVE_BRANCH_PREFIX}${input.taskId}`;
  const path = join(worktreesRoot(input.weaveDir), input.taskId);
  const baseRef = input.baseRef ?? "HEAD";

  const resolvedBase = await runGit(input.repoRoot, ["rev-parse", baseRef]);
  if (!resolvedBase.ok) {
    throw new Error(`worktree: cannot resolve base ref "${baseRef}": ${resolvedBase.output.trim()}`);
  }
  const baseCommit = resolvedBase.output.trim();

  const added = await runGit(input.repoRoot, ["worktree", "add", "-b", branch, path, baseCommit]);
  if (!added.ok) {
    throw new Error(`worktree: git worktree add failed: ${added.output.trim()}`);
  }

  return { taskId: input.taskId, path, branch, baseCommit };
}

export async function removeWorktree(
  repoRoot: string,
  worktree: Worktree,
  options: RemoveWorktreeOptions = {},
): Promise<void> {
  const removed = await runGit(repoRoot, ["worktree", "remove", "--force", worktree.path]);
  if (!removed.ok) {
    throw new Error(`worktree: git worktree remove failed: ${removed.output.trim()}`);
  }
  if (options.deleteBranch) {
    await runGit(repoRoot, ["branch", "-D", worktree.branch]);
  }
}

function parsePorcelainWorktrees(output: string): Worktree[] {
  const worktrees: Worktree[] = [];
  let path: string | null = null;
  let branch: string | null = null;
  let commit: string | null = null;

  const flush = () => {
    if (path && branch?.startsWith(WEAVE_BRANCH_REF_PREFIX)) {
      worktrees.push({
        taskId: branch.slice(WEAVE_BRANCH_REF_PREFIX.length),
        path,
        branch: branch.slice("refs/heads/".length),
        baseCommit: commit ?? "",
      });
    }
    path = null;
    branch = null;
    commit = null;
  };

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      flush();
      path = line.slice("worktree ".length).trim();
    } else if (line.startsWith("HEAD ")) {
      commit = line.slice("HEAD ".length).trim();
    } else if (line.startsWith("branch ")) {
      branch = line.slice("branch ".length).trim();
    }
  }
  flush();

  return worktrees;
}

export async function listWeaveWorktrees(repoRoot: string): Promise<Worktree[]> {
  const listed = await runGit(repoRoot, ["worktree", "list", "--porcelain"]);
  if (!listed.ok) return [];
  return parsePorcelainWorktrees(listed.output);
}
