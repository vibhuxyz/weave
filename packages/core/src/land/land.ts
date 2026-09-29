import { outputLines, runGit } from "../worktree/index.ts";
import { readGitStatus } from "../shared/index.ts";
import { HARVEST_AUTHOR_EMAIL, HARVEST_AUTHOR_NAME } from "../worktree/constants.ts";
import type { CommitProjectOptions, CommitProjectResult, LandOptions, LandResult } from "./types.ts";

const WEAVE_BRANCH = /^weave\//;
const MAX_LISTED_FILES = 200;

async function revisionOf(repoRoot: string, ref: string): Promise<string | null> {
  const resolved = await runGit(repoRoot, ["rev-parse", "--verify", `${ref}^{commit}`]);
  return resolved.ok ? resolved.output.trim() : null;
}

async function changedBetween(repoRoot: string, from: string | null, to: string): Promise<readonly string[]> {
  const range = from === null ? [to] : [from, to];
  const diff = await runGit(repoRoot, ["diff", "--name-only", ...range]);
  return diff.ok ? [...outputLines(diff.output)].sort().slice(0, MAX_LISTED_FILES) : [];
}

export async function landIntegration(options: LandOptions): Promise<LandResult> {
  const { repoRoot, runBranch, integrationRef } = options;
  if (!WEAVE_BRANCH.test(runBranch)) {
    return { ok: false, reason: `Refusing to move ${runBranch}: a run branch must start with "weave/"` };
  }

  const head = await revisionOf(repoRoot, integrationRef);
  if (head === null) return { ok: false, reason: `Cannot resolve the integration result ${integrationRef}` };

  const previousHead = await revisionOf(repoRoot, runBranch);
  const shouldCheckout = options.checkout ?? true;
  if (shouldCheckout) {
    const status = await readGitStatus(repoRoot);
    if (status.changes.length > 0) {
      const listed = status.changes.map((change) => change.path).sort().slice(0, 10).join(", ");
      return {
        ok: false,
        reason: `${repoRoot} has uncommitted changes (${listed}). The run was not checked out so nothing of yours is overwritten; commit or stash, then land again.`,
      };
    }
  }

  const current = (await runGit(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).output.trim();
  if (current === runBranch) {
    if (!shouldCheckout) {
      return {
        ok: false,
        reason: `${runBranch} is checked out in ${repoRoot}, so landing it must update the working tree; call again with checkout enabled`,
      };
    }
    const reset = await runGit(repoRoot, ["reset", "--hard", "--quiet", head]);
    if (!reset.ok) return { ok: false, reason: `Cannot move ${runBranch} to ${head}: ${reset.output.trim()}` };
  } else {
    const moved = await runGit(repoRoot, ["branch", "--force", runBranch, head]);
    if (!moved.ok) return { ok: false, reason: `Cannot move ${runBranch} to ${head}: ${moved.output.trim()}` };
    if (shouldCheckout) {
      const checkedOut = await runGit(repoRoot, ["checkout", "-q", runBranch]);
      if (!checkedOut.ok) return { ok: false, reason: `Cannot check out ${runBranch}: ${checkedOut.output.trim()}` };
    }
  }

  return {
    ok: true,
    landed: {
      branch: runBranch,
      head,
      previousHead,
      checkedOut: shouldCheckout,
      changedFiles: await changedBetween(repoRoot, previousHead, head),
    },
  };
}

export async function commitProject(options: CommitProjectOptions): Promise<CommitProjectResult> {
  const { repoRoot, runBranch, message } = options;
  if (!WEAVE_BRANCH.test(runBranch)) {
    return { ok: false, reason: `Refusing to commit onto ${runBranch}: a run branch must start with "weave/"` };
  }
  const current = (await runGit(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).output.trim();
  if (current !== runBranch) {
    return { ok: false, reason: `${repoRoot} is on ${current}, not ${runBranch}; open the workspace before committing the run` };
  }

  const before = await revisionOf(repoRoot, "HEAD");
  const staged = await runGit(repoRoot, ["add", "-A", "--", "."]);
  if (!staged.ok) return { ok: false, reason: `Cannot stage the run's work: ${staged.output.trim()}` };

  const pending = await runGit(repoRoot, ["diff", "--cached", "--name-only"]);
  if (outputLines(pending.output).length === 0) {
    return { ok: true, committed: { branch: runBranch, commit: null, changedFiles: [] } };
  }

  const committed = await runGit(repoRoot, [
    "-c", `user.name=${HARVEST_AUTHOR_NAME}`,
    "-c", `user.email=${HARVEST_AUTHOR_EMAIL}`,
    "commit", "--no-verify", "--quiet", "-m", message,
  ]);
  if (!committed.ok) return { ok: false, reason: `Cannot commit the run's work: ${committed.output.trim()}` };

  const head = await revisionOf(repoRoot, "HEAD");
  if (head === null) return { ok: false, reason: "Cannot read HEAD after committing the run" };
  return {
    ok: true,
    committed: { branch: runBranch, commit: head, changedFiles: await changedBetween(repoRoot, before, head) },
  };
}
