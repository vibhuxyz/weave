import { checkCleanBase, runGit, type WorktreeResult } from "../worktree/index.ts";
import { RUN_BRANCH_PREFIX, SAFE_RUN_ID } from "./constants.ts";
import type { RunBranch } from "./types.ts";

const DETACHED_HEAD = "HEAD";

export function runBranchName(runId: string): string {
  return `${RUN_BRANCH_PREFIX}${runId}`;
}

export async function currentBranchOf(repoRoot: string): Promise<string | null> {
  const branch = await runGit(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch.ok) return null;
  const name = branch.output.trim();
  return name === "" || name === DETACHED_HEAD ? null : name;
}

export async function createRunBranch(repoRoot: string, runId: string): Promise<WorktreeResult<RunBranch>> {
  if (!SAFE_RUN_ID.test(runId) || runId.includes("..")) {
    return { ok: false, reason: `Run id "${runId}" must be letters, digits, ".", "_" or "-"` };
  }
  const clean = await checkCleanBase(repoRoot);
  if (!clean.ok) return clean;

  const name = runBranchName(runId);
  const exists = await runGit(repoRoot, ["rev-parse", "--verify", `refs/heads/${name}`]);
  if (exists.ok) return { ok: false, reason: `Branch ${name} already exists in ${repoRoot}` };

  const previousBranch = await currentBranchOf(repoRoot);
  const created = await runGit(repoRoot, ["checkout", "-q", "-b", name]);
  if (!created.ok) return { ok: false, reason: `Cannot create ${name}: ${created.output.trim()}` };

  return { ok: true, value: { name, previousBranch, baseCommit: clean.value } };
}

export async function restoreBranch(repoRoot: string, branch: string): Promise<WorktreeResult<string>> {
  const restored = await runGit(repoRoot, ["checkout", "-q", branch]);
  return restored.ok
    ? { ok: true, value: branch }
    : { ok: false, reason: `Cannot return to ${branch}: ${restored.output.trim()}` };
}
